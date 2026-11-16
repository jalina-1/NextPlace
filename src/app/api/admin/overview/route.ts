import { adminRoute } from "@/server/route";
import { healthCheck } from "@/server/services/admin";
import { dashboardStats } from "@/server/services/crm";

export const dynamic = "force-dynamic";
export const GET = adminRoute(async () => ({ stats: await dashboardStats(), health: await healthCheck() }));
