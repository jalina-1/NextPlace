import { adminRoute } from "@/server/route";
import { adminOverview, healthCheck } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const GET = adminRoute(async () => ({ counts: await adminOverview(), health: await healthCheck() }));
