import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { errors } from "../http";
import type { CurrentUser } from "../session";
import { getOwnedProject, touchProject } from "./projects";
import { hasPremium } from "./access";
import { getSettings } from "./settings";
import { bump } from "./limits";
import { enqueue, cancelRunJobs, runWorker, NonRetryableError, type JobRow } from "./jobs";
import { providers } from "../providers";
import { parsePreferences, validateWeights, type Preferences } from "@/lib/preferences";
import { postScore } from "@/lib/scoring";
import { colomboDateKey } from "@/lib/dates";
import { recomputeScores, freezePreviewIfNeeded } from "./scores";
import { audit } from "./audit";
import { climateKey, facilitiesKey, routeKey } from "./evidence-keys";
import type { LocationCandidate } from "../db/schema";
import { logger } from "../logger";

async function loadPrefs(projectId: string): Promise<{ prefs: Preferences; revision: number }> {
  const [p] = await db.select().from(schema.preference).where(eq(schema.preference.projectId, projectId)).limit(1);
  return { prefs: parsePreferences(p?.data), revision: p?.revision ?? 1 };
}

function routeModes(prefs: Preferences): ("drive" | "transit")[] {
  // Driving is always requested because it provides road distance (used only as a fallback metric).
  return prefs.travelMode === "driving" ? ["drive"] : ["drive", "transit"];
}

/** Picks which options a free preview run researches when the list exceeds the preview limit. */
export function selectForRun<T extends { id: string; seq: number; designation: string | null; institution: string | null; decision: string; flags: string[] }>(
  options: T[],
  prefs: Preferences,
  limit: number,
): T[] {
  const eligible = options.filter((o) => o.decision === "consider" && !o.flags.includes("incomplete"));
  const rank = (o: T) => postScore(o.designation, prefs).matchedRank ?? 999;
  return [...eligible].sort((a, b) => rank(a) - rank(b) || a.seq - b.seq).slice(0, limit);
}

export async function startAnalysis(projectId: string, user: CurrentUser) {
  await getOwnedProject(projectId, user);
  const { prefs } = await loadPrefs(projectId);
  const weightIssues = validateWeights(prefs.criteria);
  if (weightIssues.length) throw errors.bad(weightIssues.map((i) => i.message).join(" "));
  if (prefs.criteria.travel.enabled && !prefs.home) throw errors.bad("Set your approximate home location (or disable the travel criterion) before analysis.");
  const mapping = await db.select().from(schema.importMapping).where(eq(schema.importMapping.projectId, projectId)).limit(1);
  if (!mapping.length) throw errors.bad("Confirm the column mapping before analysis.");

  const active = await db
    .select()
    .from(schema.analysisRun)
    .where(and(eq(schema.analysisRun.projectId, projectId), inArray(schema.analysisRun.status, ["queued", "running"])))
    .limit(1);
  if (active.length) return { runId: active[0].id, reused: true };

  const settings = await getSettings();
  const n = await bump(`analyses:${projectId}`, colomboDateKey());
  if (n > settings.quotas.analysesPerProjectPerDay) throw errors.limit("Daily analysis limit for this project reached. Try again tomorrow.");

  const premium = await hasPremium(user.id);
  const options = await db.select().from(schema.option).where(eq(schema.option.projectId, projectId));
  if (options.length === 0) throw errors.bad("No imported options.");
  const level = premium ? "full" : "preview";
  const limit = premium ? options.length : settings.quotas.previewAnalysisOptionLimit;
  const selected = selectForRun(options, prefs, limit);
  const institutions = new Map<string, { name: string; district: string | null }>();
  for (const o of selected) if (o.institutionKey && o.institution) institutions.set(o.institutionKey, { name: o.institution, district: o.district });

  const runId = crypto.randomUUID();
  await db.insert(schema.analysisRun).values({
    id: runId,
    projectId,
    status: "running",
    level,
    optionCount: options.length,
    evaluatedOptionCount: selected.length,
    evaluatedOptionIds: selected.map((o) => o.id),
    createdBy: user.id,
  });
  for (const key of institutions.keys())
    await db.insert(schema.projectInstitution).values({ projectId, institutionKey: key, status: "pending" }).onConflictDoNothing();
  await enqueue(
    [...institutions.entries()].map(([key, v]) => ({
      type: "geocode",
      projectId,
      analysisRunId: runId,
      payload: { institutionKey: key, name: v.name, district: v.district, userId: user.id },
      dedupeKey: `geocode:${runId}:${key}`,
    })),
  );
  await touchProject(projectId, "analyzing");
  await audit(user.id, "analysis.start", "project", projectId, { runId, level, institutions: institutions.size, evaluated: selected.length, total: options.length });
  if (institutions.size === 0) await finishRunIfDone(runId);
  return { runId, reused: false };
}

