/**
 * Ranked results and comparison with server-side access control.
 *
 * Free users only ever receive the frozen preview option IDs (max 3). Hidden rows are
 * never serialized — not blurred, not paginated, not sortable into view. Premium users
 * receive the full analyzed list.
 */
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { errors } from "../http";
import type { CurrentUser } from "../session";
import { getOwnedProject } from "./projects";
import { hasPremium } from "./access";
import { computeScores, type OptionEvidenceBundle } from "./scores";
import { legMinutes, normalizeText, type OptionScoreResult } from "@/lib/scoring";
import type { Preferences } from "@/lib/preferences";

export const SORT_KEYS = ["score", "rank", "distance", "time", "post", "climate", "facilities", "institution", "district", "index"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const resultsQuery = z.object({
  sort: z.enum(SORT_KEYS).default("score"),
  dir: z.enum(["asc", "desc"]).optional(),
  /** ranked = all ranked options (the "never" list at the bottom); unranked = not considered / incomplete rows. */
  view: z.enum(["ranked", "unranked", "all", "excluded"]).default("ranked"),
  q: z.string().max(100).optional(),
  district: z.string().max(80).optional(),
  maxMinutes: z.coerce.number().min(1).max(2000).optional(),
  minCoverage: z.coerce.number().min(0).max(100).optional(),
  matchedPostsOnly: z.coerce.boolean().optional(),
});

export type AccessContext = { premium: boolean; accessibleIds: Set<string> | null; previewFrozen: boolean };

/** Returns null accessibleIds for premium (everything accessible). */
export async function accessContext(projectId: string, user: CurrentUser): Promise<AccessContext & { project: typeof schema.project.$inferSelect }> {
  const project = await getOwnedProject(projectId, user);
  const premium = await hasPremium(user.id);
  if (premium) return { project, premium, accessibleIds: null, previewFrozen: !!project.previewFrozenAt };
  return { project, premium, accessibleIds: new Set(project.previewOptionIds ?? []), previewFrozen: !!project.previewFrozenAt };
}

export function isAccessible(ctx: AccessContext, optionId: string) {
  return ctx.accessibleIds == null || ctx.accessibleIds.has(optionId);
}

export type ResultRow = ReturnType<typeof toRow>;

function crit(r: OptionScoreResult, c: string) {
  return r.breakdown.find((b) => b.criterion === c)?.score ?? null;
}

/** A web search for rentals near the option. NextPlace never fetches or invents rent prices. */
export function rentalSearchUrl(institution: string | null, district: string | null, prefs: Preferences) {
  const place = district ?? institution ?? "Sri Lanka";
  const beds = prefs.rental.bedrooms ? ` ${prefs.rental.bedrooms} bedroom` : "";
  const q = `house for rent${beds} ${place} site:ikman.lk OR site:lankapropertyweb.com`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

type Finding = { topic: string; summary: string; sourceUrl: string; createdAt: Date };

function toRow(o: typeof schema.option.$inferSelect, r: OptionScoreResult, b: OptionEvidenceBundle | undefined, prefs: Preferences, preferenceRank: number | null, findings: Finding[] = []) {
  const primary = b?.evidence.travel?.primary ?? null;
  return {
    id: o.id,
    seq: o.seq,
    index: o.originalIndex,
    institution: o.institution,
    district: o.district,
    designation: o.designation,
    vacancies: o.vacancies,
    sourceRef: o.sourceRef,
    flags: o.flags,
    userRentLkr: o.userRentLkr,
    rentalSearchUrl: prefs.rental.looking ? rentalSearchUrl(o.institution, o.district, prefs) : null,
    lockedToBottom: r.status === "excluded",
    findings: findings.map((f) => ({ topic: f.topic, summary: f.summary, sourceUrl: f.sourceUrl, createdAt: f.createdAt })),
    systemRank: r.systemRank,
    preferenceRank,
    status: r.status,
    score: r.finalScore,
    coverage: r.coverage,
    breakdown: r.breakdown,
    exclusionReasons: r.exclusionReasons,
    warnings: r.warnings,
    explanation: r.explanation,
    travel: {
      minutes: legMinutes(primary, prefs.travelMode),
      driveMinutes: primary?.driveMinutes ?? null,
      transitMinutes: primary?.transitMinutes ?? null,
      roadKm: primary?.driveKm ?? null,
      straightKm: b?.straightKm ?? null,
    },
    climate: b?.evidence.climate ?? null,
    facilities: b?.evidence.facilities ?? null,
    location: b?.location ?? null,
    isDemoEvidence: !!(b?.location?.isDemo || b?.refs.some((x) => x.isDemo)),
    sources: (b?.refs ?? []).map((x) => ({ kind: x.kind, provider: x.provider, retrievedAt: x.retrievedAt, isDemo: x.isDemo, sourceUrl: x.sourceUrl, attribution: x.attribution, status: x.status, context: x.context, value: x.value })),
  };
}

function sortValue(row: ResultRow, key: SortKey): number | string | null {
  switch (key) {
    case "score":
      return row.score;
    case "rank":
      return row.systemRank;
    case "distance":
      return row.travel.roadKm ?? null;
    case "time":
      return row.travel.minutes;
    case "post":
      return crit2(row, "post");
    case "climate":
      return crit2(row, "climate");
    case "facilities":
      return crit2(row, "facilities");
    case "institution":
      return row.institution ? row.institution.toLowerCase() : null;
    case "district":
      return row.district ? row.district.toLowerCase() : null;
    case "index": {
      const n = Number(row.index);
      return row.index == null ? null : Number.isFinite(n) ? n : row.index;
    }
  }
}
function crit2(row: ResultRow, c: string) {
  return row.breakdown.find((b) => b.criterion === c)?.score ?? null;
}

/**
 * The user's "never" options always stay at the bottom, whatever the sort.
 * Unknown values always sort last in both directions; ties fall back to system rank then import order.
 */
export function sortRows(rows: ResultRow[], key: SortKey, dir: "asc" | "desc") {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const la = a.status === "excluded" ? 1 : 0;
    const lb = b.status === "excluded" ? 1 : 0;
    if (la !== lb) return la - lb;
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va == null && vb != null) return 1;
    if (vb == null && va != null) return -1;
    if (va != null && vb != null && va !== vb) {
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * mul;
      return String(va).localeCompare(String(vb), "en") * mul;
    }
    const ra = a.systemRank ?? Number.MAX_SAFE_INTEGER;
    const rb = b.systemRank ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.seq - b.seq;
  });
}

