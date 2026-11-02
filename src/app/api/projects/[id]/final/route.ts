import { z } from "zod";
import { userRoute, readJson, assertSameOrigin } from "@/server/route";
import { finalize, getFinalOrder, reopen, resetToRanking, saveFinalOrder, saveOrderInput, validateForFinalize } from "@/server/services/final-order";

export const dynamic = "force-dynamic";
export const GET = userRoute(async ({ user, params }) => {
  const f = await getFinalOrder(params.id, user);
  return { ...f, validation: await validateForFinalize(params.id, f.items) };
});
export const PUT = userRoute(async ({ req, user, params }) => {
  assertSameOrigin(req);
  return saveFinalOrder(params.id, user, saveOrderInput.parse(await readJson(req)));
});
export const POST = userRoute(async ({ req, user, params }) => {
  assertSameOrigin(req);
  const body = z.object({ action: z.enum(["reset", "finalize", "reopen"]), expectedRevision: z.number().int().min(1).optional() }).parse(await readJson(req));
  if (body.action === "reset") return resetToRanking(params.id, user, body.expectedRevision ?? 0);
  if (body.action === "finalize") return finalize(params.id, user, body.expectedRevision ?? 0);
  return reopen(params.id, user);
});
