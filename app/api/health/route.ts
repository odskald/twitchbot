import { NextResponse } from "next/server";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  const ts = new Date().toISOString();
  log.info("health_check", { ts });
  return NextResponse.json({ ok: true, ts });
}
