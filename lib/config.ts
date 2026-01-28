import prisma from "./db";

export async function getGlobalConfig() {
  const dbConfig = await prisma.globalConfig.findUnique({
    where: { id: "default" },
  });

  return {
    twitchClientId: dbConfig?.twitchClientId || process.env.TWITCH_CLIENT_ID,
    twitchClientSecret: dbConfig?.twitchClientSecret || process.env.TWITCH_CLIENT_SECRET,
    twitchWebhookSecret: dbConfig?.twitchWebhookSecret || process.env.TWITCH_WEBHOOK_SECRET,
    appBaseUrl: dbConfig?.appBaseUrl || process.env.BASE_URL,
    // Helper to check if we have everything
    isConfigured: !!(
      (dbConfig?.twitchClientId || process.env.TWITCH_CLIENT_ID) &&
      (dbConfig?.twitchClientSecret || process.env.TWITCH_CLIENT_SECRET) &&
      (dbConfig?.twitchWebhookSecret || process.env.TWITCH_WEBHOOK_SECRET) &&
      (dbConfig?.appBaseUrl || process.env.BASE_URL)
    ),
  };
}
