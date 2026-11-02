import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { parsePreferences, type Preferences } from "@/lib/preferences";
import { scoreAll, type OptionEvidence, type OptionScoreResult } from "@/lib/scoring";
import { haversineKm } from "../providers/demo";
import { climateKey, facilitiesKey, routeKey } from "./evidence-keys";

export type EvidenceRef = {
  kind: string;
  provider: string;
  status: string;
  isDemo: boolean;
  retrievedAt: string;
  expiresAt: string | null;
  sourceUrl: string | null;
  attribution: string | null;
  value: unknown;
  units: unknown;
  context: unknown;
};

export type OptionEvidenceBundle = {
  evidence: OptionEvidence;
  location: { status: string; label: string | null; isDemo: boolean; lat: number | null; lng: number | null } | null;
  straightKm: number | null;
  refs: EvidenceRef[];
};

/** Assembles stored evidence for each option. No external calls are made here. */
export async function buildEvidence(projectId: string, prefs: Preferences, options: (typeof schema.option.$inferSelect)[]) {
  const pis = await db.select().from(schema.projectInstitution).where(eq(schema.projectInstitution.projectId, projectId));
  const insts = pis.length
    ? await db.select({ key: schema.institution.key, isDemo: schema.institution.isDemo }).from(schema.institution).where(inArray(schema.institution.key, pis.map((p) => p.institutionKey)))
    : [];
  const instDemo = new Map(insts.map((i) => [i.key, i.isDemo]));
  const piByKey = new Map(pis.map((p) => [p.institutionKey, p]));
  const subjectKeys = new Set<string>();
  for (const p of pis) {
    if (!p.chosen) continue;
    subjectKeys.add(climateKey(p.chosen.lat, p.chosen.lng));
    subjectKeys.add(facilitiesKey(p.chosen.lat, p.chosen.lng, prefs.facilities.radiusKm));
    if (prefs.home) subjectKeys.add(routeKey(projectId, prefs.home, p.chosen));
    if (prefs.secondLocation) subjectKeys.add(routeKey(projectId, prefs.secondLocation, p.chosen));
  }
  const ev = subjectKeys.size ? await db.select().from(schema.evidence).where(inArray(schema.evidence.subjectKey, [...subjectKeys])) : [];
  const bySubject = new Map<string, (typeof ev)[number][]>();
  for (const e of ev) bySubject.set(e.subjectKey, [...(bySubject.get(e.subjectKey) ?? []), e]);
  const get = (key: string, kind: string) => bySubject.get(key)?.find((e) => e.kind === kind && e.status === "ok");
  const toRef = (e: (typeof ev)[number]): EvidenceRef => ({
    kind: e.kind,
    provider: e.provider,
    status: e.status,
    isDemo: e.isDemo,
    retrievedAt: e.retrievedAt.toISOString(),
    expiresAt: e.expiresAt?.toISOString() ?? null,
    sourceUrl: e.sourceUrl,
    attribution: e.attribution,
    value: e.value,
    units: e.units,
    context: e.queryContext,
  });

  const out = new Map<string, OptionEvidenceBundle>();
  for (const o of options) {
    const pi = o.institutionKey ? piByKey.get(o.institutionKey) : undefined;
    const loc = pi?.chosen ?? null;
    if (!loc) {
      out.set(o.id, {
        evidence: {},
        location: pi ? { status: pi.status, label: null, isDemo: !!instDemo.get(pi.institutionKey), lat: null, lng: null } : null,
        straightKm: null,
        refs: [],
      });
      continue;
    }
    const refs: EvidenceRef[] = [];
    const leg = (from: { lat: number; lng: number } | null) => {
      if (!from) return null;
      const k = routeKey(projectId, from, loc);
      const d = get(k, "route_drive");
      const t = get(k, "route_transit");
      for (const e of bySubject.get(k) ?? []) refs.push(toRef(e));
      const dv = d?.value as { minutes?: number; km?: number } | undefined;
      const tv = t?.value as { minutes?: number } | undefined;
      return { driveMinutes: dv?.minutes ?? null, driveKm: dv?.km ?? null, transitMinutes: tv?.minutes ?? null, straightKm: haversineKm(from, loc) };
    };
    const primary = leg(prefs.home);
    const second = leg(prefs.secondLocation);
    const c = get(climateKey(loc.lat, loc.lng), "climate");
    const f = get(facilitiesKey(loc.lat, loc.lng, prefs.facilities.radiusKm), "facilities");
    for (const e of [...(bySubject.get(climateKey(loc.lat, loc.lng)) ?? []), ...(bySubject.get(facilitiesKey(loc.lat, loc.lng, prefs.facilities.radiusKm)) ?? [])]) refs.push(toRef(e));
    const cv = c?.value as { meanTempC?: number | null; annualRainMm?: number | null } | undefined;
    const fv = f?.value as { counts?: Record<string, number | null>; radiusKm?: number } | undefined;
    out.set(o.id, {
      evidence: {
        travel: { primary, second },
        climate: cv ? { meanTempC: cv.meanTempC ?? null, annualRainMm: cv.annualRainMm ?? null } : null,
        facilities: fv?.counts ? { radiusKm: fv.radiusKm ?? prefs.facilities.radiusKm, counts: fv.counts } : null,
      },
      location: { status: pi!.status, label: loc.label, isDemo: !!instDemo.get(pi!.institutionKey), lat: loc.lat, lng: loc.lng },
      straightKm: primary?.straightKm != null ? Math.round(primary.straightKm * 10) / 10 : null,
      refs,
    });
  }
  return out;
}

