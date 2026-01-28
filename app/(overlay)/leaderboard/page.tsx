import prisma from "@/lib/db";
import LeaderboardDisplay from "./leaderboard-display";

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
    <LeaderboardDisplay topPoints={topPoints} topLevel={topLevel} />
  );
}
