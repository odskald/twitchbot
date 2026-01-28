import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/db';
import { sendChatMessage } from '@/lib/twitch-api';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // 1. Get headers
  const messageId = req.headers.get('Twitch-Eventsub-Message-Id');
  const timestamp = req.headers.get('Twitch-Eventsub-Message-Timestamp');
  const signature = req.headers.get('Twitch-Eventsub-Message-Signature');
  const messageType = req.headers.get('Twitch-Eventsub-Message-Type');

  if (!signature || !messageId || !timestamp || !messageType) {
    return new NextResponse('Missing headers', { status: 403 });
  }

  // 2. Get body
  const body = await req.text();

  // 3. Verify Signature
  const config = await prisma.globalConfig.findUnique({ where: { id: 'default' } });
  if (!config?.twitchWebhookSecret) {
    console.error('Webhook secret not configured in DB');
    return new NextResponse('Webhook secret not configured', { status: 500 });
  }

  const hmac = crypto.createHmac('sha256', config.twitchWebhookSecret);
  const prefix = 'sha256=';
  const message = messageId + timestamp + body;
  hmac.update(message);
  const computedSignature = prefix + hmac.digest('hex');

  if (signature !== computedSignature) {
    console.error('Invalid signature');
    return new NextResponse('Invalid signature', { status: 403 });
  }

  // 4. Handle Challenge (Verification)
  if (messageType === 'webhook_callback_verification') {
    const { challenge } = JSON.parse(body);
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  // 5. Handle Notification
  if (messageType === 'notification') {
    const { event } = JSON.parse(body);
    
    // Check for chat message
    if (event && event.message && event.message.text) {
        const text = event.message.text.trim();
        const chatterName = event.chatter_user_name;
        const chatterId = event.chatter_user_id;

        const args = text.split(' ');
        const command = args[0].toLowerCase();

        // Command: !comandos / !commands
        if (command === '!comandos' || command === '!commands') {
             const msg = `@${chatterName}, Available commands: !msg <text> (100 pts), !music <yt_link>, !pontos, !shop, !buy <item>.`;
             await sendChatMessage(msg);
        }

        // Command: !pontos
        if (command === '!pontos' || command === '!points') {
            try {
                const user = await prisma.user.findUnique({
                    where: { twitchId: chatterId }
                });

                if (user) {
                    const msg = `@${chatterName}, you have ${user.points} points (Lvl ${user.level}).`;
                    await sendChatMessage(msg);
                } else {
                    const msg = `@${chatterName}, you are not in the database yet. Stay awhile and listen!`;
                    await sendChatMessage(msg);
                }
            } catch (err) {
                console.error('Error handling !pontos:', err);
            }
        }
        
        // Command: !shop
        else if (command === '!shop') {
          try {
            // Check if there are any items in the DB
            const items = await prisma.shopItem.findMany({
              where: { isEnabled: true },
              orderBy: { cost: 'asc' }
            });

            // If no items, seed some defaults so the user sees something immediately
            if (items.length === 0) {
               await prisma.shopItem.createMany({
                 data: [
                   { name: "Hydrate", cost: 100, description: "Remind streamer to drink water" },
                   { name: "Posture Check", cost: 200, description: "Sit up straight!" },
                   { name: "Shoutout", cost: 500, description: "Get a shoutout" },
                   { name: "VIP (24h)", cost: 5000, description: "VIP status for a day" }
                 ]
               });
               // Re-fetch
               const seededItems = await prisma.shopItem.findMany({
                 where: { isEnabled: true },
                 orderBy: { cost: 'asc' }
               });
               
               const itemsList = seededItems.map((i: any) => `${i.name} (${i.cost} pts)`).join(', ');
               await sendChatMessage(`@${chatterName}, available items: ${itemsList}. Use !buy <item_name> to purchase.`);
            } else {
               const itemsList = items.map(i => `${i.name} (${i.cost} pts)`).join(', ');
               await sendChatMessage(`@${chatterName}, available items: ${itemsList}. Use !buy <item_name> to purchase.`);
            }

          } catch (err) {
            console.error('Error handling !shop:', err);
          }
        }

        // Command: !buy <item>
        else if (command === '!buy') {
           const queryName = args.slice(1).join(' ').trim();
           if (!queryName) {
             await sendChatMessage(`@${chatterName}, usage: !buy <item_name>`);
           } else {
             try {
                // 1. Find the item (case-insensitive search would be better, but Prisma case-insensitive requires mode: insensitive which is standard in Postgres)
                const item = await prisma.shopItem.findFirst({
                  where: { 
                    name: {
                      equals: queryName,
                      mode: 'insensitive' 
                    },
                    isEnabled: true
                  }
                });

                if (!item) {
                  await sendChatMessage(`@${chatterName}, item "${queryName}" not found. Check !shop.`);
                } else {
                  // 2. Check Balance
                  const user = await prisma.user.findUnique({
                    where: { twitchId: chatterId }
                  });

                  if (!user || user.points < item.cost) {
                    await sendChatMessage(`@${chatterName}, you don't have enough points! Need ${item.cost}, have ${user?.points || 0}.`);
                  } else {
                    // 3. Transact
                    // We use a transaction to ensure points are deducted and redemption is logged atomically
                    await prisma.$transaction([
                      prisma.user.update({
                        where: { twitchId: chatterId },
                        data: { points: { decrement: item.cost } }
                      }),
                      prisma.redemption.create({
                        data: {
                          userId: user.id,
                          itemId: item.id,
                          cost: item.cost
                        }
                      }),
                      prisma.pointLedger.create({
                         data: {
                           userId: user.id,
                           points: -item.cost,
                           type: 'SPEND',
                           reason: `Bought ${item.name}`
                         }
                      })
                    ]);

                    await sendChatMessage(`@${chatterName} redeemed ${item.name} for ${item.cost} points! Balance: ${user.points - item.cost}.`);
                  }
                }
             } catch (err) {
               console.error('Error handling !buy:', err);
               await sendChatMessage(`@${chatterName}, transaction failed. Please try again.`);
             }
           }
        }
    }
  }
  
  return new NextResponse('OK', { status: 200 });
}