const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  score: "desc",
  rank: "asc",
  distance: "asc",
  time: "asc",
  post: "desc",
  climate: "desc",
  facilities: "desc",
  institution: "asc",
  district: "asc",
  index: "asc",
};

async function finalRanks(projectId: string) {
  const [f] = await db.select().from(schema.finalOrder).where(eq(schema.finalOrder.projectId, projectId)).limit(1);
  return new Map((f?.items ?? []).map((id, i) => [id, i + 1]));
}

export async function getResults(projectId: string, user: CurrentUser, query: z.infer<typeof resultsQuery>) {
  const ctx = await accessContext(projectId, user);
  const [run] = await db.select().from(schema.analysisRun).where(eq(schema.analysisRun.projectId, projectId)).orderBy(desc(schema.analysisRun.createdAt)).limit(1);
  const totalOptions = (await db.select({ id: schema.option.id }).from(schema.option).where(eq(schema.option.projectId, projectId))).length;
  const base = {
    premium: ctx.premium,
    previewFrozen: ctx.previewFrozen,
    previewBasis: ctx.project.previewBasis,
    run: run ? { status: run.status, level: run.level, evaluated: run.evaluatedOptionCount, optionCount: run.optionCount } : null,
    totalOptions,
  };
  if (!run) return { ...base, state: "not_analyzed" as const, rows: [], hiddenCount: 0, counts: {} };
  if (!ctx.premium && !ctx.previewFrozen) return { ...base, state: "analyzing" as const, rows: [], hiddenCount: totalOptions, counts: {} };

  const { prefs, options, bundles, results } = await computeScores(projectId);
  const ranks = ctx.premium ? await finalRanks(projectId) : new Map<string, number>();
  const byId = new Map(options.map((o) => [o.id, o]));
  const found = await db
    .select({ optionId: schema.botFinding.optionId, topic: schema.botFinding.topic, summary: schema.botFinding.summary, sourceUrl: schema.botFinding.sourceUrl, createdAt: schema.botFinding.createdAt })
    .from(schema.botFinding)
    .where(eq(schema.botFinding.projectId, projectId))
    .orderBy(desc(schema.botFinding.createdAt));
  const findingsBy = new Map<string, typeof found>();
  for (const f of found) if (f.optionId) findingsBy.set(f.optionId, [...(findingsBy.get(f.optionId) ?? []), f]);
  // Access filter FIRST — nothing beyond this point can reveal restricted rows.
  const accessible = results.filter((r) => isAccessible(ctx, r.optionId));
  let rows = accessible.map((r) => toRow(byId.get(r.optionId)!, r, bundles.get(r.optionId), prefs, ranks.get(r.optionId) ?? null, findingsBy.get(r.optionId) ?? []));
  if (!ctx.premium) {
    // Ranks within the full list would leak information about hidden rows.
    rows = rows.map((row) => ({ ...row, systemRank: null }));
    const order = ctx.project.previewOptionIds ?? [];
    rows.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }

  const counts = {
    ranked: rows.filter((r) => r.systemRank != null || (!ctx.premium && ["complete", "provisional", "low_coverage", "unscored"].includes(r.status))).length,
    excluded: rows.filter((r) => r.status === "excluded").length,
    unranked: rows.filter((r) => ["not_considered", "incomplete"].includes(r.status)).length,
    provisional: rows.filter((r) => r.status !== "complete" && r.score != null).length,
    demo: rows.filter((r) => r.isDemoEvidence).length,
  };

  if (query.view === "ranked") rows = rows.filter((r) => !["not_considered", "incomplete"].includes(r.status));
  else if (query.view === "unranked" || query.view === "excluded") rows = rows.filter((r) => ["not_considered", "incomplete"].includes(r.status));
  if (query.q) {
    const q = normalizeText(query.q);
    rows = rows.filter((r) => normalizeText([r.institution, r.district, r.designation, r.index].join(" ")).includes(q));
  }
  if (query.district) rows = rows.filter((r) => normalizeText(r.district) === normalizeText(query.district));
  if (query.maxMinutes) rows = rows.filter((r) => r.travel.minutes != null && r.travel.minutes <= query.maxMinutes!);
  if (query.minCoverage != null) rows = rows.filter((r) => r.coverage >= query.minCoverage!);
  if (query.matchedPostsOnly) rows = rows.filter((r) => /Matches preferred post/.test(r.breakdown.find((b) => b.criterion === "post")?.detail ?? ""));

  if (ctx.premium || query.sort !== "score") rows = sortRows(rows, query.sort, query.dir ?? DEFAULT_DIR[query.sort]);
  else rows = sortRows(rows, "score", query.dir ?? "desc");

  const hiddenCount = ctx.premium ? 0 : totalOptions - accessible.length;
  const districts = ctx.premium ? Array.from(new Set(options.map((o) => o.district).filter((d): d is string => !!d))).sort() : Array.from(new Set(rows.map((r) => r.district).filter((d): d is string => !!d)));
  return { ...base, state: "ready" as const, rows, hiddenCount, counts, districts, weights: prefs.criteria, travelMode: prefs.travelMode };
}