export async function computeScores(projectId: string) {
  const [pref] = await db.select().from(schema.preference).where(eq(schema.preference.projectId, projectId)).limit(1);
  const prefs = parsePreferences(pref?.data);
  const options = await db.select().from(schema.option).where(eq(schema.option.projectId, projectId));
  const bundles = await buildEvidence(projectId, prefs, options);
  const evMap = new Map<string, OptionEvidence>([...bundles].map(([k, v]) => [k, v.evidence]));
  const results = scoreAll(
    options.map((o) => ({ id: o.id, seq: o.seq, institution: o.institution, district: o.district, designation: o.designation, decision: o.decision })),
    evMap,
    prefs,
  );
  return { prefs, revision: pref?.revision ?? 1, options, bundles, results };
}

const lastRecompute = new Map<string, number>();

/** Recomputes and stores a score revision from existing evidence (never triggers lookups). */
export async function recomputeScores(projectId: string, opts: { minIntervalMs?: number } = {}) {
  if (opts.minIntervalMs && Date.now() - (lastRecompute.get(projectId) ?? 0) < opts.minIntervalMs) return null;
  lastRecompute.set(projectId, Date.now());
  const { prefs, revision, results, bundles } = await computeScores(projectId);
  const id = crypto.randomUUID();
  const statusCounts: Record<string, number> = {};
  for (const r of results) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  const anyDemo = [...bundles.values()].some((b) => b.location?.isDemo || b.refs.some((r) => r.isDemo));
  await db.transaction(async (tx) => {
    await tx.insert(schema.scoreRun).values({
      id,
      projectId,
      preferenceRevision: revision,
      weights: prefs.criteria,
      summary: { statusCounts, total: results.length, demoData: anyDemo },
    });
    const rows = results.map((r) => ({
      scoreRunId: id,
      optionId: r.optionId,
      systemRank: r.systemRank,
      finalScore: r.finalScore,
      coverage: r.coverage,
      status: r.status,
      breakdown: { criteria: r.breakdown, exclusionReasons: r.exclusionReasons, warnings: r.warnings },
      explanation: r.explanation,
    }));
    for (let i = 0; i < rows.length; i += 500) await tx.insert(schema.optionScore).values(rows.slice(i, i + 500));
  });
  // Retain the 3 latest score runs plus any referenced by finalized revisions.
  const keep = await db.select({ id: schema.scoreRun.id }).from(schema.scoreRun).where(eq(schema.scoreRun.projectId, projectId)).orderBy(desc(schema.scoreRun.createdAt)).limit(3);
  const referenced = await db.select({ id: schema.finalOrderRevision.scoreRunId }).from(schema.finalOrderRevision).where(eq(schema.finalOrderRevision.projectId, projectId));
  const keepIds = [...keep.map((k) => k.id), ...referenced.map((r) => r.id).filter((x): x is string => !!x)];
  await db.delete(schema.scoreRun).where(and(eq(schema.scoreRun.projectId, projectId), notInArray(schema.scoreRun.id, keepIds)));
  return id;
}

export async function latestScoreRun(projectId: string) {
  const [r] = await db.select().from(schema.scoreRun).where(eq(schema.scoreRun.projectId, projectId)).orderBy(desc(schema.scoreRun.createdAt)).limit(1);
  return r ?? null;
}

/**
 * Freezes the free preview (max 3 option IDs) the first time an analysis completes.
 * Chosen from options actually evaluated in that run; better-evidenced options first.
 */
export async function freezePreviewIfNeeded(projectId: string, runId: string) {
  const [p] = await db.select().from(schema.project).where(eq(schema.project.id, projectId)).limit(1);
  if (!p || p.previewFrozenAt) return;
  const [run] = await db.select().from(schema.analysisRun).where(eq(schema.analysisRun.id, runId)).limit(1);
  const sr = await latestScoreRun(projectId);
  if (!run || !sr) return;
  const evaluated = new Set(run.evaluatedOptionIds);
  const scores = await db.select().from(schema.optionScore).where(eq(schema.optionScore.scoreRunId, sr.id));
  const ranked = scores
    .filter((s) => s.systemRank != null && evaluated.has(s.optionId) && s.finalScore != null)
    .sort((a, b) => (a.systemRank ?? 0) - (b.systemRank ?? 0));
  const ids = ranked.slice(0, 3).map((s) => s.optionId);
  const eligible = scores.filter((s) => ["complete", "provisional", "low_coverage", "unscored"].includes(s.status)).length;
  await db
    .update(schema.project)
    .set({
      previewOptionIds: ids,
      previewFrozenAt: new Date(),
      previewBasis: {
        runId,
        level: run.level,
        totalOptions: run.optionCount,
        eligibleOptions: eligible,
        evaluatedOptions: run.evaluatedOptionCount,
        allEligibleEvaluated: run.evaluatedOptionCount >= eligible,
        frozenWithWeights: sr.weights,
      },
    })
    .where(and(eq(schema.project.id, projectId), sql`${schema.project.previewFrozenAt} is null`));
}

export type { OptionScoreResult };
