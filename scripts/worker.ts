/**
 * Long-running background worker for local development or a VM/container deployment.
 * On Vercel, work is processed by request-triggered ticks and the /api/cron/worker endpoint instead.
 */
import { processJobs } from "../src/server/services/analysis";
import { closeDb } from "../src/server/db";

let stopping = false;
process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));

async function main() {
  console.log("[worker] started");
  while (!stopping) {
    const n = await processJobs({ timeBudgetMs: 30_000, maxJobs: 500 }).catch((e) => {
      console.error("[worker] error", e instanceof Error ? e.message : e);
      return 0;
    });
    if (n > 0) console.log(`[worker] processed ${n} job(s)`);
    await new Promise((r) => setTimeout(r, n > 0 ? 200 : 2000));
  }
  await closeDb();
  console.log("[worker] stopped");
}
main();
