import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { errors } from "../http";
import type { CurrentUser } from "../session";
import { defaultPreferences } from "@/lib/preferences";
import { getSettings } from "./settings";
import { hasPremium } from "./access";
import { bump, peek } from "./limits";
import { storage } from "../storage";
import { audit } from "./audit";

/** Loads a project only if it belongs to the user. Returns 404 (not 403) to avoid leaking existence. */
export async function getOwnedProject(projectId: string, user: CurrentUser) {
  if (typeof projectId !== "string" || projectId.length > 64) throw errors.notFound();
  const rows = await db
    .select()
    .from(schema.project)
    .where(and(eq(schema.project.id, projectId), eq(schema.project.userId, user.id)))
    .limit(1);
  if (!rows.length) throw errors.notFound("Project not found.");
  return rows[0];
}

export async function listProjects(user: CurrentUser) {
  const rows = await db
    .select({
      id: schema.project.id,
      name: schema.project.name,
      status: schema.project.status,
      isDemo: schema.project.isDemo,
      createdAt: schema.project.createdAt,
      updatedAt: schema.project.updatedAt,
      previewFrozenAt: schema.project.previewFrozenAt,
      optionCount: sql<number>`(select count(*)::int from ${schema.option} o where o.project_id = ${schema.project.id})`,
      run: sql<{ status: string; doneTasks: number; totalTasks: number } | null>`(select json_build_object('status', r.status, 'doneTasks', r.done_tasks, 'totalTasks', r.total_tasks) from analysis_run r where r.project_id = ${schema.project.id} order by r.created_at desc limit 1)`,
      finalStatus: sql<string | null>`(select f.status from final_order f where f.project_id = ${schema.project.id})`,
    })
    .from(schema.project)
    .where(eq(schema.project.userId, user.id))
    .orderBy(desc(schema.project.updatedAt));
  return rows;
}

export async function createProject(user: CurrentUser, name: string, opts: { isDemo?: boolean } = {}) {
  const premium = await hasPremium(user.id);
  const settings = await getSettings();
  if (!premium) {
    const created = await peek(`free_projects:${user.id}`, "lifetime");
    if (created >= settings.quotas.freeProjectsPerUser)
      throw errors.premium(
        `Free accounts can create ${settings.quotas.freeProjectsPerUser} project(s). Deleting a project does not reset this limit. Unlock full access to create more.`,
      );
  }
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.project).values({ id, userId: user.id, name: name.trim().slice(0, 120) || "My transfer list", isDemo: !!opts.isDemo });
    await tx.insert(schema.preference).values({ projectId: id, data: defaultPreferences() });
  });
  if (!premium) await bump(`free_projects:${user.id}`, "lifetime");
  await audit(user.id, "project.create", "project", id);
  return { id };
}

export async function renameProject(projectId: string, user: CurrentUser, name: string) {
  await getOwnedProject(projectId, user);
  await db.update(schema.project).set({ name: name.trim().slice(0, 120), updatedAt: new Date() }).where(eq(schema.project.id, projectId));
}

/** Deletes the project, its options, evidence links, final orders and stored source files. */
export async function deleteProject(projectId: string, user: CurrentUser) {
  await getOwnedProject(projectId, user);
  const files = await db.select({ key: schema.sourceFile.storageKey }).from(schema.sourceFile).where(eq(schema.sourceFile.projectId, projectId));
  await storage().remove(files.map((f) => f.key));
  await db.delete(schema.project).where(eq(schema.project.id, projectId));
  await audit(user.id, "project.delete", "project", projectId);
}

export async function touchProject(projectId: string, status?: string) {
  await db
    .update(schema.project)
    .set({ updatedAt: new Date(), ...(status ? { status } : {}) })
    .where(eq(schema.project.id, projectId));
}
