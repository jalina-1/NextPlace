import { handle } from "@/server/http";
import { getSessionState } from "@/server/session";
import { getAccess } from "@/server/services/access";
import { adminPath } from "@/middleware";

export const dynamic = "force-dynamic";
export const GET = handle(async (req: Request) => {
  const s = await getSessionState(req.headers);
  if (s.status !== "active") return { session: s.status };
  // Only administrators are told where the admin console lives.
  return { session: "active", user: s.user, access: await getAccess(s.user.id), ...(s.user.role === "admin" ? { adminPath: adminPath() } : {}) };
});
