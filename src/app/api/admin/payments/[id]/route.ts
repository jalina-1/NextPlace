import { z } from "zod";
import { adminRoute, readJson, assertSameOrigin } from "@/server/route";
import { addPaymentNote, approvePayment, rejectPayment } from "@/server/services/payments";

export const dynamic = "force-dynamic";
export const POST = adminRoute(async ({ req, user, params }) => {
  assertSameOrigin(req);
  const body = z.object({ action: z.enum(["approve", "reject", "note"]), note: z.string().max(1000).optional() }).parse(await readJson(req));
  if (body.action === "approve") return approvePayment(params.id, user, body.note);
  if (body.action === "reject") return rejectPayment(params.id, user, body.note ?? "");
  await addPaymentNote(params.id, user, body.note ?? "");
  return { ok: true };
});
