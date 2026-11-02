import { z } from "zod";
import { userRoute, readJson, assertSameOrigin } from "@/server/route";
import { applyProposal, discardProposal } from "@/server/services/assistant";

export const dynamic = "force-dynamic";
export const POST = userRoute(async ({ req, user, params }) => {
  assertSameOrigin(req);
  const { action } = z.object({ action: z.enum(["apply", "discard"]) }).parse(await readJson(req));
  return action === "apply" ? applyProposal(params.id, user, params.pid) : discardProposal(params.id, user, params.pid);
});