export const compareInput = z.object({ optionIds: z.array(z.string().max(64)).min(1).max(200) });

export async function compareOptions(projectId: string, user: CurrentUser, ids: string[]) {
  const ctx = await accessContext(projectId, user);
  const unique = Array.from(new Set(ids));
  if (!ctx.premium && unique.length > 3) throw errors.premium("Free accounts can compare their three preview options. Unlock full access to compare more.");
  for (const id of unique) if (!isAccessible(ctx, id)) throw errors.premium("One or more selected options are only available with full access.");
  const { prefs, options, bundles, results } = await computeScores(projectId);
  const byId = new Map(options.map((o) => [o.id, o]));
  const rById = new Map(results.map((r) => [r.optionId, r]));
  const ranks = ctx.premium ? await finalRanks(projectId) : new Map<string, number>();
  const rows = unique.map((id) => {
    const o = byId.get(id);
    if (!o) throw errors.notFound("Option not found.");
    const row = toRow(o, rById.get(id)!, bundles.get(id), prefs, ranks.get(id) ?? null);
    return ctx.premium ? row : { ...row, systemRank: null };
  });
  return { premium: ctx.premium, rows, weights: prefs.criteria };
}

/** Top-N accessible option IDs by system rank (for "compare top N"). */
export async function topAccessible(projectId: string, user: CurrentUser, n: number) {
  const ctx = await accessContext(projectId, user);
  if (!ctx.premium) return { premium: false, ids: (ctx.project.previewOptionIds ?? []).slice(0, Math.min(3, n)) };
  const { results } = await computeScores(projectId);
  return { premium: true, ids: results.filter((r) => r.systemRank != null && r.status !== "excluded").slice(0, Math.max(1, Math.min(200, n))).map((r) => r.optionId) };
}

export const rentInput = z.object({ rentLkr: z.number().int().min(0).max(10_000_000).nullable() });

/** Saves the monthly rent the user found themselves. Only for options the user can access. */
export async function setUserRent(projectId: string, user: CurrentUser, optionId: string, rentLkr: number | null) {
  const ctx = await accessContext(projectId, user);
  if (!isAccessible(ctx, optionId)) throw errors.premium("This option is only available with full access.");
  const res = await db
    .update(schema.option)
    .set({ userRentLkr: rentLkr })
    .where(and(eq(schema.option.id, optionId), eq(schema.option.projectId, projectId)))
    .returning({ id: schema.option.id });
  if (!res.length) throw errors.notFound("Option not found.");
  return { ok: true };
}
