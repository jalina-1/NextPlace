import { userRoute, fileResponse } from "@/server/route";
import { downloadSource } from "@/server/services/imports";

export const dynamic = "force-dynamic";
export const GET = userRoute(async ({ user, params }) => {
  const f = await downloadSource(params.id, user);
  return fileResponse(f.bytes, f.mime, f.name);
});
