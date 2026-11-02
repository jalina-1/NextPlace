import { userRoute, readJson, assertSameOrigin } from "@/server/route";
import { correctionInput, correctOption, decisionInput, listSourceRows, setDecision } from "@/server/services/imports";

export const dynamic = "force-dynamic";
export const GET = userRoute(async ({ req, user, params }) => {
  const u = new URL(req.url).searchParams;
  return listSourceRows(params.id, user, { filter: u.get("filter") ?? undefined, q: u.get("q") ?? undefined, offset: Number(u.get("offset") ?? 0), limit: Number(u.get("limit") ?? 50) });
});
export const PATCH = userRoute(async ({ req, user, params }) => {
  assertSameOrigin(req);
  await correctOption(params.id, user, correctionInput.parse(await readJson(req)));
  return { ok: true };
});
export const POST = userRoute(async ({ req, user, params }) => {
  assertSameOrigin(req);
  return setDecision(params.id, user, decisionInput.parse(await readJson(req)));
});
