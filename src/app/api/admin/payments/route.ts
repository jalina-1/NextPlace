import { adminRoute } from "@/server/route";
import { listPayments, listAccessGrants } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const GET = adminRoute(async ({ req }) => {
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  return { payments: await listPayments(status === "all" ? undefined : status), grants: await listAccessGrants() };
});