export async function cancelAnalysis(projectId: string, user: CurrentUser) {
  await getOwnedProject(projectId, user);
  const runs = await db
    .update(schema.analysisRun)
    .set({ status: "cancelled", finishedAt: new Date() })
    .where(and(eq(schema.analysisRun.projectId, projectId), inArray(schema.analysisRun.status, ["queued", "running"])))
    .returning({ id: schema.analysisRun.id });
  for (const r of runs) await cancelRunJobs(r.id);
  await recomputeScores(projectId);
  await touchProject(projectId, "analyzed");
  return { cancelled: runs.length };
}

/* ------------------------------ job handlers ----------------------------- */

async function countLookup(userId: string, isDemo: boolean, n = 1) {
  if (isDemo) return;
  const s = await getSettings();
  const used = await bump(`lookups:${userId}`, colomboDateKey(), n);
  if (used > s.quotas.externalLookupsPerUserPerDay) throw new NonRetryableError("Daily external research quota reached; remaining items stay unknown.");
}

async function runIsActive(job: JobRow) {
  if (!job.analysisRunId) return true;
  const [r] = await db.select({ status: schema.analysisRun.status }).from(schema.analysisRun).where(eq(schema.analysisRun.id, job.analysisRunId)).limit(1);
  return r && r.status === "running";
}

async function handleGeocode(job: JobRow) {
  if (!(await runIsActive(job))) return;
  const p = job.payload as { institutionKey: string; name: string; district: string | null; userId: string };
  const prov = providers().geo;
  const [cached] = await db.select().from(schema.institution).where(eq(schema.institution.key, p.institutionKey)).limit(1);
  let inst = cached;
  const fresh = cached && cached.provider === prov.name && (!cached.expiresAt || cached.expiresAt > new Date()) && cached.status !== "error";
  if (!fresh) {
    await countLookup(p.userId, prov.isDemo);
    const res = await prov.geocode(p.name, p.district);
    const row = {
      key: p.institutionKey,
      name: p.name,
      district: p.district,
      status: res.status,
      candidates: res.candidates,
      provider: prov.name,
      isDemo: prov.isDemo,
      retrievedAt: new Date(),
      expiresAt: new Date(Date.now() + prov.cacheDays * 86400_000),
    };
    await db.insert(schema.institution).values(row).onConflictDoUpdate({ target: schema.institution.key, set: row });
    inst = row as typeof schema.institution.$inferSelect;
  }
  const projectId = job.projectId!;
  const [pi] = await db
    .select()
    .from(schema.projectInstitution)
    .where(and(eq(schema.projectInstitution.projectId, projectId), eq(schema.projectInstitution.institutionKey, p.institutionKey)))
    .limit(1);
  let chosen: LocationCandidate | null = pi?.status === "confirmed" ? pi.chosen ?? null : null;
  let status = pi?.status === "confirmed" ? "confirmed" : "pending";
  if (status !== "confirmed") {
    if (inst.status === "resolved" && inst.candidates.length) {
      chosen = inst.candidates[0];
      status = "auto";
    } else if (inst.status === "ambiguous") status = "needs_confirmation";
    else status = "not_found";
    await db
      .insert(schema.projectInstitution)
      .values({ projectId, institutionKey: p.institutionKey, status, chosen })
      .onConflictDoUpdate({ target: [schema.projectInstitution.projectId, schema.projectInstitution.institutionKey], set: { status, chosen, updatedAt: new Date() } });
  }
  if (chosen) await enqueueLocationResearch(projectId, job.analysisRunId, p.userId, chosen);
}

