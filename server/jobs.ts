import { randomUUID } from "node:crypto";
import { query, transaction } from "./db.ts";
import { rank } from "./domain.ts";
import { research } from "./providers.ts";
// A database lease survives process suspension. Provider calls happen outside transactions.
export async function advanceJob(projectId?: string) {
  const token = randomUUID();
  const job = await transaction(async (q) => {
    if (process.env.DATABASE_URL)
      await q("SELECT pg_advisory_xact_lock(741290)");
    await q(
      "UPDATE jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,lease_token=NULL,lease_until=NULL,error='Worker lease expired' WHERE status='running' AND lease_until<now()",
    );
    if (
      (
        await q(
          "SELECT id FROM jobs WHERE status='running' AND lease_until>now() LIMIT 1",
        )
      ).length
    )
      return null;
    const [candidate] = await q(
      "SELECT * FROM jobs WHERE status='queued' AND ($1::text IS NULL OR project_id=$1) ORDER BY updated_at LIMIT 1 FOR UPDATE SKIP LOCKED",
      [projectId || null],
    );
    if (!candidate) return null;
    const [claimed] = await q(
      "UPDATE jobs SET status='running',attempts=attempts+1,lease_token=$1,lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=$2 RETURNING *",
      [token, candidate.id],
    );
    return claimed;
  });
  if (!job) return { processed: false };
  try {
    const [p] = await query("SELECT * FROM projects WHERE id=$1", [
      job.project_id,
    ]);
    if (!p) return { processed: false };
    const option = p.data.options[job.progress];
    const evidence = option
      ? await research(option, p.data.preferences, p.data.demo)
      : null;
    return await transaction(async (q) => {
      const [state] = await q("SELECT * FROM jobs WHERE id=$1 FOR UPDATE", [
        job.id,
      ]);
      if (!state || state.status !== "running" || state.lease_token !== token)
        return { processed: false };
      const [current] = await q(
        "SELECT * FROM projects WHERE id=$1 FOR UPDATE",
        [p.id],
      );
      // A preference change during a lookup makes its user route stale. Retry against the new revision.
      if (current.revision !== p.revision) {
        await q(
          "UPDATE jobs SET status='queued',attempts=0,lease_token=NULL,lease_until=NULL WHERE id=$1",
          [job.id],
        );
        return { processed: false };
      }
      const data = current.data;
      if (option) data.options[job.progress].evidence = evidence;
      const progress = option ? job.progress + 1 : job.progress;
      const complete = progress >= data.options.length;
      if (complete) {
        data.status = "complete";
        if (!data.previewFrozen) {
          data.preview = rank(data.options, data.preferences)
            .filter((o) => !o.excluded)
            .slice(0, 3)
            .map((o) => o.id);
          data.previewFrozen = true;
        }
      }
      await q("UPDATE projects SET data=$1,revision=revision+1 WHERE id=$2", [
        JSON.stringify(data),
        p.id,
      ]);
      await q(
        "UPDATE jobs SET status=$1,progress=$2,attempts=0,error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$3",
        [complete ? "completed" : "queued", progress, job.id],
      );
      return { processed: true, complete, progress };
    });
  } catch (e: any) {
    await transaction(async (q) => {
      const [state] = await q("SELECT * FROM jobs WHERE id=$1 FOR UPDATE", [
        job.id,
      ]);
      if (state?.lease_token !== token || state.status !== "running") return;
      const failed = state.attempts >= 3;
      await q(
        "UPDATE jobs SET status=$1,error=$2,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=$3",
        [failed ? "failed" : "queued", String(e.message).slice(0, 200), job.id],
      );
      if (failed)
        await q(
          "UPDATE projects SET data=jsonb_set(data,'{status}','\"failed\"') WHERE id=$1",
          [job.project_id],
        );
    });
    return { processed: false, retry: true };
  }
}
