import { getGlobalConfig } from "./config";
import prisma from "./db";

// Types
export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
}

export interface Chatter {
  user_id: string;
  user_login: string;
  user_name: string;
}

/**
 * Validates and refreshes the access token if needed.
 * Returns the valid token or null if authentication is missing/broken.
 */
async function getValidAccessToken(): Promise<string | null> {
  const config = await prisma.globalConfig.findUnique({ where: { id: "default" } });
  
  if (!config?.accessToken || !config.refreshToken) {
    return null;
  }

  // Check expiration (buffer of 5 minutes)
  const now = new Date();
  if (config.tokenExpiresAt && config.tokenExpiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return config.accessToken;
  }

  // Refresh Token
  try {
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.twitchClientId!,
        client_secret: config.twitchClientSecret!,
        grant_type: "refresh_token",
        refresh_token: config.refreshToken,
      }),
    });

    if (!response.ok) {
      console.error("Failed to refresh token", await response.text());
      return null;
    }

    const data = await response.json();
    const newExpiry = new Date(Date.now() + data.expires_in * 1000);

    await prisma.globalConfig.update({
      where: { id: "default" },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        tokenExpiresAt: newExpiry,
      },
    });

    return data.access_token;
  } catch (error) {
    console.error("Error refreshing token:", error);
    return null;
  }
}

/**
 * Resolves a username to a User ID using Helix.
 */
export async function getTwitchUserId(username: string): Promise<string | null> {
  const token = await getValidAccessToken();
  const config = await getGlobalConfig();
  
  if (!token || !config.twitchClientId) return null;

  try {
    const response = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
      headers: {
        "Client-ID": config.twitchClientId,
        "Authorization": `Bearer ${token}`,
      },
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.data?.[0]?.id || null;
  } catch (e) {
    console.error("Failed to resolve user ID:", e);
    return null;
  }
}

/**
 * Fetches the current list of chatters for the configured channel.
 */
export async function getLiveChatters(): Promise<{ count: number; chatters: Chatter[]; error?: string }> {
  const token = await getValidAccessToken();
  const config = await prisma.globalConfig.findUnique({ where: { id: "default" } });

  if (!token || !config?.twitchClientId || !config?.botUserId) {
    console.warn("Cannot fetch chatters: Missing token or bot ID.");
    return { count: 0, chatters: [] };
  }

  // Determine target channel: Explicit config > Bot's own channel
  const targetChannelName = config.twitchChannel || config.botUserName;

  if (!targetChannelName) {
    console.warn("Cannot fetch chatters: No channel configured and no bot user known.");
    return { count: 0, chatters: [] };
  }

  // Optimize: If target is bot, use botUserId
  let broadcasterId: string | null = null;
  if (config.botUserName && targetChannelName.toLowerCase() === config.botUserName.toLowerCase()) {
    broadcasterId = config.botUserId;
  } else {
    broadcasterId = await getTwitchUserId(targetChannelName);
  }

  if (!broadcasterId) {
    return { count: 0, chatters: [] };
  }

  try {
    // Helix Get Chatters
    // Requires moderator:read:chatters scope and moderator_id (bot) + broadcaster_id (channel)
    const response = await fetch(
      `https://api.twitch.tv/helix/chat/chatters?broadcaster_id=${broadcasterId}&moderator_id=${config.botUserId}&first=100`,
      {
        headers: {
          "Client-ID": config.twitchClientId,
          "Authorization": `Bearer ${token}`,
        },
        next: { revalidate: 30 } // Cache for 30s to avoid rate limits
      }
    );

    if (!response.ok) {
      console.error("Helix Chatters API Error:", await response.text());
      return { count: 0, chatters: [] };
    }

    const data = await response.json();
    
    // START LURKING: Track these users in the database
    // We do this asynchronously to not block the UI response too much, 
    // but in Server Actions/Components we should ideally await it or use a queue.
    // Given the constraints, we'll await it to ensure data consistency.
    if (data.data && data.data.length > 0) {
      try {
        // 1. Ensure Channel Exists
        await prisma.channel.upsert({
          where: { twitchId: broadcasterId },
          update: { name: targetChannelName },
          create: { twitchId: broadcasterId, name: targetChannelName }
        });

        // 2. Upsert Users (Batch or Loop)
        // Prisma doesn't support "upsertMany" natively for SQLite/Postgres in the same way,
        // but we can use transaction or just Promise.all for now (limit 100 is small enough).
        await Promise.all(data.data.map((chatter: Chatter) => 
          prisma.user.upsert({
            where: { twitchId: chatter.user_id },
            update: { 
              displayName: chatter.user_name,
              updatedAt: new Date() // Updates 'last seen' effectively
            },
            create: {
              twitchId: chatter.user_id,
              displayName: chatter.user_name
            }
          })
        ));
      } catch (dbError) {
        console.error("Failed to track chatters in DB:", dbError);
      }
    }

    return {
      count: data.total,
      chatters: data.data, // List of { user_id, user_login, user_name }
    };
  } catch (error: any) {
    console.error("Failed to fetch chatters:", error);
    return { count: 0, chatters: [], error: `Internal Error: ${error.message}` };
  }
}