export async function enqueueLocationResearch(projectId: string, runId: string | null, userId: string, loc: { lat: number; lng: number }) {
  const { prefs } = await loadPrefs(projectId);
  const jobs: Parameters<typeof enqueue>[0] = [];
  const r = prefs.facilities.radiusKm;
  jobs.push({ type: "climate", projectId, analysisRunId: runId, payload: { lat: loc.lat, lng: loc.lng, userId }, dedupeKey: `climate:${runId}:${climateKey(loc.lat, loc.lng)}` });
  jobs.push({ type: "facilities", projectId, analysisRunId: runId, payload: { lat: loc.lat, lng: loc.lng, radiusKm: r, userId }, dedupeKey: `fac:${runId}:${facilitiesKey(loc.lat, loc.lng, r)}` });
  for (const [label, from] of [["home", prefs.home], ["second", prefs.secondLocation]] as const) {
    if (!from) continue;
    for (const mode of routeModes(prefs))
      jobs.push({
        type: "route",
        projectId,
        analysisRunId: runId,
        payload: { from: { lat: from.lat, lng: from.lng }, to: { lat: loc.lat, lng: loc.lng }, mode, label, userId },
        dedupeKey: `route:${runId}:${routeKey(projectId, from, loc)}:${mode}`,
      });
  }
  await enqueue(jobs);
}

async function existingFresh(subjectKey: string, kind: string, provider: string) {
  const [e] = await db.select().from(schema.evidence).where(and(eq(schema.evidence.subjectKey, subjectKey), eq(schema.evidence.kind, kind))).limit(1);
  return e && e.provider === provider && e.status !== "error" && (!e.expiresAt || e.expiresAt > new Date()) ? e : null;
}

async function saveEvidence(row: Omit<typeof schema.evidence.$inferInsert, "id">) {
  const values = { id: crypto.randomUUID(), ...row, retrievedAt: new Date() };
  await db
    .insert(schema.evidence)
    .values(values)
    .onConflictDoUpdate({ target: [schema.evidence.subjectKey, schema.evidence.kind], set: { ...row, retrievedAt: new Date() } });
}

async function handleClimate(job: JobRow) {
  if (!(await runIsActive(job))) return;
  const p = job.payload as { lat: number; lng: number; userId: string };
  const prov = providers().climate;
  const key = climateKey(p.lat, p.lng);
  if (await existingFresh(key, "climate", prov.name)) return;
  await countLookup(p.userId, prov.isDemo);
  const r = await prov.climate(p.lat, p.lng);
  await saveEvidence({
    scope: "location",
    subjectKey: key,
    kind: "climate",
    status: r.status,
    value: { meanTempC: r.meanTempC, annualRainMm: r.annualRainMm, period: r.period },
    units: { meanTempC: "°C (annual mean)", annualRainMm: "mm per year" },
    provider: prov.name,
    sourceUrl: r.sourceUrl ?? null,
    attribution: prov.attribution,
    queryContext: { lat: Number(p.lat.toFixed(2)), lng: Number(p.lng.toFixed(2)) },
    confidence: prov.isDemo ? 0.2 : 0.8,
    isDemo: prov.isDemo,
    expiresAt: new Date(Date.now() + prov.cacheDays * 86400_000),
  });
}

