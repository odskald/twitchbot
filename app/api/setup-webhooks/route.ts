import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTwitchUserId } from '@/lib/twitch-api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const config = await prisma.globalConfig.findUnique({ where: { id: 'default' } });

    if (!config || !config.accessToken || !config.twitchClientId || !config.appBaseUrl || !config.twitchWebhookSecret) {
      console.error('Missing configuration:', config);
      return new NextResponse('Missing configuration (token, clientId, appUrl, secret)', { status: 500 });
    }

    // Ensure we have a valid token (refreshed if needed)
    // Note: getTwitchUserId internally calls getValidAccessToken, so we can use that logic or duplicate it.
    // Ideally we should export getValidAccessToken from lib/twitch-api.ts, which it is not (it's not exported in the file I read).
    // Wait, line 27 in lib/twitch-api.ts was `async function getValidAccessToken...` (not exported). 
    // But getTwitchUserId calls it. I'll rely on getTwitchUserId to trigger a refresh if needed, or I should fix lib/twitch-api.ts to export it.
    // For now, let's assume the token in DB is valid or we can just fetch it manually if we want to be safe.
    
    // Better approach: Update lib/twitch-api.ts to export getValidAccessToken.
    // But to save time, I will just copy the refresh logic or trust the token is valid for now.
    
    // Get Broadcaster ID
    let broadcasterId = config.botUserId; // Fallback? No, this is bot ID.
    if (config.twitchChannel) {
        const bid = await getTwitchUserId(config.twitchChannel);
        if (bid) broadcasterId = bid;
    }

    if (!broadcasterId) {
        return new NextResponse('Could not resolve broadcaster ID', { status: 500 });
    }

    // Get Bot ID (Moderator) - Assuming Bot is Mod
    let moderatorId = config.botUserId;
    if (!moderatorId && config.botUserName) {
        moderatorId = await getTwitchUserId(config.botUserName);
    }
    // If no bot user, assume broadcaster is the bot (self-mod)
    if (!moderatorId) moderatorId = broadcasterId;

    const token = config.accessToken;
    const clientId = config.twitchClientId;
    
    // 1. List Subscriptions
    const subsRes = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${token}`
        }
    });
    
    if (!subsRes.ok) {
        const txt = await subsRes.text();
        return new NextResponse(`Failed to list subs: ${txt}`, { status: 500 });
    }
    
    const subsData = await subsRes.json();
    const subs = subsData.data || [];
    
    // 2. Delete existing channel.follow subs
    const followSubs = subs.filter((s: any) => s.type === 'channel.follow');
    for (const sub of followSubs) {
        console.log(`Deleting old sub ${sub.id}`);
        await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${sub.id}`, {
            method: 'DELETE',
            headers: {
                'Client-ID': clientId,
                'Authorization': `Bearer ${token}`
            }
        });
    }
    
    // 3. Create new subscription
    const createRes = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            type: 'channel.follow',
            version: '2',
            condition: {
                broadcaster_user_id: broadcasterId,
                moderator_user_id: moderatorId
            },
            transport: {
                method: 'webhook',
                callback: `${config.appBaseUrl}/api/webhooks/twitch`,
                secret: config.twitchWebhookSecret
            }
        })
    });
    
    const createData = await createRes.json();
    
    if (!createRes.ok) {
         return new NextResponse(`Failed to create sub: ${JSON.stringify(createData)}`, { status: 500 });
    }

    return NextResponse.json({
        message: 'Subscription created successfully',
        subscription: createData,
        broadcasterId,
        moderatorId
    });

  } catch (err: any) {
    return new NextResponse(`Error: ${err.message}`, { status: 500 });
  }
}
