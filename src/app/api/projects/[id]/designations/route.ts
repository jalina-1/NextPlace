import { userRoute } from "@/server/route";
import { listDesignations } from "@/server/services/imports";

export const dynamic = "force-dynamic";
export const GET = userRoute(async ({ user, params }) => listDesignations(params.id, user));
