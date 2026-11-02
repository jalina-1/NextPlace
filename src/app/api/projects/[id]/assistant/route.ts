import { userRoute, readJson, assertSameOrigin } from "@/server/route";
import { chat, chatInput, history } from "@/server/services/assistant";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = userRoute(async ({ user, params }) => history(params.id, user));
export const POST = userRoute(async ({ req, user, params }) => {
  assertSameOrigin(req);
  return chat(params.id, user, chatInput.parse(await readJson(req)).message);
});
