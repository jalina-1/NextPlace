import { adminRoute } from "@/server/route";
import { listUsers, USER_FILTERS, type UserFilter } from "@/server/services/crm";

export const dynamic = "force-dynamic";
export const GET = adminRoute(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const f = sp.get("filter") ?? "all";
  const filter = (USER_FILTERS as readonly string[]).includes(f) ? (f as UserFilter) : "all";
  return listUsers(sp.get("q") ?? "", filter, Number(sp.get("page") ?? 0) || 0);
});
