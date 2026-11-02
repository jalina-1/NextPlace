import { z } from "zod";
import { userRoute, readJson, assertSameOrigin } from "@/server/route";
import { confirmLocation } from "@/server/services/analysis";

export const dynamic = "force-dynamic";
export const POST = userRoute(async ({ req, user, params }) => {
  assertSameOrigin(req);
  const body = z.object({ institutionKey: z.string().max(400), candidateIndex: z.number().int().min(0).max(10).nullable() }).parse(await readJson(req));
  return confirmLocation(params.id, user, body);
});
