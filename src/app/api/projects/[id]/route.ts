import { z } from "zod";
import { userRoute, readJson, assertSameOrigin } from "@/server/route";
import { deleteProject, getOwnedProject, renameProject } from "@/server/services/projects";
import { hasPremium } from "@/server/services/access";

export const dynamic = "force-dynamic";
export const GET = userRoute(async ({ user, params }) => {
  const p = await getOwnedProject(params.id, user);
  return { project: { id: p.id, name: p.name, status: p.status, isDemo: p.isDemo, previewFrozenAt: p.previewFrozenAt, previewBasis: p.previewBasis, createdAt: p.createdAt }, premium: await hasPremium(user.id) };
});
export const PATCH = userRoute(async ({ req, user, params }) => {
  assertSameOrigin(req);
  const { name } = z.object({ name: z.string().trim().min(1).max(120) }).parse(await readJson(req));
  await renameProject(params.id, user, name);
  return { ok: true };
});
export const DELETE = userRoute(async ({ req, user, params }) => {
  assertSameOrigin(req);
  await deleteProject(params.id, user);
  return { ok: true };
});
