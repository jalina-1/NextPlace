import { NextResponse } from "next/server";
import { env } from "@/server/env-core";
import { processJobs } from "@/server/services/analysis";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
/** Scheduled worker (Vercel Cron or any scheduler). Requires Authorization: Bearer CRON_SECRET. */
export async function GET(req: Request) {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const processed = await processJobs({ timeBudgetMs: 50_000, maxJobs: 1000 });
  return NextResponse.json({ processed });
}
