"use server";

import prisma from "@/lib/db";

export async function testFollowAlert() {
  try {
    await prisma.alert.create({
      data: {
        type: 'follow',
        message: 'Test Follower is now following!',
        played: false
      }
    });
    return { success: true };
  } catch (error: any) {
    console.error("Test alert error:", error);
    return { success: false, error: error.message };
  }
}
