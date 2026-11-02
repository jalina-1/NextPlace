import { userRoute, fileResponse } from "@/server/route";
import { errors } from "@/server/http";
import { buildExport } from "@/server/services/export";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const GET = userRoute(async ({ req, user, params }) => {
  const u = new URL(req.url).searchParams;
  const revision = u.get("revision");
  if (!revision) throw errors.bad("revision is required");
  const out = await buildExport(params.id, user, revision, { analysisSheet: u.get("analysis") === "1" });
  return fileResponse(out.bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out.filename);
});
