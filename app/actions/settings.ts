"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function updateGlobalConfig(formData: FormData) {
  const twitchClientId = formData.get("twitchClientId") as string;
  const twitchClientSecret = formData.get("twitchClientSecret") as string;
  const twitchWebhookSecret = formData.get("twitchWebhookSecret") as string;
  const appBaseUrl = formData.get("appBaseUrl") as string;

  await prisma.globalConfig.upsert({
    where: { id: "default" },
    update: {
      twitchClientId,
      twitchClientSecret,
      twitchWebhookSecret,
      appBaseUrl,
    },
    create: {
      id: "default",
      twitchClientId,
      twitchClientSecret,
      twitchWebhookSecret,
      appBaseUrl,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/");
}