async function handleFacilities(job: JobRow) {
  if (!(await runIsActive(job))) return;
  const p = job.payload as { lat: number; lng: number; radiusKm: number; userId: string };
  const prov = providers().facilities;
  const key = facilitiesKey(p.lat, p.lng, p.radiusKm);
  if (await existingFresh(key, "facilities", prov.name)) return;
  await countLookup(p.userId, prov.isDemo, 4);
  const r = await prov.facilities(p.lat, p.lng, p.radiusKm);
  await saveEvidence({
    scope: "location",
    subjectKey: key,
    kind: "facilities",
    status: r.status,
    value: { counts: r.counts, capped: r.capped ?? {}, radiusKm: p.radiusKm },
    units: { counts: `places within ${p.radiusKm} km (straight-line radius)` },
    provider: prov.name,
    sourceUrl: r.sourceUrl ?? null,
    attribution: prov.attribution,
    queryContext: { radiusKm: p.radiusKm },
    confidence: prov.isDemo ? 0.2 : 0.6,
    isDemo: prov.isDemo,
    expiresAt: new Date(Date.now() + prov.cacheDays * 86400_000),
  });
}

async function handleRoute(job: JobRow) {
  if (!(await runIsActive(job))) return;
  const p = job.payload as { from: { lat: number; lng: number }; to: { lat: number; lng: number }; mode: "drive" | "transit"; label: string; userId: string };
  const prov = providers().route;
  const key = routeKey(job.projectId!, p.from, p.to);
  const kind = p.mode === "drive" ? "route_drive" : "route_transit";
  if (await existingFresh(key, kind, prov.name)) return;
  await countLookup(p.userId, prov.isDemo || prov.name === "none");
  const r = await prov.route(p.from, p.to, p.mode);
  await saveEvidence({
    scope: "route",
    subjectKey: key,
    projectId: job.projectId,
    kind,
    status: r.status,
    value: { minutes: r.minutes, km: r.km, assumptions: r.assumptions },
    units: { minutes: "minutes (estimated)", km: "km (road distance)" },
    provider: prov.name,
    sourceUrl: r.sourceUrl ?? null,
    attribution: prov.attribution,
    queryContext: { mode: p.mode, from: p.label },
    confidence: prov.isDemo ? 0.2 : 0.7,
    isDemo: prov.isDemo,
    expiresAt: new Date(Date.now() + Math.max(1, prov.cacheDays) * 86400_000),
  });
}

export const handlers = { geocode: handleGeocode, climate: handleClimate, facilities: handleFacilities, route: handleRoute };

/* --------------------------- progress & completion ------------------------ */

export async function refreshRunProgress(runId: string) {
  const counts = await db.execute(sql`
    select
      count(*) filter (where status = 'succeeded')::int as done,
      count(*) filter (where status = 'failed')::int as failed,
      count(*) filter (where status in ('queued','running'))::int as remaining,
      count(*) filter (where status <> 'cancelled')::int as total
    from job where analysis_run_id = ${runId}`);
  const c = counts.rows[0] as { done: number; failed: number; remaining: number; total: number };
  await db.update(schema.analysisRun).set({ doneTasks: c.done, failedTasks: c.failed, totalTasks: c.total }).where(eq(schema.analysisRun.id, runId));
  return c;
}

export async function finishRunIfDone(runId: string) {
  const c = await refreshRunProgress(runId);
  const [run] = await db.select().from(schema.analysisRun).where(eq(schema.analysisRun.id, runId)).limit(1);
  if (!run) return;
  if (c.remaining === 0 && run.status === "running") {
    const updated = await db
      .update(schema.analysisRun)
      .set({ status: c.failed > 0 ? "partial" : "completed", finishedAt: new Date() })
      .where(and(eq(schema.analysisRun.id, runId), eq(schema.analysisRun.status, "running")))
      .returning({ id: schema.analysisRun.id });
    if (updated.length) {
      await recomputeScores(run.projectId);
      await freezePreviewIfNeeded(run.projectId, runId);
      await touchProject(run.projectId, "analyzed");
    }
  } else if (run.status === "running") {
    // Partial results while the run continues (throttled inside recomputeScores).
    await recomputeScores(run.projectId, { minIntervalMs: 8000 });
  }
}

export async function processJobs(opts: { projectId?: string; timeBudgetMs?: number; maxJobs?: number } = {}) {
  const s = await getSettings();
  return runWorker(handlers, { concurrency: s.jobs.concurrency, ...opts }, async (runIds) => {
    for (const id of runIds) {
      try {
        await finishRunIfDone(id);
      } catch (e) {
        logger.error("run.progress_failed", { runId: id, error: e instanceof Error ? e.message : String(e) });
      }
    }
  });
}

