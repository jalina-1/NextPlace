import { z } from "zod";
import { userRoute, readJson, assertSameOrigin } from "@/server/route";
import { getPreferences, savePreferences } from "@/server/services/preferences";

export const dynamic = "force-dynamic";
export const GET = userRoute(async ({ user, params }) => getPreferences(params.id, user));
export const PUT = userRoute(async ({ req, user, params }) => {
  assertSameOrigin(req);
  const body = z.object({ preferences: z.unknown(), revision: z.number().int().optional() }).parse(await readJson(req));
  return savePreferences(params.id, user, body.preferences, body.revision);
});
