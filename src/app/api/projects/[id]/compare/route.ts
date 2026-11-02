import { z } from "zod";
import { userRoute, readJson } from "@/server/route";
import { compareInput, compareOptions, topAccessible } from "@/server/services/results";

export const dynamic = "force-dynamic";
export const GET = userRoute(async ({ req, user, params }) => {
  const n = z.coerce.number().int().min(1).max(200).parse(new URL(req.url).searchParams.get("top") ?? "3");
  return topAccessible(params.id, user, n);
});
export const POST = userRoute(async ({ req, user, params }) => compareOptions(params.id, user, compareInput.parse(await readJson(req)).optionIds));
