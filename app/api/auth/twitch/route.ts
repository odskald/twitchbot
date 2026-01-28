import { NextRequest, NextResponse } from "next/server";
import { getGlobalConfig } from "@/lib/config";

export async function GET(req: NextRequest) {
  const config = await getGlobalConfig();

  if (!config.twitchClientId || !config.appBaseUrl) {
    return NextResponse.json(
      { error: "Missing Client ID or Base URL in settings" },
      { status: 400 }
    );
  }

  const redirectUri = `${config.appBaseUrl}/api/auth/callback/twitch`;
  const scopes = [
    "moderator:read:chatters", // Required to see who is in chat
    "user:read:chat",         // General chat read access
    "user:bot",               // Marks this user as a bot (optional but good)
  ].join(" ");

  const twitchAuthUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${config.twitchClientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=${encodeURIComponent(scopes)}`;

  return NextResponse.redirect(twitchAuthUrl);
}
