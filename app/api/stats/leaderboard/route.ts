import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
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

    return NextResponse.json({ topPoints, topLevel });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
