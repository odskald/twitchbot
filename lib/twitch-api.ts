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
    let enrichedChatters: Chatter[] = data.data || [];
    
    // START LURKING: Track these users in the database
    if (enrichedChatters.length > 0) {
      try {
        // 1. Ensure Channel Exists
        await prisma.channel.upsert({
          where: { twitchId: broadcasterId },
          update: { name: targetChannelName },
          create: { twitchId: broadcasterId, name: targetChannelName }
        });

        // 2. Upsert Users & Award Points/XP
        // We track 'updatedAt' to calculate time spent since last check.
        const now = new Date();
        const MAX_LURK_GAP_MS = 10 * 60 * 1000; // 10 minutes max gap to award points (prevents huge jumps if bot was off)
        const MIN_LURK_GAP_MS = 60 * 1000;      // 1 minute minimum to award points

        // Fetch existing users first to check their last seen time
        const userIds = enrichedChatters.map(c => c.user_id);
        const existingUsers = await prisma.user.findMany({
          where: { twitchId: { in: userIds } }
        });
        const existingUserMap = new Map(existingUsers.map(u => [u.twitchId, u]));

        await Promise.all(enrichedChatters.map(async (chatter: Chatter) => {
          const dbUser = existingUserMap.get(chatter.user_id);
          
          let pointsToAdd = 0;
          let xpToAdd = 0;
          let shouldUpdateTimestamp = false;

          if (dbUser) {
            const diffMs = now.getTime() - dbUser.updatedAt.getTime();
            
            // Only award if within valid window (active session)
            if (diffMs >= MIN_LURK_GAP_MS && diffMs <= MAX_LURK_GAP_MS) {
              const minutes = Math.floor(diffMs / 60000);
              pointsToAdd = minutes * 1; // 1 point per minute
              xpToAdd = minutes * 3;     // 3 XP per minute
              shouldUpdateTimestamp = true;
            } else if (diffMs > MAX_LURK_GAP_MS) {
              // Gap too large (new session), just reset timestamp
              shouldUpdateTimestamp = true;
            }
          } else {
            // New user, just create
            shouldUpdateTimestamp = true;
          }

          // Calculate new stats
          const currentXp = (dbUser?.xp || 0) + xpToAdd;
          const currentPoints = (dbUser?.points || 0) + pointsToAdd;
          const { level } = calculateLevel(currentXp);

          // Perform Upsert
          // If we are awarding points, we update 'updatedAt' to 'now' to consume the time.
          // If we are NOT awarding (diff < 1 min), we keep old 'updatedAt' so time accumulates.
          // UNLESS it's a new user or a stale session, then we force update.
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

        // 3. Fetch Enriched Data (Points, Level, XP)
        const userIds = enrichedChatters.map(c => c.user_id);
        const dbUsers = await prisma.user.findMany({
          where: { twitchId: { in: userIds } },
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
      count: data.total,
      chatters: enrichedChatters, 
    };
  } catch (error: any) {
    console.error("Failed to fetch chatters:", error);
    return { count: 0, chatters: [], error: `Internal Error: ${error.message}` };
  }
}
