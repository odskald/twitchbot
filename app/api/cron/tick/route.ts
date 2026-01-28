import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const querySchema = z.object({
  source: z.enum(["vercel", "manual"]).optional(),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    log.warn("cron_tick_invalid_query", { issues: parsed.error.issues });
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const ts = new Date().toISOString();
  log.info("cron_tick", { ts, source: parsed.data.source ?? "vercel" });

  // TODO: award idle/lurk points, rotate EventSub subscriptions, etc.

  return NextResponse.json({ ok: true, ts });
}
