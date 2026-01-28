
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getAppAccessToken() {
  const config = await prisma.globalConfig.findUnique({ where: { id: "default" } });
  
  if (!config?.twitchClientId || !config?.twitchClientSecret) {
    console.error("Missing Client ID or Secret for App Token");
    return null;
  }

  try {
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.twitchClientId,
        client_secret: config.twitchClientSecret,
        grant_type: "client_credentials",
      }),
    });

    if (!response.ok) {
      console.error("Failed to get App Access Token", await response.text());
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("Error fetching App Access Token:", error);
    return null;
  }
}

async function debugSubscribeDetailed() {
   const token = await getAppAccessToken();
   const config = await prisma.globalConfig.findUnique({ where: { id: "default" } });

   if (!token || !config?.twitchClientId || !config?.botUserId || !config?.twitchWebhookSecret) {
     console.error("Cannot subscribe: Missing config or webhook secret");
     return;
   }

   // 1. Check if the user ID matches the client ID's owner? 
   // Actually, channel.chat.message requires 'user:read:chat' scope AND 
   // the condition usually requires user_id to be the authenticated user (if using user token)
   // OR if using App Token, we need to check if we can subscribe to ANY channel.
   // Wait, channel.chat.message documentation says:
   // "Authorization: Requires a user access token that includes the user:read:chat scope."
   // IT DOES NOT SUPPORT APP ACCESS TOKENS for Webhooks? 
   // Let's verify this hypothesis.

   console.log("Attempting subscription with App Token...");
   
   const body = {
        type: "channel.chat.message",
        version: "1",
        condition: {
            broadcaster_user_id: config.botUserId,
            user_id: config.botUserId 
        },
        transport: {
            method: "webhook",
            callback: `${config.appBaseUrl.replace(/\/$/, "")}/api/webhooks/twitch`,
            secret: config.twitchWebhookSecret
        }
    };

    const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
        method: "POST",
        headers: {
             "Client-ID": config.twitchClientId,
             "Authorization": `Bearer ${token}`,
             "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
     });

     const text = await response.text();
     console.log("App Token Response:", response.status, text);

     // 2. Try with User Token if App Token failed
     if (response.status === 403 || response.status === 401 || response.status === 400) {
        console.log("\nAttempting subscription with USER Token...");
        
        if (!config.accessToken) {
            console.log("No User Token available.");
            return;
        }

        const responseUser = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
            method: "POST",
            headers: {
                 "Client-ID": config.twitchClientId,
                 "Authorization": `Bearer ${config.accessToken}`,
                 "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
         });
    
         const textUser = await responseUser.text();
         console.log("User Token Response:", responseUser.status, textUser);
     }
}

debugSubscribeDetailed()
  .catch(console.error)
  .finally(async () => await prisma.$disconnect());
