import { NextRequest, NextResponse } from "next/server";
import { getGlobalConfig } from "@/lib/config";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.json({ error: `Twitch Auth Error: ${error}` }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 });
  }

  const config = await getGlobalConfig();
  if (!config.twitchClientId || !config.twitchClientSecret || !config.appBaseUrl) {
    return NextResponse.json({ error: "Server misconfiguration (missing keys)" }, { status: 500 });
  }

  const redirectUri = `${config.appBaseUrl}/api/auth/callback/twitch`;

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.twitchClientId,
        client_secret: config.twitchClientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error("Token exchange failed:", errText);
      return NextResponse.json({ error: "Failed to exchange token", details: errText }, { status: 500 });
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Get User Info (to know who connected)
    const userResponse = await fetch("https://api.twitch.tv/helix/users", {
      headers: {
        "Client-ID": config.twitchClientId,
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!userResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch user info" }, { status: 500 });
    }

    const userData = await userResponse.json();
    const user = userData.data[0];

    // Save to DB
    await prisma.globalConfig.update({
      where: { id: "default" },
      data: {
        accessToken: access_token,
        refreshToken: refresh_token,
        tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
        botUserId: user.id,
        botUserName: user.login,
      },
    });

    // Redirect back to settings with success
    return NextResponse.redirect(`${config.appBaseUrl}/settings?connected=true`);
  } catch (err: any) {
    console.error("Auth callback error:", err);
    return NextResponse.json({ error: "Internal Server Error", message: err.message }, { status: 500 });
  }
}
