import { and, desc, eq, gt, lte } from "drizzle-orm";
import { db, schema } from "../db";

export type AccessStatus = {
  premium: boolean;
  activeUntil: Date | null;
  pendingPayment: boolean;
  lastRejected: { at: Date | null; note: string | null } | null;
  expiredAt: Date | null;
};

export async function getAccess(userId: string, at = new Date()): Promise<AccessStatus> {
  const grants = await db
    .select()
    .from(schema.accessGrant)
    .where(eq(schema.accessGrant.userId, userId))
    .orderBy(desc(schema.accessGrant.endsAt));
  const active = grants.find((g) => g.startsAt <= at && g.endsAt > at);
  const latestEnd = grants[0]?.endsAt ?? null;
  const pending = await db
    .select({ id: schema.payment.id })
    .from(schema.payment)
    .where(and(eq(schema.payment.userId, userId), eq(schema.payment.status, "pending")))
    .limit(1);
  const lastPayment = await db
    .select()
    .from(schema.payment)
    .where(eq(schema.payment.userId, userId))
    .orderBy(desc(schema.payment.createdAt))
    .limit(1);
  return {
    premium: !!active,
    activeUntil: active ? latestEnd : null,
    pendingPayment: pending.length > 0,
    lastRejected: lastPayment[0]?.status === "rejected" ? { at: lastPayment[0].reviewedAt, note: lastPayment[0].adminNote } : null,
    expiredAt: !active && latestEnd && latestEnd <= at ? latestEnd : null,
  };
}

export async function hasPremium(userId: string, at = new Date()): Promise<boolean> {
  const r = await db
    .select({ id: schema.accessGrant.id })
    .from(schema.accessGrant)
    .where(and(eq(schema.accessGrant.userId, userId), lte(schema.accessGrant.startsAt, at), gt(schema.accessGrant.endsAt, at)))
    .limit(1);
  return r.length > 0;
}
