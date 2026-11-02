import { handle } from "@/server/http";
import { getSessionState } from "@/server/session";
import { getAccess } from "@/server/services/access";

export const dynamic = "force-dynamic";
export const GET = handle(async (req: Request) => {
  const s = await getSessionState(req.headers);
  if (s.status !== "active") return { session: s.status };
  return { session: "active", user: s.user, access: await getAccess(s.user.id) };
});