export async function getProgress(projectId: string, user: CurrentUser) {
  await getOwnedProject(projectId, user);
  const [run] = await db.select().from(schema.analysisRun).where(eq(schema.analysisRun.projectId, projectId)).orderBy(desc(schema.analysisRun.createdAt)).limit(1);
  const locations = await db
    .select({ key: schema.projectInstitution.institutionKey, status: schema.projectInstitution.status, chosen: schema.projectInstitution.chosen, candidates: schema.institution.candidates, name: schema.institution.name, district: schema.institution.district, isDemo: schema.institution.isDemo })
    .from(schema.projectInstitution)
    .leftJoin(schema.institution, eq(schema.institution.key, schema.projectInstitution.institutionKey))
    .where(eq(schema.projectInstitution.projectId, projectId));
  const failed = run
    ? await db.select({ id: schema.job.id, type: schema.job.type, error: schema.job.lastError }).from(schema.job).where(and(eq(schema.job.analysisRunId, run.id), eq(schema.job.status, "failed"))).limit(20)
    : [];
  return {
    run: run
      ? { id: run.id, status: run.status, level: run.level, total: run.totalTasks, done: run.doneTasks, failed: run.failedTasks, optionCount: run.optionCount, evaluated: run.evaluatedOptionCount, createdAt: run.createdAt, finishedAt: run.finishedAt }
      : null,
    needsConfirmation: locations.filter((l) => l.status === "needs_confirmation").map((l) => ({ key: l.key, name: l.name, district: l.district, candidates: l.candidates ?? [], isDemo: l.isDemo })),
    notFound: locations.filter((l) => l.status === "not_found").map((l) => ({ key: l.key, name: l.name, district: l.district })),
    resolved: locations.filter((l) => l.status === "auto" || l.status === "confirmed").length,
    failedJobs: failed.map((f) => ({ type: f.type, error: f.error })),
  };
}

/** User confirms (or rejects) a location for an ambiguous institution. */
export async function confirmLocation(projectId: string, user: CurrentUser, input: { institutionKey: string; candidateIndex: number | null }) {
  await getOwnedProject(projectId, user);
  const [inst] = await db.select().from(schema.institution).where(eq(schema.institution.key, input.institutionKey)).limit(1);
  const [pi] = await db
    .select()
    .from(schema.projectInstitution)
    .where(and(eq(schema.projectInstitution.projectId, projectId), eq(schema.projectInstitution.institutionKey, input.institutionKey)))
    .limit(1);
  if (!inst || !pi) throw errors.notFound("Institution not found in this project.");
  if (input.candidateIndex == null) {
    await db
      .update(schema.projectInstitution)
      .set({ status: "rejected", chosen: null, updatedAt: new Date() })
      .where(and(eq(schema.projectInstitution.projectId, projectId), eq(schema.projectInstitution.institutionKey, input.institutionKey)));
    await recomputeScores(projectId);
    return { ok: true };
  }
  const chosen = inst.candidates[input.candidateIndex];
  if (!chosen) throw errors.bad("Invalid candidate.");
  await db
    .update(schema.projectInstitution)
    .set({ status: "confirmed", chosen, updatedAt: new Date() })
    .where(and(eq(schema.projectInstitution.projectId, projectId), eq(schema.projectInstitution.institutionKey, input.institutionKey)));
  const [run] = await db.select().from(schema.analysisRun).where(eq(schema.analysisRun.projectId, projectId)).orderBy(desc(schema.analysisRun.createdAt)).limit(1);
  if (run && run.status !== "cancelled") {
    await db.update(schema.analysisRun).set({ status: "running", finishedAt: null }).where(eq(schema.analysisRun.id, run.id));
    await enqueueLocationResearch(projectId, run.id, user.id, chosen);
    await finishRunIfDone(run.id);
  } else await recomputeScores(projectId);
  await audit(user.id, "analysis.confirm_location", "project", projectId, { institutionKey: input.institutionKey });
  return { ok: true };
}

