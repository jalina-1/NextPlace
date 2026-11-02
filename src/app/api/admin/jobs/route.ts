import { z } from "zod";
import { adminRoute, readJson, assertSameOrigin } from "@/server/route";
import { listFailedJobs } from "@/server/services/admin";
import { retryJob } from "@/server/services/jobs";
import { processJobs } from "@/server/services/analysis";
import { audit } from "@/server/services/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = adminRoute(async () => ({ jobs: await listFailedJobs() }));
export const POST = adminRoute(async ({ req, user }) => {
  assertSameOrigin(req);
  const body = z.object({ action: z.enum(["retry", "run"]), jobId: z.string().max(64).optional() }).parse(await readJson(req));
  if (body.action === "retry" && body.jobId) {
    const ok = await retryJob(body.jobId);
    await audit(user.id, "job.retry", "job", body.jobId);
    return { ok };
  }
  return { processed: await processJobs({ timeBudgetMs: 25_000 }) };
});
