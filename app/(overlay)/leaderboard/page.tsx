import prisma from "@/lib/db";
import LeaderboardDisplay from "./leaderboard-display";
import AutoRefresh from "@/app/components/auto-refresh";
import { getLiveChatters } from "@/lib/twitch-api";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  // Trigger lurking mechanism (side effect: updates points/xp for live chatters)
  // We do this here so the overlay itself keeps the bot "alive" even if dashboard is closed.
  try {
    await getLiveChatters();
  } catch (err) {
    console.error("Overlay failed to process lurking:", err);
  }

  const topPoints = await prisma.user.findMany({
    orderBy: { points: 'desc' },
    take: 5,
    select: { displayName: true, points: true, level: true, xp: true }
  });

  const topLevel = await prisma.user.findMany({
    orderBy: { xp: 'desc' },
    take: 5,
    select: { displayName: true, points: true, level: true, xp: true }
  });

  return (
    <>
      <AutoRefresh intervalMs={5000} />
      <LeaderboardDisplay topPoints={topPoints} topLevel={topLevel} />
    </>
  );
}
