import { describe, it, expect, beforeAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { resetDb } from "./helpers/db";
import { signUp } from "./helpers/users";
import { db, schema } from "@/server/db";
import { enqueue, runWorker, retryJob, NonRetryableError } from "@/server/services/jobs";
import { createProject } from "@/server/services/projects";
import { uploadSource, getImportState, confirmMapping } from "@/server/services/imports";
import { getPreferences, savePreferences } from "@/server/services/preferences";
import { startAnalysis, processJobs, cancelAnalysis, getProgress } from "@/server/services/analysis";
import { makeCsv } from "./helpers/fixtures";

beforeAll(async () => {
  await resetDb();
});

describe("durable job queue", () => {
  it("retries transient failures with backoff and fails permanently after max attempts", async () => {
    await enqueue([{ type: "flaky", payload: {}, maxAttempts: 2 }, { type: "fatal", payload: {} }]);
    let calls = 0;
    const handlers = {
      flaky: async () => {
        calls++;
        throw new Error("temporary");
      },
      fatal: async () => {
        throw new NonRetryableError("bad input");
      },
    };
    await runWorker(handlers, { timeBudgetMs: 2000 });
    let jobs = await db.select().from(schema.job);
    const flaky = jobs.find((j) => j.type === "flaky")!;
    expect(flaky.status).toBe("queued");
    expect(flaky.runAfter.getTime()).toBeGreaterThan(Date.now());
    expect(jobs.find((j) => j.type === "fatal")!.status).toBe("failed");
    await db.execute(sql`update job set run_after = now() where type = 'flaky'`);
    await runWorker(handlers, { timeBudgetMs: 2000 });
    jobs = await db.select().from(schema.job);
    expect(jobs.find((j) => j.type === "flaky")!.status).toBe("failed");
    expect(calls).toBe(2);
    expect(await retryJob(flaky.id)).toBe(true);
    await runWorker({ ...handlers, flaky: async () => {} }, { timeBudgetMs: 2000 });
    expect((await db.select().from(schema.job).where(eq(schema.job.id, flaky.id)))[0].status).toBe("succeeded");
  });

  it("recovers jobs left running by a crashed worker", async () => {
    await enqueue([{ type: "ok", payload: {} }]);
    await db.execute(sql`update job set status = 'running', locked_at = now() - interval '1 hour' where type = 'ok'`);
    await runWorker({ ok: async () => {} }, { timeBudgetMs: 2000 });
    const [j] = await db.select().from(schema.job).where(eq(schema.job.type, "ok"));
    expect(j.status).toBe("succeeded");
  });

  it("never processes the same job twice when workers run concurrently", async () => {
    await enqueue(Array.from({ length: 30 }, (_, i) => ({ type: "count", payload: { i } })));
    const seen: number[] = [];
    const h = { count: async (job: { payload: unknown }) => void seen.push((job.payload as { i: number }).i) };
    await Promise.all([runWorker(h, { concurrency: 4 }), runWorker(h, { concurrency: 4 }), runWorker(h, { concurrency: 4 })]);
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 30 }, (_, i) => i));
  });
});

describe("analysis jobs", () => {
  it("cancels a running analysis and keeps partial results; re-weighting creates no new lookups", async () => {
    const { user } = await signUp("jobs@example.com");
    const { id } = await createProject(user, "p");
    await uploadSource(id, user, { name: "l.csv", type: "text/csv", bytes: Buffer.from(makeCsv()) });
    const st = await getImportState(id, user);
    const t = st.tables[0] as { key: string; headerRowIndex: number; suggestion: { mapping: Record<string, number | null> } };
    await confirmMapping(id, user, { tableKey: t.key, headerRowIndex: t.headerRowIndex, mapping: t.suggestion.mapping as never });
    const { preferences, revision } = await getPreferences(id, user);
    await savePreferences(id, user, { ...preferences, home: { label: "Galle", lat: 6.05, lng: 80.22 } }, revision);
    await startAnalysis(id, user);
    await processJobs({ projectId: id, maxJobs: 2 });
    await cancelAnalysis(id, user);
    const prog = await getProgress(id, user);
    expect(prog.run?.status).toBe("cancelled");
    const queued = await db.select().from(schema.job).where(eq(schema.job.projectId, id));
    expect(queued.some((j) => j.status === "cancelled")).toBe(true);
    expect(queued.every((j) => j.status !== "queued")).toBe(true);

    const evidenceBefore = (await db.select().from(schema.evidence)).length;
    const jobsBefore = (await db.select().from(schema.job)).length;
    const p2 = await getPreferences(id, user);
    p2.preferences.criteria = { ...p2.preferences.criteria, post: { enabled: true, weight: 20 }, travel: { enabled: true, weight: 60 } };
    await savePreferences(id, user, p2.preferences, p2.revision);
    expect((await db.select().from(schema.evidence)).length).toBe(evidenceBefore);
    expect((await db.select().from(schema.job)).length).toBe(jobsBefore);
  });
});
