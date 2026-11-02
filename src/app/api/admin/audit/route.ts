import { adminRoute } from "@/server/route";
import { listAudit, listOutbox } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const GET = adminRoute(async () => ({ events: await listAudit(), outbox: await listOutbox() }));
