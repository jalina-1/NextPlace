import { userRoute } from "@/server/route";
import { getResults, resultsQuery } from "@/server/services/results";

export const dynamic = "force-dynamic";
export const GET = userRoute(async ({ req, user, params }) => {
  const q = Object.fromEntries(new URL(req.url).searchParams);
  return getResults(params.id, user, resultsQuery.parse(q));
});
