/**
 * Final preference order (premium). The system ranking is never modified;
 * the user's order is stored separately with a revision counter for optimistic concurrency.
 *
 * Invariant enforced on every save: items ∪ excluded contains every option of the
 * project exactly once — no entry can be lost or duplicated.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { errors } from "../http";
import type { CurrentUser } from "../session";
import { getOwnedProject } from "./projects";
import { hasPremium } from "./access";
import { computeScores, recomputeScores, latestScoreRun } from "./scores";
import { audit } from "./audit";

export async function requirePremium(user: CurrentUser) {
  if (!(await hasPremium(user.id))) throw errors.premium("Final list editing requires full access.");
}

export function validatePartition(allIds: string[], items: string[], excluded: string[]): string[] {
  const problems: string[] = [];
  const all = new Set(allIds);
  const seen = new Set<string>();
  for (const id of [...items, ...excluded]) {
    if (!all.has(id)) problems.push(`Unknown option ${id}`);
    else if (seen.has(id)) problems.push(`Duplicate option ${id}`);
    seen.add(id);
  }
  for (const id of all) if (!seen.has(id)) problems.push(`Missing option ${id}`);
  return problems;
}

/** Initial order: system ranking for rankable options; everything else listed as excluded. */
async function initialOrder(projectId: string) {
  const { results } = await computeScores(projectId);
  const items = results.filter((r) => r.systemRank != null).map((r) => r.optionId);
  const excluded = results.filter((r) => r.systemRank == null).map((r) => r.optionId);
  return { items, excluded };
}

export async function getFinalOrder(projectId: string, user: CurrentUser) {
  await getOwnedProject(projectId, user);
  await requirePremium(user);
  let [f] = await db.select().from(schema.finalOrder).where(eq(schema.finalOrder.projectId, projectId)).limit(1);
  if (!f) {
    const init = await initialOrder(projectId);
    if (init.items.length + init.excluded.length === 0) throw errors.bad("Import and analyze a list first.");
    await db.insert(schema.finalOrder).values({ projectId, items: init.items, excluded: init.excluded, revision: 1 }).onConflictDoNothing();
    [f] = await db.select().from(schema.finalOrder).where(eq(schema.finalOrder.projectId, projectId)).limit(1);
  }
  const revisions = await db
    .select({ id: schema.finalOrderRevision.id, number: schema.finalOrderRevision.number, createdAt: schema.finalOrderRevision.createdAt })
    .from(schema.finalOrderRevision)
    .where(eq(schema.finalOrderRevision.projectId, projectId))
    .orderBy(desc(schema.finalOrderRevision.number));
  return { ...f, revisions };
}

export const saveOrderInput = z.object({
  expectedRevision: z.number().int().min(1),
  items: z.array(z.string().max(64)).max(5000),
  excluded: z.array(z.string().max(64)).max(5000),
});

export async function saveFinalOrder(projectId: string, user: CurrentUser, input: z.infer<typeof saveOrderInput>) {
  await getOwnedProject(projectId, user);
  await requirePremium(user);
  const all = (await db.select({ id: schema.option.id }).from(schema.option).where(eq(schema.option.projectId, projectId))).map((o) => o.id);
  const problems = validatePartition(all, input.items, input.excluded);
  if (problems.length) throw errors.bad("The list is inconsistent; nothing was saved.", { problems: problems.slice(0, 10) });
  const res = await db
    .update(schema.finalOrder)
    .set({ items: input.items, excluded: input.excluded, revision: sql`${schema.finalOrder.revision} + 1`, updatedAt: new Date() })
    .where(and(eq(schema.finalOrder.projectId, projectId), eq(schema.finalOrder.revision, input.expectedRevision), eq(schema.finalOrder.status, "editing")))
    .returning({ revision: schema.finalOrder.revision });
  if (!res.length) {
    const [cur] = await db.select().from(schema.finalOrder).where(eq(schema.finalOrder.projectId, projectId)).limit(1);
    if (cur?.status === "finalized") throw errors.conflict("This list is finalized. Reopen it to make changes.", { currentRevision: cur.revision });
    throw errors.conflict("A newer version was saved in another tab or device. Reload to continue.", { currentRevision: cur?.revision });
  }
  return { revision: res[0].revision };
}

/** Replaces the manual order with the current system ranking (UI asks for explicit confirmation). */
export async function resetToRanking(projectId: string, user: CurrentUser, expectedRevision: number) {
  await getOwnedProject(projectId, user);
  await requirePremium(user);
  const init = await initialOrder(projectId);
  return saveFinalOrder(projectId, user, { expectedRevision, ...init });
}

export async function validateForFinalize(projectId: string, items: string[]) {
  const errs: string[] = [];
  if (items.length === 0) errs.push("Your final list is empty.");
  const opts = await db.select().from(schema.option).where(eq(schema.option.projectId, projectId));
  const byId = new Map(opts.map((o) => [o.id, o]));
  const incomplete = items.filter((id) => byId.get(id)?.flags.includes("incomplete"));
  if (incomplete.length) errs.push(`${incomplete.length} entr${incomplete.length === 1 ? "y is" : "ies are"} missing institution or post information. Correct or exclude them.`);
  return errs;
}

export async function finalize(projectId: string, user: CurrentUser, expectedRevision: number) {
  await getOwnedProject(projectId, user);
  await requirePremium(user);
  const [f] = await db.select().from(schema.finalOrder).where(eq(schema.finalOrder.projectId, projectId)).limit(1);
  if (!f) throw errors.bad("Open the final list editor first.");
  if (f.status === "finalized") throw errors.conflict("Already finalized.");
  if (f.revision !== expectedRevision) throw errors.conflict("A newer version exists. Reload before finalizing.", { currentRevision: f.revision });
  const errs = await validateForFinalize(projectId, f.items);
  if (errs.length) throw errors.bad(errs.join(" "), { issues: errs });
  const scoreRunId = (await recomputeScores(projectId)) ?? (await latestScoreRun(projectId))?.id ?? null;
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    const [{ n }] = (await tx.execute(sql`select coalesce(max(number), 0)::int + 1 as n from final_order_revision where project_id = ${projectId}`)).rows as { n: number }[];
    await tx.insert(schema.finalOrderRevision).values({ id, projectId, number: n, items: f.items, excluded: f.excluded, scoreRunId, createdBy: user.id });
    const upd = await tx
      .update(schema.finalOrder)
      .set({ status: "finalized", finalizedRevisionId: id, revision: sql`${schema.finalOrder.revision} + 1`, updatedAt: new Date() })
      .where(and(eq(schema.finalOrder.projectId, projectId), eq(schema.finalOrder.revision, expectedRevision)))
      .returning({ r: schema.finalOrder.revision });
    if (!upd.length) throw errors.conflict("A newer version exists. Reload before finalizing.");
  });
  await audit(user.id, "final.finalize", "project", projectId, { revisionId: id, items: f.items.length });
  return { revisionId: id };
}

export async function reopen(projectId: string, user: CurrentUser) {
  await getOwnedProject(projectId, user);
  await requirePremium(user);
  const res = await db
    .update(schema.finalOrder)
    .set({ status: "editing", revision: sql`${schema.finalOrder.revision} + 1`, updatedAt: new Date() })
    .where(and(eq(schema.finalOrder.projectId, projectId), eq(schema.finalOrder.status, "finalized")))
    .returning({ revision: schema.finalOrder.revision });
  if (!res.length) throw errors.conflict("The list is not finalized.");
  await audit(user.id, "final.reopen", "project", projectId);
  return res[0];
}
