import { desc, eq, sql, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { providerStatus } from "../env-core";
import { storage } from "../storage";

export async function adminOverview() {
  const counts = await db.execute(sql`
    select
      (select count(*)::int from "user") as users,
      (select count(*)::int from project) as projects,
      (select count(*)::int from payment where status = 'pending') as pending_payments,
      (select count(*)::int from access_grant where starts_at <= now() and ends_at > now()) as active_grants,
      (select count(*)::int from job where status = 'failed') as failed_jobs,
      (select count(*)::int from job where status in ('queued','running')) as queued_jobs`);
  return counts.rows[0];
}

export async function listPayments(status?: string) {
  const rows = await db
    .select({
      id: schema.payment.id,
      userId: schema.payment.userId,
      email: schema.user.email,
      name: schema.user.name,
      method: schema.payment.method,
      amountLkr: schema.payment.amountLkr,
      reference: schema.payment.reference,
      paidOn: schema.payment.paidOn,
      status: schema.payment.status,
      userNote: schema.payment.userNote,
      adminNote: schema.payment.adminNote,
      receiptMime: schema.payment.receiptMime,
      createdAt: schema.payment.createdAt,
      reviewedAt: schema.payment.reviewedAt,
    })
    .from(schema.payment)
    .innerJoin(schema.user, eq(schema.user.id, schema.payment.userId))
    .where(status ? eq(schema.payment.status, status) : undefined)
    .orderBy(desc(schema.payment.createdAt))
    .limit(200);
  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const grants = userIds.length ? await db.select().from(schema.accessGrant).where(inArray(schema.accessGrant.userId, userIds)) : [];
  return rows.map((r) => {
    const g = grants.filter((x) => x.userId === r.userId).sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());
    return { ...r, accessUntil: g[0]?.endsAt ?? null };
  });
}

export async function listAccessGrants() {
  return db
    .select({ id: schema.accessGrant.id, email: schema.user.email, startsAt: schema.accessGrant.startsAt, endsAt: schema.accessGrant.endsAt, months: schema.accessGrant.months, paymentId: schema.accessGrant.paymentId, createdAt: schema.accessGrant.createdAt })
    .from(schema.accessGrant)
    .innerJoin(schema.user, eq(schema.user.id, schema.accessGrant.userId))
    .orderBy(desc(schema.accessGrant.createdAt))
    .limit(200);
}

export async function listFailedJobs() {
  return db
    .select({ id: schema.job.id, type: schema.job.type, projectId: schema.job.projectId, attempts: schema.job.attempts, lastError: schema.job.lastError, updatedAt: schema.job.updatedAt })
    .from(schema.job)
    .where(eq(schema.job.status, "failed"))
    .orderBy(desc(schema.job.updatedAt))
    .limit(100);
}

export async function listAudit(limit = 200) {
  return db
    .select({ id: schema.auditEvent.id, action: schema.auditEvent.action, actor: schema.user.email, targetType: schema.auditEvent.targetType, targetId: schema.auditEvent.targetId, data: schema.auditEvent.data, createdAt: schema.auditEvent.createdAt })
    .from(schema.auditEvent)
    .leftJoin(schema.user, eq(schema.user.id, schema.auditEvent.actorUserId))
    .orderBy(desc(schema.auditEvent.createdAt))
    .limit(limit);
}

export async function listOutbox() {
  return db.select().from(schema.emailOutbox).orderBy(desc(schema.emailOutbox.createdAt)).limit(50);
}

/** Connectivity check for the database and private storage (no secrets returned). */
export async function healthCheck() {
  const out: { database: { ok: boolean; detail: string }; storage: { ok: boolean; detail: string }; providers: ReturnType<typeof providerStatus> } = {
    database: { ok: false, detail: "" },
    storage: { ok: false, detail: "" },
    providers: providerStatus(),
  };
  try {
    const r = await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    out.database = { ok: true, detail: `connected; ${(r.rows[0] as { n: number }).n} migration(s) applied` };
  } catch (e) {
    out.database = { ok: false, detail: e instanceof Error ? e.message.replace(/postgres(ql)?:\/\/[^\s]+/g, "[url]") : "error" };
  }
  try {
    out.storage = await storage().check();
  } catch (e) {
    out.storage = { ok: false, detail: e instanceof Error ? e.message : "error" };
  }
  return out;
}
