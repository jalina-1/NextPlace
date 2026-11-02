import { userRoute, readJson } from "@/server/route";
import { mappingInput, previewMapping } from "@/server/services/imports";

export const dynamic = "force-dynamic";
export const POST = userRoute(async ({ req, user, params }) => previewMapping(params.id, user, mappingInput.parse(await readJson(req))));
