"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { subscribeToChatEvents } from "@/lib/twitch-api";

export async function updateGlobalConfig(prevState: any, formData: FormData) {
  const twitchClientId = formData.get("twitchClientId") as string;
  const twitchClientSecret = formData.get("twitchClientSecret") as string;
  const twitchWebhookSecret = formData.get("twitchWebhookSecret") as string;
  const appBaseUrl = formData.get("appBaseUrl") as string;
  const twitchChannel = formData.get("twitchChannel") as string;

  try {
    await prisma.globalConfig.upsert({
      where: { id: "default" },
      update: {
        twitchClientId,
        twitchClientSecret,
        twitchWebhookSecret,
        appBaseUrl,
        twitchChannel,
      },
      create: {
        id: "default",
        twitchClientId,
        twitchClientSecret,
        twitchWebhookSecret,
        appBaseUrl,
        twitchChannel,
      },
    });

    revalidatePath("/settings");
    revalidatePath("/");
    
    return { success: true, message: "Settings saved to Postgres successfully!" };
  } catch (error) {
    console.error("Failed to save settings:", error);
    return { success: false, message: "Failed to save settings to database." };
  }
}

export async function subscribeToChat(prevState: any, formData: FormData) {
  try {
    const config = await prisma.globalConfig.findUnique({ where: { id: "default" } });
    if (!config?.appBaseUrl) {
        return { success: false, message: "Base URL is not set in settings." };
    }

    const result = await subscribeToChatEvents(config.appBaseUrl);
    
    if (result.success) {
        return { success: true, message: "Successfully subscribed to chat events!" };
    } else {
        // Return the actual error message so the client can see it
        return { success: false, message: `Failed: ${result.error}` };
    }
  } catch (error: any) {
    console.error("Subscribe error:", error);
    return { success: false, message: `Internal error: ${error.message}` };
  }
}
