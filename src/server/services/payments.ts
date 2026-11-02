/**
 * Manual payments (bank transfer / ATM deposit). A receipt upload never grants access;
 * only an admin approval does. Approval is transactional and idempotent:
 *  - the payment row moves pending → approved with a conditional UPDATE,
 *  - grants are serialized per user with an advisory lock,
 *  - access_grant.payment_id is UNIQUE, so one payment can never create two grants.
 * Renewal while active extends from the current expiry. Periods are calendar months in Asia/Colombo.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { errors } from "../http";
import type { CurrentUser } from "../session";
import { storage } from "../storage";
import { getSettings } from "./settings";
import { addCalendarMonthsColombo } from "@/lib/dates";
import { audit } from "./audit";

export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

export function detectReceiptType(head: Buffer): { mime: string; ext: string } | null {
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

export const paymentInput = z.object({
  method: z.enum(["bank_transfer", "atm_deposit"]),
  reference: z.string().trim().max(80).optional(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function submitPayment(user: CurrentUser, input: z.infer<typeof paymentInput>, file: { name: string; bytes: Buffer }) {
  const settings = await getSettings();
  if (!settings.bank.configured) throw errors.bad("Payment details are not configured yet. Please try again later.");
  if (file.bytes.length === 0 || file.bytes.length > MAX_RECEIPT_BYTES) throw errors.bad("Receipts must be an image or PDF up to 8 MB.");
  const t = detectReceiptType(file.bytes.subarray(0, 16));
  if (!t) throw errors.bad("Upload the receipt as a JPG, PNG, WEBP image or a PDF.");
  const pending = await db.select({ id: schema.payment.id }).from(schema.payment).where(and(eq(schema.payment.userId, user.id), eq(schema.payment.status, "pending")));
  if (pending.length >= 3) throw errors.bad("You already have payments waiting for review.");
  const id = crypto.randomUUID();
  const key = `receipts/${user.id}/${id}.${t.ext}`;
  await storage().put(key, file.bytes, t.mime);
  await db.insert(schema.payment).values({
    id,
    userId: user.id,
    method: input.method,
    amountLkr: settings.priceLkr,
    reference: input.reference || null,
    paidOn: input.paidOn || null,
    receiptKey: key,
    receiptMime: t.mime,
    receiptName: file.name.slice(0, 120),
    userNote: input.note || null,
  });
  await audit(user.id, "payment.submit", "payment", id, { method: input.method });
  return { id };
}

export async function listMyPayments(user: CurrentUser) {
  return db
    .select({
      id: schema.payment.id,
      method: schema.payment.method,
      amountLkr: schema.payment.amountLkr,
      reference: schema.payment.reference,
      paidOn: schema.payment.paidOn,
      status: schema.payment.status,
      adminNote: schema.payment.adminNote,
      createdAt: schema.payment.createdAt,
      reviewedAt: schema.payment.reviewedAt,
    })
    .from(schema.payment)
    .where(eq(schema.payment.userId, user.id))
    .orderBy(desc(schema.payment.createdAt));
}

/** Owner or admin may view a receipt; everyone else gets 404. */
export async function getReceipt(paymentId: string, user: CurrentUser) {
  const [p] = await db.select().from(schema.payment).where(eq(schema.payment.id, paymentId)).limit(1);
  if (!p || (p.userId !== user.id && user.role !== "admin")) throw errors.notFound();
  if (user.role === "admin" && p.userId !== user.id) await audit(user.id, "payment.view_receipt", "payment", p.id);
  return { mime: p.receiptMime, name: p.receiptName, bytes: await storage().get(p.receiptKey) };
}

export async function approvePayment(paymentId: string, admin: CurrentUser, note?: string, at = new Date()) {
  const settings = await getSettings();
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(schema.payment).where(eq(schema.payment.id, paymentId)).for("update").limit(1);
    if (!p) throw errors.notFound("Payment not found.");
    if (p.status === "approved") {
      const [g] = await tx.select().from(schema.accessGrant).where(eq(schema.accessGrant.paymentId, p.id)).limit(1);
      return { alreadyApproved: true, grant: g ?? null };
    }
    if (p.status !== "pending") throw errors.conflict(`Payment is ${p.status}; it cannot be approved.`);
    // Serialize grant calculations for this user.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"grant:" + p.userId}))`);
    const [latest] = await tx
      .select({ endsAt: schema.accessGrant.endsAt })
      .from(schema.accessGrant)
      .where(eq(schema.accessGrant.userId, p.userId))
      .orderBy(desc(schema.accessGrant.endsAt))
      .limit(1);
    const startsAt = latest && latest.endsAt > at ? latest.endsAt : at;
    const endsAt = addCalendarMonthsColombo(startsAt, settings.accessMonths);
    const [grant] = await tx
      .insert(schema.accessGrant)
      .values({ id: crypto.randomUUID(), userId: p.userId, paymentId: p.id, startsAt, endsAt, months: settings.accessMonths, createdBy: admin.id, note: note ?? null })
      .returning();
    await tx
      .update(schema.payment)
      .set({ status: "approved", reviewedBy: admin.id, reviewedAt: at, adminNote: note ?? p.adminNote })
      .where(and(eq(schema.payment.id, p.id), eq(schema.payment.status, "pending")));
    await tx.insert(schema.auditEvent).values({
      id: crypto.randomUUID(),
      actorUserId: admin.id,
      action: "payment.approve",
      targetType: "payment",
      targetId: p.id,
      data: { userId: p.userId, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), months: settings.accessMonths },
    });
    return { alreadyApproved: false, grant };
  });
}

export async function rejectPayment(paymentId: string, admin: CurrentUser, note: string) {
  if (!note.trim()) throw errors.bad("Add a note explaining the rejection; the user will see it.");
  const res = await db
    .update(schema.payment)
    .set({ status: "rejected", reviewedBy: admin.id, reviewedAt: new Date(), adminNote: note.trim().slice(0, 1000) })
    .where(and(eq(schema.payment.id, paymentId), eq(schema.payment.status, "pending")))
    .returning({ id: schema.payment.id });
  if (!res.length) throw errors.conflict("Only pending payments can be rejected.");
  await audit(admin.id, "payment.reject", "payment", paymentId);
  return { ok: true };
}

export async function addPaymentNote(paymentId: string, admin: CurrentUser, note: string) {
  await db.update(schema.payment).set({ adminNote: note.trim().slice(0, 1000) }).where(eq(schema.payment.id, paymentId));
  await audit(admin.id, "payment.note", "payment", paymentId);
}
