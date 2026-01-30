import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getTwitchUserId, getAppAccessToken } from '@/lib/twitch-api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const config = await prisma.globalConfig.findUnique({ where: { id: 'default' } });

    if (!config || !config.accessToken || !config.twitchClientId || !config.appBaseUrl || !config.twitchWebhookSecret) {
      console.error('Missing configuration:', config);
      return new NextResponse('Missing configuration (token, clientId, appUrl, secret)', { status: 500 });
    }
    
    // Get App Access Token (Required for Webhook Subscriptions)
    const appToken = await getAppAccessToken();
    if (!appToken) {
        return new NextResponse('Failed to get App Access Token', { status: 500 });
    }

    // Get Broadcaster ID
    let broadcasterId = config.botUserId; // Fallback
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

    const clientId = config.twitchClientId;
    
    // 1. List Subscriptions
    const subsRes = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${appToken}`
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
                'Authorization': `Bearer ${appToken}`
            }
        });
    }
    
    // 3. Create new subscription
    const createRes = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
            'Client-ID': clientId,
            'Authorization': `Bearer ${appToken}`,
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
