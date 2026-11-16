import { adminRoute, fileResponse } from "@/server/route";
import { exportUsersCsv, USER_FILTERS, type UserFilter } from "@/server/services/crm";
import { audit } from "@/server/services/audit";

export const dynamic = "force-dynamic";
export const GET = adminRoute(async ({ req, user }) => {
  const sp = new URL(req.url).searchParams;
  const f = sp.get("filter") ?? "all";
  const filter = (USER_FILTERS as readonly string[]).includes(f) ? (f as UserFilter) : "all";
  const csv = await exportUsersCsv(sp.get("q") ?? "", filter);
  await audit(user.id, "admin.export_users", "user", "list", { filter });
  return fileResponse(Buffer.from("﻿" + csv, "utf8"), "text/csv; charset=utf-8", "nextplace-users.csv");
});
