/**
 * Durable job queue stored in PostgreSQL.
 * - Claiming uses FOR UPDATE SKIP LOCKED, so several workers (cron, request-triggered ticks,
 *   a long-running local worker) can run safely at the same time.
 * - Jobs left "running" by a crashed worker are re-queued after a lock timeout.
 * - Failures retry with exponential backoff up to max_attempts; then they are "failed"
 *   and visible to admins for manual retry.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { logger } from "../logger";
import { ProviderError } from "../providers/types";

export type JobRow = typeof schema.job.$inferSelect;
export type JobHandler = (job: JobRow) => Promise<void>;

const LOCK_TIMEOUT_SECONDS = 300;

export class NonRetryableError extends Error {}

export async function enqueue(
  jobs: { type: string; projectId?: string | null; analysisRunId?: string | null; payload: Record<string, unknown>; dedupeKey?: string; maxAttempts?: number }[],
  tx: Pick<typeof db, "insert"> = db,
) {
  if (jobs.length === 0) return 0;
  const values = jobs.map((j) => ({
    id: crypto.randomUUID(),
    type: j.type,
    projectId: j.projectId ?? null,
    analysisRunId: j.analysisRunId ?? null,
    payload: j.payload,
    dedupeKey: j.dedupeKey ?? null,
    maxAttempts: j.maxAttempts ?? 3,
  }));
  const res = await tx.insert(schema.job).values(values).onConflictDoNothing().returning({ id: schema.job.id, runId: schema.job.analysisRunId });
  // Keep run totals in sync with jobs actually inserted.
  const perRun = new Map<string, number>();
  for (const r of res) if (r.runId) perRun.set(r.runId, (perRun.get(r.runId) ?? 0) + 1);
  for (const [runId, n] of perRun)
    await db.update(schema.analysisRun).set({ totalTasks: sql`${schema.analysisRun.totalTasks} + ${n}` }).where(eq(schema.analysisRun.id, runId));
  return res.length;
}

async function recoverStale() {
  await db.execute(sql`
    update job set status = 'queued', locked_at = null, locked_by = null, updated_at = now()
    where status = 'running' and locked_at < now() - (${LOCK_TIMEOUT_SECONDS} || ' seconds')::interval`);
}

async function claim(workerId: string, limit: number, projectId?: string): Promise<JobRow[]> {
  const res = await db.execute(sql`
    update job set status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1, updated_at = now()
    where id in (
      select id from job
      where status = 'queued' and run_after <= now() ${projectId ? sql`and project_id = ${projectId}` : sql``}
      order by created_at, id
      limit ${limit}
      for update skip locked
    )
    returning *`);
  return (res.rows as Record<string, unknown>[]).map(toJobRow);
}

function toJobRow(r: Record<string, unknown>): JobRow {
  return {
    id: r.id as string,
    type: r.type as string,
    projectId: (r.project_id as string) ?? null,
    analysisRunId: (r.analysis_run_id as string) ?? null,
    payload: r.payload as Record<string, unknown>,
    status: r.status as string,
    attempts: r.attempts as number,
    maxAttempts: r.max_attempts as number,
    runAfter: new Date(r.run_after as string),
    lockedAt: r.locked_at ? new Date(r.locked_at as string) : null,
    lockedBy: (r.locked_by as string) ?? null,
    lastError: (r.last_error as string) ?? null,
    dedupeKey: (r.dedupe_key as string) ?? null,
    createdAt: new Date(r.created_at as string),
    updatedAt: new Date(r.updated_at as string),
  };
}

async function complete(job: JobRow) {
  await db.update(schema.job).set({ status: "succeeded", lockedAt: null, lockedBy: null, updatedAt: new Date() }).where(and(eq(schema.job.id, job.id), eq(schema.job.status, "running")));
}

async function fail(job: JobRow, err: unknown) {
  const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  const retryable = !(err instanceof NonRetryableError) && !(err instanceof ProviderError && !err.retryable);
  if (retryable && job.attempts < job.maxAttempts) {
    const delay = Math.min(600, 5 * 2 ** job.attempts);
    await db
      .update(schema.job)
      .set({ status: "queued", lastError: msg, lockedAt: null, lockedBy: null, runAfter: new Date(Date.now() + delay * 1000), updatedAt: new Date() })
      .where(eq(schema.job.id, job.id));
  } else {
    await db.update(schema.job).set({ status: "failed", lastError: msg, lockedAt: null, lockedBy: null, updatedAt: new Date() }).where(eq(schema.job.id, job.id));
  }
  logger.warn("job.failed", { jobId: job.id, type: job.type, attempt: job.attempts, retryable, error: msg });
}

export type WorkerOptions = { maxJobs?: number; timeBudgetMs?: number; concurrency?: number; projectId?: string; workerId?: string };

/**
 * Processes queued jobs with bounded concurrency until the queue is empty, the job budget
 * is used, or the time budget expires. Returns the number of jobs processed.
 */
export async function runWorker(handlers: Record<string, JobHandler>, opts: WorkerOptions = {}, afterBatch?: (runIds: Set<string>) => Promise<void>) {
  const workerId = opts.workerId ?? `w-${crypto.randomUUID().slice(0, 8)}`;
  const deadline = Date.now() + (opts.timeBudgetMs ?? 20_000);
  const maxJobs = opts.maxJobs ?? 200;
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  let processed = 0;
  await recoverStale();
  while (processed < maxJobs && Date.now() < deadline) {
    const batch = await claim(workerId, Math.min(concurrency, maxJobs - processed), opts.projectId);
    if (batch.length === 0) break;
    const touchedRuns = new Set<string>();
    await Promise.all(
      batch.map(async (job) => {
        if (job.analysisRunId) touchedRuns.add(job.analysisRunId);
        const h = handlers[job.type];
        try {
          if (!h) throw new NonRetryableError(`no handler for ${job.type}`);
          await h(job);
          await complete(job);
        } catch (e) {
          await fail(job, e);
        }
      }),
    );
    processed += batch.length;
    if (afterBatch) await afterBatch(touchedRuns);
  }
  return processed;
}

export async function cancelRunJobs(runId: string) {
  await db
    .update(schema.job)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(schema.job.analysisRunId, runId), inArray(schema.job.status, ["queued"])));
}

export async function retryJob(jobId: string) {
  const r = await db
    .update(schema.job)
    .set({ status: "queued", attempts: 0, runAfter: new Date(), lastError: null, updatedAt: new Date() })
    .where(and(eq(schema.job.id, jobId), eq(schema.job.status, "failed")))
    .returning({ id: schema.job.id, runId: schema.job.analysisRunId });
  if (r[0]?.runId)
    await db
      .update(schema.analysisRun)
      .set({ status: "running", failedTasks: sql`greatest(${schema.analysisRun.failedTasks} - 1, 0)`, finishedAt: null })
      .where(eq(schema.analysisRun.id, r[0].runId));
  return r.length > 0;
}
