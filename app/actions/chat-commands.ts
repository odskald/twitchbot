"use server";

import prisma from '@/lib/db';
import { sendChatMessage } from '@/lib/twitch-api';

export async function processChatCommand(command: string, args: string[], userContext: { username: string; userId: string; isMod: boolean; isBroadcaster: boolean }) {
  try {
    const chatterName = userContext.username;
    const chatterId = userContext.userId;
    const lowerCommand = command.toLowerCase();

    // Command: !pontos
    if (lowerCommand === '!pontos') {
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
    }
    
    // Command: !shop
    else if (lowerCommand === '!shop') {
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
    }

    // Command: !buy <item>
    else if (lowerCommand === '!buy') {
       const queryName = args.join(' ').trim();
       if (!queryName) {
         await sendChatMessage(`@${chatterName}, usage: !buy <item_name>`);
       } else {
            // 1. Find the item
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
       }
    }

    return { success: true };
  } catch (err: any) {
    console.error("Error processing command:", err);
    return { success: false, error: err.message };
  }
}