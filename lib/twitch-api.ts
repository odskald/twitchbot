import { getGlobalConfig } from "./config";
import prisma from "./db";
import { calculateLevel } from "./leveling";

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
  // Enriched fields from DB
  points?: number;
  level?: number;
  xp?: number;
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
    // Helix Get Chatters (Pagination Loop)
    let allChatters: Chatter[] = [];
    let cursor: string | undefined = undefined;
    let totalCount = 0;

    do {
      const cursorParam: string = cursor ? `&after=${cursor}` : "";
      const response = await fetch(
        `https://api.twitch.tv/helix/chat/chatters?broadcaster_id=${broadcasterId}&moderator_id=${config.botUserId}&first=1000${cursorParam}`,
        {
          headers: {
            "Client-ID": config.twitchClientId,
            "Authorization": `Bearer ${token}`,
          },
          next: { revalidate: 30 } // Cache for 30s
        }
      );

      if (!response.ok) {
        console.error("Helix Chatters API Error:", await response.text());
        break; // Stop fetching on error, return what we have
      }

      const data = await response.json();
      const pageChatters: Chatter[] = data.data || [];
      allChatters = [...allChatters, ...pageChatters];
      totalCount = data.total; // Total is usually reported in the first response
      cursor = data.pagination?.cursor;

    } while (cursor);

    let enrichedChatters = allChatters;
    
    // START LURKING: Track these users in the database
    if (enrichedChatters.length > 0) {
      try {
        // 1. Ensure Channel Exists
        await prisma.channel.upsert({
          where: { twitchId: broadcasterId },
          update: { name: targetChannelName },
          create: { twitchId: broadcasterId, name: targetChannelName }
        });

        // 2. Upsert Users & Award Points/XP (Process in Chunks to avoid DB overload)
        const now = new Date();
        const MAX_LURK_GAP_MS = 10 * 60 * 1000; // 10 minutes max gap to award points
        const MIN_LURK_GAP_MS = 60 * 1000;      // 1 minute minimum to award points
        
        // Fetch existing users (Chunked fetch if list is huge, but here we do one go for <2000 users)
        // If >2000 users, we should probably chunk this too. Let's do simple chunking.
        const CHUNK_SIZE = 100;
        const chunks = [];
        for (let i = 0; i < enrichedChatters.length; i += CHUNK_SIZE) {
          chunks.push(enrichedChatters.slice(i, i + CHUNK_SIZE));
        }

        for (const chunk of chunks) {
          const userIds = chunk.map(c => c.user_id);
          const existingUsers = await prisma.user.findMany({
            where: { twitchId: { in: userIds } }
          });
          const existingUserMap = new Map(existingUsers.map(u => [u.twitchId, u]));

          await Promise.all(chunk.map(async (chatter: Chatter) => {
            const dbUser = existingUserMap.get(chatter.user_id);
            
            let pointsToAdd = 0;
            let xpToAdd = 0;
            let shouldUpdateTimestamp = false;

            if (dbUser) {
              const diffMs = now.getTime() - dbUser.updatedAt.getTime();
              
              if (diffMs >= MIN_LURK_GAP_MS && diffMs <= MAX_LURK_GAP_MS) {
                const minutes = Math.floor(diffMs / 60000);
                pointsToAdd = minutes * 1; 
                xpToAdd = minutes * 3;     
                shouldUpdateTimestamp = true;
              } else if (diffMs > MAX_LURK_GAP_MS) {
                // Gap too large (new session), just reset timestamp
                shouldUpdateTimestamp = true;
              }
            } else {
              // New user, just create
              shouldUpdateTimestamp = true;
            }

            // Optimization: Skip DB write if nothing changed
            // We only write if:
            // 1. It's a new user (!dbUser)
            // 2. Points/XP were awarded (pointsToAdd > 0)
            // 3. We need to reset timestamp (shouldUpdateTimestamp - usually means gap > MAX or points awarded)
            // 4. Name changed (dbUser.displayName !== chatter.user_name)
            
            const nameChanged = dbUser && dbUser.displayName !== chatter.user_name;
            const hasProgress = pointsToAdd > 0 || xpToAdd > 0;
            
            // If existing user AND no progress AND no timestamp update needed AND name hasn't changed
            // THEN SKIP to prevent updating 'updatedAt' prematurely
            if (dbUser && !hasProgress && !shouldUpdateTimestamp && !nameChanged) {
              return; 
            }

            // Calculate new stats
            const currentXp = (dbUser?.xp || 0) + xpToAdd;
            const currentPoints = (dbUser?.points || 0) + pointsToAdd;
            const { level } = calculateLevel(currentXp);

            const updateData: any = {
              displayName: chatter.user_name,
              points: currentPoints,
              xp: currentXp,
              level: level
            };

            if (shouldUpdateTimestamp) {
              updateData.updatedAt = now;
            }

            await prisma.user.upsert({
              where: { twitchId: chatter.user_id },
              update: updateData,
              create: {
                twitchId: chatter.user_id,
                displayName: chatter.user_name,
                points: 0,
                level: 1,
                xp: 0,
                updatedAt: now
              }
            });
          }));
        }

        // 3. Fetch Enriched Data (Points, Level, XP) - Re-fetch updated data
        // For display purposes, we might just want to return what we just calculated, 
        // but fetching ensures consistency. We can fetch all at once or per chunk.
        // For simplicity and "100%" correctness of data returned:
        const allUserIds = enrichedChatters.map(c => c.user_id);
        const dbUsers = await prisma.user.findMany({
          where: { twitchId: { in: allUserIds } },
          select: { twitchId: true, points: true, level: true, xp: true }
        });

        // 4. Merge Data
        const dbUserMap = new Map(dbUsers.map(u => [u.twitchId, u]));
        enrichedChatters = enrichedChatters.map(chatter => {
          const dbUser = dbUserMap.get(chatter.user_id);
          return {
            ...chatter,
            points: dbUser?.points || 0,
            level: dbUser?.level || 1,
            xp: dbUser?.xp || 0
          };
        });

      } catch (dbError) {
        console.error("Failed to track chatters in DB:", dbError);
      }
    }

    return {
      count: totalCount || enrichedChatters.length,
      chatters: enrichedChatters, 
    };
  } catch (error: any) {
    console.error("Failed to fetch chatters:", error);
    return { count: 0, chatters: [], error: `Internal Error: ${error.message}` };
  }
}

