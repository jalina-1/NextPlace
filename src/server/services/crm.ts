/**
 * Admin CRM: everything an administrator can see and do to a user account.
 * Every action is authorised by the caller (adminRoute), validated here, and audited.
 * The most dangerous actions (role changes, deleting an account) also need the
 * administrator's own password again ("step-up").
 */
import { and, desc, eq, gt, isNull, or, sql, type SQL } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { db, schema } from "../db";
import { errors } from "../http";
import type { CurrentUser } from "../session";
import { storage } from "../storage";
import { rateLimit } from "./limits";
import { audit } from "./audit";
import { addCalendarMonthsColombo } from "@/lib/dates";

export const USER_FILTERS = ["all", "paid", "free", "pending", "unverified", "suspended", "admins"] as const;
export type UserFilter = (typeof USER_FILTERS)[number];
const PAGE = 50;

const activeGrant = sql`exists (select 1 from access_grant g where g.user_id = u.id and g.revoked_at is null and g.starts_at <= now() and g.ends_at > now())`;

function whereFor(q: string, filter: UserFilter): SQL {
  const parts: SQL[] = [sql`true`];
  const term = q.trim().toLowerCase().slice(0, 100);
  if (term) {
    const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    parts.push(sql`(lower(u.email) like ${like} or lower(u.name) like ${like} or u.id = ${term})`);
  }
  if (filter === "paid") parts.push(activeGrant);
  if (filter === "free") parts.push(sql`not ${activeGrant}`);
  if (filter === "pending") parts.push(sql`exists (select 1 from payment p where p.user_id = u.id and p.status = 'pending')`);
  if (filter === "unverified") parts.push(sql`u.email_verified = false`);
  if (filter === "suspended") parts.push(sql`u.status = 'suspended'`);
  if (filter === "admins") parts.push(sql`u.role = 'admin'`);
  return sql.join(parts, sql` and `);
}

const LIST_COLUMNS = sql`
  u.id, u.name, u.email, u.email_verified as "emailVerified", u.role, u.status, u.created_at as "createdAt",
  (select max(g.ends_at) from access_grant g where g.user_id = u.id and g.revoked_at is null and g.starts_at <= now() and g.ends_at > now()) as "accessUntil",
  (select count(*)::int from project p where p.user_id = u.id) as projects,
  (select count(*)::int from payment p where p.user_id = u.id and p.status = 'pending') as "pendingPayments",
  (select coalesce(sum(p.amount_lkr), 0)::int from payment p where p.user_id = u.id and p.status = 'approved') as "paidLkr",
  (select max(s.created_at) from session s where s.user_id = u.id) as "lastSignIn"`;

export async function listUsers(q = "", filter: UserFilter = "all", page = 0) {
  const where = whereFor(q, filter);
  const p = Math.max(0, Math.floor(page));
  const rows = await db.execute(sql`select ${LIST_COLUMNS} from "user" u where ${where} order by u.created_at desc limit ${PAGE} offset ${p * PAGE}`);
  const total = await db.execute(sql`select count(*)::int as n from "user" u where ${where}`);
  return { users: rows.rows, total: (total.rows[0] as { n: number }).n, page: p, pageSize: PAGE };
}

/** CSV of the filtered user list (no secrets; cells are neutralised against spreadsheet formulas). */
export async function exportUsersCsv(q = "", filter: UserFilter = "all") {
  const rows = await db.execute(sql`select ${LIST_COLUMNS} from "user" u where ${whereFor(q, filter)} order by u.created_at desc limit 5000`);
  const cell = (v: unknown) => {
    let s = v instanceof Date ? v.toISOString() : v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const cols = ["name", "email", "emailVerified", "role", "status", "createdAt", "accessUntil", "projects", "pendingPayments", "paidLkr", "lastSignIn"];
  return [cols.join(","), ...(rows.rows as Record<string, unknown>[]).map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}

async function getUser(id: string) {
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, id)).limit(1);
  if (!u) throw errors.notFound("User not found.");
  return u;
}

