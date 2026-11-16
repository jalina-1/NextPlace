import { z } from "zod";
import { adminRoute, readJson, assertSameOrigin } from "@/server/route";
import { userAction, userDetail, type CrmAction } from "@/server/services/crm";

export const dynamic = "force-dynamic";
export const GET = adminRoute(async ({ params }) => userDetail(params.id));

const text = (max: number) => z.string().max(max);
const body = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["verify", "unverify", "unsuspend", "sign_out"]) }),
  z.object({ action: z.literal("suspend"), reason: text(500) }),
  z.object({ action: z.literal("grant"), months: z.number().int().min(1).max(36), note: text(500).optional() }),
  z.object({ action: z.literal("revoke_grant"), grantId: text(100), reason: text(500) }),
  z.object({ action: z.literal("revoke_all"), reason: text(500) }),
  z.object({ action: z.literal("note"), body: text(2000) }),
  z.object({ action: z.literal("set_role"), role: z.enum(["user", "admin"]), password: text(200) }),
  z.object({ action: z.literal("delete"), confirmEmail: text(320), password: text(200) }),
]);

export const POST = adminRoute(async ({ req, user, params }) => {
  assertSameOrigin(req, true);
  return userAction(user, params.id, body.parse(await readJson(req)) as CrmAction);
});