/**
 * Sends a chat message to the channel.
 */
export async function sendChatMessage(message: string): Promise<boolean> {
  const token = await getValidAccessToken();
  const config = await prisma.globalConfig.findUnique({ where: { id: "default" } });

  if (!token || !config?.twitchClientId || !config?.botUserId) {
    console.error("Cannot send message: Missing configuration");
    return false;
  }

  // Determine target channel ID
  const targetChannelName = config.twitchChannel || config.botUserName;
  let broadcasterId = config.botUserId; // Default to bot's own channel

  if (targetChannelName && targetChannelName.toLowerCase() !== config.botUserName?.toLowerCase()) {
     const resolvedId = await getTwitchUserId(targetChannelName);
     if (resolvedId) broadcasterId = resolvedId;
  }

  try {
    const response = await fetch("https://api.twitch.tv/helix/chat/messages", {
        method: "POST",
        headers: {
            "Client-ID": config.twitchClientId,
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            broadcaster_id: broadcasterId,
            sender_id: config.botUserId,
            message: message
        })
    });

    if (!response.ok) {
        console.error("Failed to send chat message:", await response.text());
        return false;
    }
    return true;
  } catch (error) {
    console.error("Error sending chat message:", error);
    return false;
  }
}

/**
 * Subscribes to chat message events via EventSub Webhook.
 */
export async function subscribeToChatEvents(baseUrl: string): Promise<boolean> {
   const token = await getValidAccessToken();
   const config = await prisma.globalConfig.findUnique({ where: { id: "default" } });

   if (!token || !config?.twitchClientId || !config?.botUserId || !config?.twitchWebhookSecret) {
     console.error("Cannot subscribe: Missing config or webhook secret");
     return false;
   }

   // Determine broadcaster ID
   const targetChannelName = config.twitchChannel || config.botUserName;
   let broadcasterId = config.botUserId;
   if (targetChannelName && targetChannelName.toLowerCase() !== config.botUserName?.toLowerCase()) {
      const resolvedId = await getTwitchUserId(targetChannelName);
      if (resolvedId) broadcasterId = resolvedId;
   }

   try {
     const response = await fetch("https://api.twitch.tv/helix/eventsub/subscriptions", {
        method: "POST",
        headers: {
             "Client-ID": config.twitchClientId,
             "Authorization": `Bearer ${token}`,
             "Content-Type": "application/json"
        },
        body: JSON.stringify({
            type: "channel.chat.message",
            version: "1",
            condition: {
                broadcaster_user_id: broadcasterId,
                user_id: config.botUserId 
            },
            transport: {
                method: "webhook",
                callback: `${baseUrl}/api/webhooks/twitch`,
                secret: config.twitchWebhookSecret
            }
        })
     });

     if (!response.ok) {
        // If already subscribed, it might return 409 or 400. 
        // 409 Conflict: Subscription already exists. This is fine.
        if (response.status === 409) return true;
        
        const text = await response.text();
        console.error("Failed to subscribe to chat events:", text);
        return false;
     }
     
     return true;
   } catch (error) {
     console.error("Error subscribing to chat events:", error);
     return false;
   }
}
