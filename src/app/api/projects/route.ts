import { z } from "zod";
import { userRoute, readJson, assertSameOrigin } from "@/server/route";
import { createProject, listProjects } from "@/server/services/projects";

export const dynamic = "force-dynamic";
export const GET = userRoute(async ({ user }) => ({ projects: await listProjects(user) }));
export const POST = userRoute(async ({ req, user }) => {
  assertSameOrigin(req);
  const { name } = z.object({ name: z.string().trim().min(1).max(120) }).parse(await readJson(req));
  return createProject(user, name);
});