export async function userDetail(id: string) {
  const u = await getUser(id);
  const [sessions, projects, payments, grants, notes, events] = await Promise.all([
    db.select({ id: schema.session.id, createdAt: schema.session.createdAt, expiresAt: schema.session.expiresAt, ipAddress: schema.session.ipAddress, userAgent: schema.session.userAgent }).from(schema.session).where(eq(schema.session.userId, id)).orderBy(desc(schema.session.createdAt)),
    db.execute(sql`select p.id, p.name, p.status, p.created_at as "createdAt", (select count(*)::int from option o where o.project_id = p.id) as options from project p where p.user_id = ${id} order by p.created_at desc`),
    db.select({ id: schema.payment.id, method: schema.payment.method, amountLkr: schema.payment.amountLkr, reference: schema.payment.reference, paidOn: schema.payment.paidOn, status: schema.payment.status, adminNote: schema.payment.adminNote, createdAt: schema.payment.createdAt, reviewedAt: schema.payment.reviewedAt }).from(schema.payment).where(eq(schema.payment.userId, id)).orderBy(desc(schema.payment.createdAt)),
    db.select().from(schema.accessGrant).where(eq(schema.accessGrant.userId, id)).orderBy(desc(schema.accessGrant.endsAt)),
    db.select({ id: schema.userNote.id, body: schema.userNote.body, createdAt: schema.userNote.createdAt, author: schema.user.email }).from(schema.userNote).leftJoin(schema.user, eq(schema.user.id, schema.userNote.authorId)).where(eq(schema.userNote.userId, id)).orderBy(desc(schema.userNote.createdAt)).limit(100),
    db.select({ id: schema.auditEvent.id, action: schema.auditEvent.action, actorUserId: schema.auditEvent.actorUserId, data: schema.auditEvent.data, createdAt: schema.auditEvent.createdAt }).from(schema.auditEvent).where(or(eq(schema.auditEvent.targetId, id), eq(schema.auditEvent.actorUserId, id))).orderBy(desc(schema.auditEvent.createdAt)).limit(60),
  ]);
  const now = new Date();
  const active = grants.filter((g) => !g.revokedAt && g.startsAt <= now && g.endsAt > now);
  return {
    user: { id: u.id, name: u.name, email: u.email, emailVerified: u.emailVerified, role: u.role, status: u.status, suspendedReason: u.suspendedReason, createdAt: u.createdAt },
    accessUntil: active.length ? grants.filter((g) => !g.revokedAt)[0].endsAt : null,
    sessions,
    projects: projects.rows,
    payments,
    grants,
    notes,
    events,
  };
}

async function signOutEverywhere(userId: string) {
  const r = await db.delete(schema.session).where(eq(schema.session.userId, userId)).returning({ id: schema.session.id });
  return r.length;
}

/** Step-up: the administrator must retype their own password for the most dangerous actions. */
async function confirmAdminPassword(admin: CurrentUser, password: string | undefined) {
  await rateLimit(`stepup:${admin.id}`, 8, 600);
  const [acc] = await db.select({ password: schema.account.password }).from(schema.account).where(and(eq(schema.account.userId, admin.id), eq(schema.account.providerId, "credential"))).limit(1);
  const ok = !!password && !!acc?.password && (await verifyPassword({ hash: acc.password, password }));
  if (!ok) {
    await audit(admin.id, "admin.stepup_failed", "user", admin.id);
    throw errors.forbidden("Your password is not correct. Nothing was changed.");
  }
}

export type CrmAction =
  | { action: "verify" | "unverify" | "unsuspend" | "sign_out" }
  | { action: "suspend"; reason: string }
  | { action: "grant"; months: number; note?: string }
  | { action: "revoke_grant"; grantId: string; reason: string }
  | { action: "revoke_all"; reason: string }
  | { action: "note"; body: string }
  | { action: "set_role"; role: "user" | "admin"; password: string }
  | { action: "delete"; confirmEmail: string; password: string };

