import { eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { errors } from "../http";
import type { CurrentUser } from "../session";
import { getOwnedProject, touchProject } from "./projects";
import { parsePreferences, preferencesSchema, validateThresholds, validateWeights, type Preferences } from "@/lib/preferences";
import { recomputeScores } from "./scores";
import { audit } from "./audit";

export async function getPreferences(projectId: string, user: CurrentUser) {
  await getOwnedProject(projectId, user);
  const [p] = await db.select().from(schema.preference).where(eq(schema.preference.projectId, projectId)).limit(1);
  return { preferences: parsePreferences(p?.data), revision: p?.revision ?? 1 };
}

/**
 * Saves preferences. Weights must be valid. Scores are recomputed from stored evidence only —
 * changing weights never repeats external lookups.
 */
export async function savePreferences(projectId: string, user: CurrentUser, raw: unknown, expectedRevision?: number) {
  await getOwnedProject(projectId, user);
  const prefs: Preferences = preferencesSchema.parse(raw);
  const issues = [...validateThresholds(prefs), ...validateWeights(prefs.criteria)];
  if (issues.length) throw errors.bad(issues[0].message, { issues: issues.map((i) => ({ path: i.field ?? "", message: i.message })) });
  const res = await db
    .update(schema.preference)
    .set({ data: prefs, revision: sql`${schema.preference.revision} + 1`, updatedAt: new Date() })
    .where(
      expectedRevision != null
        ? sql`${schema.preference.projectId} = ${projectId} and ${schema.preference.revision} = ${expectedRevision}`
        : eq(schema.preference.projectId, projectId),
    )
    .returning({ revision: schema.preference.revision });
  if (!res.length) throw errors.conflict("Preferences were changed elsewhere. Reload to see the latest version.");
  await touchProject(projectId);
  await recomputeScores(projectId);
  await audit(user.id, "preferences.save", "project", projectId, { revision: res[0].revision });
  return { revision: res[0].revision };
}
