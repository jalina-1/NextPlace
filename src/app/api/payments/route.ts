import { userRoute, assertSameOrigin } from "@/server/route";
import { errors } from "@/server/http";
import { listMyPayments, paymentInput, submitPayment, MAX_RECEIPT_BYTES } from "@/server/services/payments";
import { getSettings } from "@/server/services/settings";
import { getAccess } from "@/server/services/access";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/server/db";

export const dynamic = "force-dynamic";
export const GET = userRoute(async ({ user }) => {
  const s = await getSettings();
  const access = await getAccess(user.id);
  const payments = await listMyPayments(user);
  // The price is presented only at the payment step, after the user has seen their free preview.
  const [seen] = await db.select({ id: schema.project.id }).from(schema.project).where(and(eq(schema.project.userId, user.id), isNotNull(schema.project.previewFrozenAt))).limit(1);
  const eligible = !!seen || access.premium || payments.length > 0 || !!access.expiredAt;
  return {
    eligible,
    price: eligible ? { amountLkr: s.priceLkr, months: s.accessMonths } : null,
    bank: !eligible ? { configured: false } : s.bank.configured ? s.bank : { configured: false },
    access,
    payments,
  };
});
export const POST = userRoute(async ({ req, user }) => {
  assertSameOrigin(req);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_RECEIPT_BYTES + 100_000) throw errors.bad("Receipts must be 8 MB or smaller.");
  const form = await req.formData();
  const file = form.get("receipt");
  if (!(file instanceof File)) throw errors.bad("Attach the receipt.");
  const input = paymentInput.parse({
    method: form.get("method"),
    reference: (form.get("reference") as string) || undefined,
    paidOn: (form.get("paidOn") as string) || undefined,
    note: (form.get("note") as string) || undefined,
  });
  return submitPayment(user, input, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) });
});
