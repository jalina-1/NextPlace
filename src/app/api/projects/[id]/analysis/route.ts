import { after } from "next/server";
import { userRoute, assertSameOrigin } from "@/server/route";
import { cancelAnalysis, getProgress, processJobs, startAnalysis } from "@/server/services/analysis";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Runs a bounded worker tick for this project after the response is sent (Vercel-friendly). */
function tick(projectId: string) {
  after(async () => {
    try {
      await processJobs({ projectId, timeBudgetMs: 20_000, maxJobs: 150 });
    } catch (e) {
      logger.error("worker.tick_failed", { projectId, error: e instanceof Error ? e.message : String(e) });
    }
  });
}

export const GET = userRoute(async ({ user, params }) => {
  const p = await getProgress(params.id, user);
  if (p.run && p.run.status === "running") tick(params.id);
  return p;
});
export const POST = userRoute(async ({ req, user, params }) => {
  assertSameOrigin(req);
  const r = await startAnalysis(params.id, user);
  tick(params.id);
  return r;
});
export const DELETE = userRoute(async ({ req, user, params }) => {
  assertSameOrigin(req);
  return cancelAnalysis(params.id, user);
});
