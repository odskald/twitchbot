import { NextRequest, NextResponse } from "next/server";
import { getGlobalConfig } from "@/lib/config";

export async function GET(req: NextRequest) {
  const config = await getGlobalConfig();

  if (!config.twitchClientId) {
    return NextResponse.json(
      { error: "Missing Client ID in settings" },
      { status: 400 }
    );
  }

  // Use the current request's origin to ensure we redirect back to the same domain
  // This fixes issues where the DB config might have "localhost" but the user is on Vercel
  const baseUrl = req.nextUrl.origin;
  const redirectUri = `${baseUrl}/api/auth/callback/twitch`;
  const scopes = [
    "moderator:read:chatters", // Required to see who is in chat
    "user:read:chat",         // General chat read access
    "chat:read",              // IRC chat read
    "chat:edit",              // IRC chat write
  ].join(" ");

  const twitchAuthUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${config.twitchClientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=${encodeURIComponent(scopes)}`;

  return NextResponse.redirect(twitchAuthUrl);
}
