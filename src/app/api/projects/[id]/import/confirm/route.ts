import { userRoute, readJson, assertSameOrigin } from "@/server/route";
import { mappingInput, confirmMapping } from "@/server/services/imports";

export const dynamic = "force-dynamic";
export const POST = userRoute(async ({ req, user, params }) => {
  assertSameOrigin(req);
  return confirmMapping(params.id, user, mappingInput.parse(await readJson(req)));
});