export async function userAction(admin: CurrentUser, targetId: string, a: CrmAction, at = new Date()) {
  const target = await getUser(targetId);
  const self = target.id === admin.id;
  const log = (action: string, data?: Record<string, unknown>) => audit(admin.id, action, "user", target.id, data);

  switch (a.action) {
    case "verify":
    case "unverify": {
      await db.update(schema.user).set({ emailVerified: a.action === "verify", updatedAt: at }).where(eq(schema.user.id, target.id));
      await log(`user.${a.action}`);
      return { ok: true };
    }
    case "suspend": {
      if (self) throw errors.bad("You cannot suspend your own account.");
      if (target.role === "admin") throw errors.bad("Remove this person's administrator role before suspending them.");
      if (!a.reason.trim()) throw errors.bad("Give a reason for the suspension.");
      await db.update(schema.user).set({ status: "suspended", suspendedReason: a.reason.trim().slice(0, 500), updatedAt: at }).where(eq(schema.user.id, target.id));
      const sessions = await signOutEverywhere(target.id);
      await log("user.suspend", { reason: a.reason.trim().slice(0, 500), sessions });
      return { ok: true };
    }
    case "unsuspend": {
      await db.update(schema.user).set({ status: "active", suspendedReason: null, updatedAt: at }).where(eq(schema.user.id, target.id));
      await log("user.unsuspend");
      return { ok: true };
    }
    case "sign_out": {
      const sessions = await signOutEverywhere(target.id);
      await log("user.sign_out", { sessions });
      return { ok: true, sessions };
    }
    case "grant": {
      if (!Number.isInteger(a.months) || a.months < 1 || a.months > 36) throw errors.bad("Months must be between 1 and 36.");
      const grant = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"grant:" + target.id}))`);
        const [latest] = await tx
          .select({ endsAt: schema.accessGrant.endsAt })
          .from(schema.accessGrant)
          .where(and(eq(schema.accessGrant.userId, target.id), isNull(schema.accessGrant.revokedAt)))
          .orderBy(desc(schema.accessGrant.endsAt))
          .limit(1);
        const startsAt = latest && latest.endsAt > at ? latest.endsAt : at;
        const endsAt = addCalendarMonthsColombo(startsAt, a.months);
        const [g] = await tx
          .insert(schema.accessGrant)
          .values({ id: crypto.randomUUID(), userId: target.id, paymentId: null, startsAt, endsAt, months: a.months, createdBy: admin.id, note: a.note?.trim().slice(0, 500) || "Granted by an administrator" })
          .returning();
        return g;
      });
      await log("access.grant_manual", { months: a.months, startsAt: grant.startsAt.toISOString(), endsAt: grant.endsAt.toISOString(), note: a.note ?? null });
      return { ok: true, grant };
    }
    case "revoke_grant":
    case "revoke_all": {
      if (!a.reason.trim()) throw errors.bad("Give a reason for removing access.");
      const scope = a.action === "revoke_grant" ? eq(schema.accessGrant.id, a.grantId) : gt(schema.accessGrant.endsAt, at);
      const r = await db
        .update(schema.accessGrant)
        .set({ revokedAt: at, revokedBy: admin.id, revokeReason: a.reason.trim().slice(0, 500) })
        .where(and(eq(schema.accessGrant.userId, target.id), isNull(schema.accessGrant.revokedAt), scope))
        .returning({ id: schema.accessGrant.id });
      if (!r.length) throw errors.conflict("There is no active access to remove.");
      await log("access.revoke", { grants: r.map((x) => x.id), reason: a.reason.trim().slice(0, 500) });
      return { ok: true, revoked: r.length };
    }
    case "note": {
      if (!a.body.trim()) throw errors.bad("Write a note first.");
      await db.insert(schema.userNote).values({ id: crypto.randomUUID(), userId: target.id, authorId: admin.id, body: a.body.trim().slice(0, 2000) });
      await log("user.note");
      return { ok: true };
    }
    case "set_role": {
      if (self) throw errors.bad("You cannot change your own role.");
      if (a.role === "admin" && target.status === "suspended") throw errors.bad("A suspended account cannot be an administrator.");
      await confirmAdminPassword(admin, a.password);
      await db.update(schema.user).set({ role: a.role, updatedAt: at }).where(eq(schema.user.id, target.id));
      // The person signs in again so the new role applies cleanly everywhere.
      await signOutEverywhere(target.id);
      await log(a.role === "admin" ? "admin.promote" : "admin.demote");
      return { ok: true };
    }
    case "delete": {
      if (self) throw errors.bad("You cannot delete your own account here.");
      if (target.role === "admin") throw errors.bad("Remove this person's administrator role before deleting them.");
      if (a.confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) throw errors.bad("The email you typed does not match this account.");
      await confirmAdminPassword(admin, a.password);
      const files = await db.select({ key: schema.sourceFile.storageKey }).from(schema.sourceFile).where(eq(schema.sourceFile.userId, target.id));
      const receipts = await db.select({ key: schema.payment.receiptKey }).from(schema.payment).where(eq(schema.payment.userId, target.id));
      try {
        await storage().remove([...files, ...receipts].map((f) => f.key));
      } catch {
        throw errors.conflict("The user's files could not be removed from storage, so the account was not deleted. Try again.");
      }
      await db.delete(schema.user).where(eq(schema.user.id, target.id));
      await log("user.delete_by_admin", { projects: files.length, receipts: receipts.length });
      return { ok: true, deleted: true };
    }
  }
}

export async function dashboardStats() {
  const r = await db.execute(sql`
    select
      (select count(*)::int from "user") as users,
      (select count(*)::int from "user" where created_at > now() - interval '7 days') as "newUsers7d",
      (select count(*)::int from "user" where email_verified) as verified,
      (select count(*)::int from "user" where status = 'suspended') as suspended,
      (select count(distinct user_id)::int from access_grant where revoked_at is null and starts_at <= now() and ends_at > now()) as "paidUsers",
      (select count(*)::int from payment where status = 'pending') as "pendingPayments",
      (select coalesce(sum(amount_lkr), 0)::int from payment where status = 'approved') as "revenueLkr",
      (select coalesce(sum(amount_lkr), 0)::int from payment where status = 'approved' and reviewed_at > now() - interval '30 days') as "revenue30dLkr",
      (select count(*)::int from project) as projects,
      (select count(*)::int from job where status = 'failed') as "failedJobs"`);
  return r.rows[0];
}
