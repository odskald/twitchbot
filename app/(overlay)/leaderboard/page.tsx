import prisma from "@/lib/db";
import LeaderboardDisplay from "./leaderboard-display";
import AutoRefresh from "@/app/components/auto-refresh";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
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
