import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const alerts = await prisma.alert.findMany({
      where: { played: false },
      orderBy: { createdAt: 'asc' },
      take: 1 // Fetch one at a time to queue them
    });

    return NextResponse.json(alerts);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();

    if (!id) {
      return new NextResponse('Missing ID', { status: 400 });
    }

    await prisma.alert.update({
      where: { id },
      data: { played: true }
    });

    return new NextResponse('Alert acknowledged', { status: 200 });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
