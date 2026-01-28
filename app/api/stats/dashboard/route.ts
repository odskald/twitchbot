import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getLiveChatters } from "@/lib/twitch-api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [channelsCount, usersCount, liveChatters] = await Promise.all([
      prisma.channel.count(),
      prisma.user.count(),
      getLiveChatters()
    ]);

    return NextResponse.json({
      channelsCount,
      usersCount,
      liveChatters
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
