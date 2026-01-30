"use server";

import prisma from '@/lib/db';
import { sendChatMessage } from '@/lib/twitch-api';
import yts from 'yt-search';

// Helper to resolve video ID from URL or Search Term
async function resolveVideo(input: string): Promise<{ id: string, title: string } | null> {
    // 1. Check if it's a URL
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = input.match(regExp);
    const videoId = (match && match[2].length === 11) ? match[2] : null;

    if (videoId) {
        try {
            // Optional: Fetch title for better UX
            const meta = await yts({ videoId });
            return { id: videoId, title: meta.title || "Link" };
        } catch (e) {
             return { id: videoId, title: "Link" };
        }
    }

    // 2. It's a search term
    try {
        const r = await yts(input);
        const videos = r.videos;
        if (videos.length > 0) {
            return { id: videos[0].videoId, title: videos[0].title };
        }
    } catch (e) {
        console.error("YouTube Search Error:", e);
    }

    return null;
}

export async function processChatCommand(
  command: string, 
  args: string[], 
  userContext: { username: string; userId: string; isMod: boolean; isBroadcaster: boolean },
  messageId?: string
) {
  console.log(`[ServerAction] Processing: ${command} from ${userContext.username}`);
  try {
    // Deduplication Logic
    if (messageId) {
      try {
        await prisma.processedCommand.create({
          data: {
            id: messageId,
            command: command,
            userId: userContext.userId
          }
        });
        
        // Cleanup old processed commands (1% chance to run)
        if (Math.random() < 0.01) {
            const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
            await prisma.processedCommand.deleteMany({
                where: { createdAt: { lt: oneMinuteAgo } }
            }).catch(err => console.error("Failed to cleanup processed commands:", err));
        }

      } catch (error: any) {
        // If unique constraint failed, it's a duplicate
        if (error.code === 'P2002') {
          console.log(`[ChatCommand] Duplicate message detected: ${messageId}`);
          return;
        }
        // Other errors, we log but proceed (fail-open) or return (fail-safe)
        // Let's fail-safe to avoid spam
        console.error(`[ChatCommand] Error checking deduplication:`, error);
        return;
      }
    }

    const chatterName = userContext.username;
    const chatterId = userContext.userId;
    const lowerCommand = command.toLowerCase();

    // Command: !comandos / !commands
    if (lowerCommand === '!comandos' || lowerCommand === '!commands') {
        const msg = `@${chatterName}, Comandos: !msg <texto> (100 pts), !queue <link> (100 pts), !music <link> (300 pts, Toca Agora!), !pontos, !shop.`;
        await sendChatMessage(msg);
    }

    // Command: !music / !musica (INSTANT PLAY)
    else if (lowerCommand === '!music' || lowerCommand === '!musica') {
        console.log(`[ServerAction] !music detected. Args: ${args.join(' ')}`);
        if (!userContext.isMod && !userContext.isBroadcaster) {
             await sendChatMessage(`@${chatterName}, apenas Mods podem usar !music para tocar imediatamente.`);
             return;
        }

        const input = args.join(' ').trim();
        
        if (!input) {
            await sendChatMessage(`@${chatterName}, use !music <link/busca> para tocar agora!`);
        } else {
            console.log(`[ServerAction] Resolving video for: ${input}`);
            // Use resolveVideo to support both Links and Search Terms
            const video = await resolveVideo(input);

            if (video) {
                 console.log(`[ServerAction] !music resolved: ${video.id} (${video.title})`);
                 // Signal: [InstantPlay] ID Requester Title
                 await sendChatMessage(`[InstantPlay] ${video.id} ${chatterName} ${video.title}`);
                 await sendChatMessage(`@${chatterName}, Trocando para: ${video.title} 🚨`);
            } else {
                console.log(`[ServerAction] !music invalid link/search`);
                await sendChatMessage(`@${chatterName}, Não encontrei nada para "${input}"!`);
            }
        }
    }

    // Command: !skip / !next
    else if (lowerCommand === '!skip' || lowerCommand === '!next') {
        if (userContext.isMod || userContext.isBroadcaster) {
            await sendChatMessage(`[Skip] ${chatterName}`);
            await sendChatMessage(`@${chatterName}, Puf! Música pulada. 💨`);
        } else {
            await sendChatMessage(`@${chatterName}, apenas Mods podem pular músicas!`);
        }
    }

    // Command: !stop
    else if (lowerCommand === '!stop') {
        if (userContext.isMod || userContext.isBroadcaster) {
            await sendChatMessage(`[Stop] ${chatterName}`);
            await sendChatMessage(`@${chatterName}, Parando música. 🛑`);
        }
    }

    // Command: !clear
    else if (lowerCommand === '!clear') {
        if (userContext.isMod || userContext.isBroadcaster) {
            await sendChatMessage(`[Clear] ${chatterName}`);
            await sendChatMessage(`@${chatterName}, Fila limpa! 🧹`);
        }
    }

    // Command: !play
    else if (lowerCommand === '!play') {
        if (userContext.isMod || userContext.isBroadcaster) {
            await sendChatMessage(`[Play] ${chatterName}`);
            await sendChatMessage(`@${chatterName}, Play! ▶`);
        }
    }

    // Command: !pause
    else if (lowerCommand === '!pause') {
        if (userContext.isMod || userContext.isBroadcaster) {
            await sendChatMessage(`[Pause] ${chatterName}`);
            await sendChatMessage(`@${chatterName}, Pausa! ⏸`);
        }
    }

    // Command: !queue (ADD or VIEW)
    else if (lowerCommand === '!queue') {
         const input = args.join(' ').trim();
         
         // If Input provided -> Add to Queue
         if (input) {
             const QUEUE_ADD_COST = 100;
             const video = await resolveVideo(input);
            
            if (video) {
                // Check if user is Mod or Broadcaster -> No Cost
                if (userContext.isMod || userContext.isBroadcaster) {
                     // Signal: [QueueAdd] ID Requester Title
                     await sendChatMessage(`[QueueAdd] ${video.id} ${chatterName} ${video.title}`);
                     await sendChatMessage(`@${chatterName}, Adicionado à fila: ${video.title} (Mod/Broadcaster: Grátis) 🎵`);
                } else {
                    // Regular User -> Pay Cost
                    const user = await prisma.user.findUnique({ where: { twitchId: chatterId } });
                    if (!user || user.points < QUEUE_ADD_COST) {
                        await sendChatMessage(`@${chatterName}, você precisa de ${QUEUE_ADD_COST} pontos para adicionar à fila!`);
                    } else {
                        await prisma.$transaction([
                            prisma.user.update({
                            where: { twitchId: chatterId },
                            data: { points: { decrement: QUEUE_ADD_COST } }
                            }),
                            prisma.pointLedger.create({
                            data: {
                                userId: user.id,
                                points: -QUEUE_ADD_COST,
                                type: 'SPEND',
                                reason: `Queue Add: ${video.title} (${video.id})`
                            }
                            })
                        ]);
                        
                        // Signal: [QueueAdd] ID Requester Title
                        await sendChatMessage(`[QueueAdd] ${video.id} ${chatterName} ${video.title}`);
                        await sendChatMessage(`@${chatterName}, Adicionado à fila: ${video.title} (-${QUEUE_ADD_COST} pts) 🎵`);
                    }
                }
            } else {
                await sendChatMessage(`@${chatterName}, Não encontrei nada! Para ver a fila, digite apenas !queue.`);
            }

         } else {
             // No URL -> View Queue
             const QUEUE_VIEW_COST = 10;
             
             // Check if user is Mod or Broadcaster -> No Cost
             if (userContext.isMod || userContext.isBroadcaster) {
                  // Signal: [QueueCheck]
                  await sendChatMessage(`[QueueCheck] ${chatterName}`);
                  await sendChatMessage(`@${chatterName}, Verifique a fila no overlay.`);
             } else {
                // Regular User -> Pay Cost
                const user = await prisma.user.findUnique({ where: { twitchId: chatterId } });
        
                if (!user || user.points < QUEUE_VIEW_COST) {
                    await sendChatMessage(`@${chatterName}, você precisa de ${QUEUE_VIEW_COST} pontos para ver a fila!`);
                } else {
                    await prisma.$transaction([
                        prisma.user.update({
                        where: { twitchId: chatterId },
                        data: { points: { decrement: QUEUE_VIEW_COST } }
                        }),
                        prisma.pointLedger.create({
                        data: {
                            userId: user.id,
                            points: -QUEUE_VIEW_COST,
                            type: 'SPEND',
                            reason: `Checked Queue`
                        }
                        })
                    ]);
                    
                    // Signal: [QueueCheck]
                    await sendChatMessage(`[QueueCheck] ${chatterName}`);
                    await sendChatMessage(`@${chatterName}, Verifique a fila no overlay. (-${QUEUE_VIEW_COST} pts)`);
                }
             }
         }
    }

    // Command: !points / !pontos
    else if (lowerCommand === '!points' || lowerCommand === '!pontos') {
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
        // Simplified Shop for now
        const items = await prisma.shopItem.findMany({
          where: { isEnabled: true },
          orderBy: { cost: 'asc' }
        });
        
        let msg = `@${chatterName}, use !msg <message> (100 pts) to send a highlighted message!`;
        
        if (items.length > 0) {
            const itemsList = items.map(i => `${i.name} (${i.cost} pts)`).join(', ');
            msg += ` Other items: ${itemsList}. Use !buy <item_name>.`;
        }
        
        await sendChatMessage(msg);
    }
    
    // Command: !msg <message>
    else if (lowerCommand === '!msg') {
        const messageContent = args.join(' ').trim();
        const MSG_COST = 100;
        
        if (!messageContent) {
            await sendChatMessage(`@${chatterName}, usage: !msg <your_message> (Cost: ${MSG_COST} pts)`);
            return;
        }

        const user = await prisma.user.findUnique({
            where: { twitchId: chatterId }
        });

        if (!user || user.points < MSG_COST) {
            await sendChatMessage(`@${chatterName}, you need ${MSG_COST} points to use !msg. You have ${user?.points || 0}.`);
        } else {
             // Transact
             await prisma.$transaction([
                prisma.user.update({
                  where: { twitchId: chatterId },
                  data: { points: { decrement: MSG_COST } }
                }),
                prisma.pointLedger.create({
                  data: {
                      userId: user.id,
                      points: -MSG_COST,
                      type: 'SPEND',
                      reason: `Used !msg: ${messageContent}`
                  }
                })
              ]);
              
              // Echo the message
              await sendChatMessage(`[100 pts] @${chatterName} says: ${messageContent}`);
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
                
                await sendChatMessage(`@${chatterName} redeemed ${item.name} for ${item.cost} points!`);
              }
            }
       }
    }

  } catch (error) {
    console.error("[ChatCommand] Error processing command:", error);
  }
}
