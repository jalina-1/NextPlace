import { userRoute, readJson, assertSameOrigin } from "@/server/route";
import { rentInput, setUserRent } from "@/server/services/results";

export const dynamic = "force-dynamic";
export const POST = userRoute(async ({ req, user, params }) => {
  assertSameOrigin(req);
  return setUserRent(params.id, user, params.optionId, rentInput.parse(await readJson(req)).rentLkr);
});
