import { userRoute, fileResponse } from "@/server/route";
import { getReceipt } from "@/server/services/payments";

export const dynamic = "force-dynamic";
export const GET = userRoute(async ({ user, params }) => {
  const r = await getReceipt(params.id, user);
  return fileResponse(r.bytes, r.mime, r.name, true);
});
