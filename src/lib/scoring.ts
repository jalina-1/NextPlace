/**
 * Deterministic, explainable weighted scoring.
 *
 * - Weight   = how important a criterion is to the user (enabled weights total 100).
 * - Criterion score (0–100) = how well an option satisfies that criterion.
 *
 * With complete data:  final = Σ score_i × weight_i / 100
 *
 * Missing data policy:
 *   A criterion whose evidence is unknown contributes neither score nor weight.
 *   provisional score = Σ score_i × w_i × k_i / Σ w_i × k_i   (k_i = known fraction, 0..1)
 *   evidence coverage = Σ w_i × k_i                            (percent of total weight)
 *   coverage 100  → "complete"; ≥ minConfidentCoverage → "provisional";
 *   below that    → "low_coverage" (ranked after better-evidenced options);
 *   coverage 0    → "unscored" (no score shown).
 *
 * No LLM is involved in any score.
 */
import { CRITERIA, type CriterionKey, type Preferences, FACILITY_CATEGORIES, type FacilityCategory } from "./preferences";

export type TravelLeg = {
  driveMinutes?: number | null;
  driveKm?: number | null;
  transitMinutes?: number | null;
  straightKm?: number | null;
};

export type OptionEvidence = {
  travel?: { primary?: TravelLeg | null; second?: TravelLeg | null };
  climate?: { meanTempC?: number | null; annualRainMm?: number | null } | null;
  facilities?: { radiusKm: number; counts: Partial<Record<FacilityCategory, number | null>> } | null;
};

export type ScorableOption = {
  id: string;
  seq: number;
  institution: string | null;
  district: string | null;
  designation: string | null;
  decision: string;
};

export type CriterionResult = {
  criterion: CriterionKey;
  enabled: boolean;
  weight: number;
  /** 0..100, null when unknown */
  score: number | null;
  /** 0..1 share of this criterion's evidence that is known */
  known: number;
  detail: string;
};

export type ScoreStatus =
  | "complete"
  | "provisional"
  | "low_coverage"
  | "unscored"
  | "excluded"
  | "not_considered"
  | "incomplete";

export type OptionScoreResult = {
  optionId: string;
  status: ScoreStatus;
  finalScore: number | null;
  coverage: number;
  breakdown: CriterionResult[];
  exclusionReasons: string[];
  warnings: string[];
  explanation: string;
  systemRank: number | null;
};

/* --------------------------------- helpers -------------------------------- */

export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9඀-෿஀-௿]+/g, " ")
    .trim();
}

function textMatches(value: string | null, pattern: string): boolean {
  const v = normalizeText(value);
  const p = normalizeText(pattern);
  if (!v || !p) return false;
  return v === p || ` ${v} `.includes(` ${p} `);
}

/** Linear: 100 at/below `good`, 0 at/above `bad` (good < bad). */
export function lowerIsBetter(value: number, good: number, bad: number): number {
  if (value <= good) return 100;
  if (value >= bad) return 0;
  return ((bad - value) / (bad - good)) * 100;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/* ------------------------------ criteria rules ---------------------------- */

/** Post preference: k-th preferred post scores max(floor, firstChoice − stepDown × (k−1)). */
export function postScore(designation: string | null, prefs: Preferences): { score: number | null; matchedRank: number | null; detail: string } {
  if (!designation) return { score: null, matchedRank: null, detail: "Designation missing" };
  if (prefs.posts.length === 0) return { score: null, matchedRank: null, detail: "No preferred posts listed" };
  const idx = prefs.posts.findIndex((p) => textMatches(designation, p));
  if (idx < 0)
    return { score: prefs.postScoring.unmatched, matchedRank: null, detail: `Matches none of your preferred posts (scored ${prefs.postScoring.unmatched})` };
  const s = Math.max(prefs.postScoring.floor, prefs.postScoring.firstChoice - prefs.postScoring.stepDown * idx);
  return { score: s, matchedRank: idx + 1, detail: `Matches preferred post #${idx + 1} “${prefs.posts[idx]}”` };
}

/** Travel time for the selected mode. Mixed uses the faster of known driving/transit times. */
export function legMinutes(leg: TravelLeg | null | undefined, mode: Preferences["travelMode"]): number | null {
  if (!leg) return null;
  const d = leg.driveMinutes ?? null;
  const t = leg.transitMinutes ?? null;
  if (mode === "driving") return d;
  if (mode === "public") return t;
  if (d == null) return t;
  if (t == null) return d;
  return Math.min(d, t);
}

/**
 * One travel metric per leg, never both (avoids double counting):
 * estimated travel time when available, otherwise road distance. Straight-line distance is never scored.
 */
export function legScore(leg: TravelLeg | null | undefined, prefs: Preferences): { score: number | null; detail: string; minutes: number | null } {
  const minutes = legMinutes(leg, prefs.travelMode);
  if (minutes != null) {
    return {
      score: lowerIsBetter(minutes, prefs.travel.idealMinutes, prefs.travel.maxMinutes),
      minutes,
      detail: `~${Math.round(minutes)} min estimated (${prefs.travelMode === "public" ? "public transport" : prefs.travelMode === "driving" ? "driving" : "faster of driving/transit"}); 100 at ≤${prefs.travel.idealMinutes} min, 0 at ≥${prefs.travel.maxMinutes} min`,
    };
  }
  const km = leg?.driveKm ?? null;
  if (km != null) {
    return {
      score: lowerIsBetter(km, prefs.travel.idealKm, prefs.travel.maxKm),
      minutes: null,
      detail: `Travel time unknown; scored on ${r1(km)} km road distance (100 at ≤${prefs.travel.idealKm} km, 0 at ≥${prefs.travel.maxKm} km)`,
    };
  }
  return { score: null, minutes: null, detail: "No route estimate" };
}

export function travelScore(ev: OptionEvidence, prefs: Preferences): { score: number | null; known: number; detail: string; minutes: number | null } {
  if (!prefs.home) return { score: null, known: 0, detail: "Home location not set", minutes: null };
  const p = legScore(ev.travel?.primary, prefs);
  if (!prefs.secondLocation) return { score: p.score, known: p.score == null ? 0 : 1, detail: p.detail, minutes: p.minutes };
  const share = prefs.secondLocationShare / 100;
  const s = legScore(ev.travel?.second, prefs);
  const parts: { score: number; w: number }[] = [];
  if (p.score != null) parts.push({ score: p.score, w: 1 - share });
  if (s.score != null) parts.push({ score: s.score, w: share });
  const known = parts.reduce((a, b) => a + b.w, 0);
  const score = known > 0 ? parts.reduce((a, b) => a + b.score * b.w, 0) / known : null;
  return {
    score,
    known,
    minutes: p.minutes,
    detail: `Home: ${p.detail}. Second location (${Math.round(share * 100)}%): ${s.detail}`,
  };
}

/** Temperature (mean annual °C) and rainfall (annual mm) bands. Returns null when unknown or no preference. */
export function climateScore(ev: OptionEvidence, prefs: Preferences): { score: number | null; known: number; detail: string; applicable: boolean } {
  const parts: { score: number | null; label: string }[] = [];
  const t = ev.climate?.meanTempC ?? null;
  const rain = ev.climate?.annualRainMm ?? null;
  if (prefs.climate.temperature !== "any") {
    let s: number | null = null;
    if (t != null) {
      if (prefs.climate.temperature === "cooler") s = lowerIsBetter(t, 18, 28);
      else if (prefs.climate.temperature === "warmer") s = 100 - lowerIsBetter(t, 18, 28);
      else s = t >= 22 && t <= 26 ? 100 : t < 22 ? lowerIsBetter(22 - t, 0, 6) : lowerIsBetter(t - 26, 0, 4);
    }
    parts.push({ score: s, label: t != null ? `mean ${r1(t)}°C vs “${prefs.climate.temperature}”` : "temperature unknown" });
  }
  if (prefs.climate.rainfall !== "any") {
    let s: number | null = null;
    if (rain != null) s = prefs.climate.rainfall === "drier" ? lowerIsBetter(rain, 1000, 3500) : 100 - lowerIsBetter(rain, 1000, 3500);
    parts.push({ score: s, label: rain != null ? `${Math.round(rain)} mm/yr vs “${prefs.climate.rainfall}”` : "rainfall unknown" });
  }
  if (parts.length === 0) return { score: null, known: 0, detail: "No climate preference set", applicable: false };
  const known = parts.filter((p) => p.score != null);
  return {
    score: known.length ? known.reduce((a, b) => a + (b.score as number), 0) / known.length : null,
    known: known.length / parts.length,
    detail: parts.map((p) => p.label).join("; "),
    applicable: true,
  };
}

/** Facility targets within the chosen radius: count/target capped at 100, weighted by importance (0–3). */
export const FACILITY_TARGETS: Record<FacilityCategory, number> = { schools: 3, shops: 5, pharmacies: 2, banks: 2 };

export function facilityScore(ev: OptionEvidence, prefs: Preferences): { score: number | null; known: number; detail: string; applicable: boolean } {
  const cats = FACILITY_CATEGORIES.filter((c) => prefs.facilities[c] > 0);
  if (cats.length === 0) return { score: null, known: 0, detail: "No facility importance set", applicable: false };
  let wKnown = 0;
  let wTotal = 0;
  let acc = 0;
  const labels: string[] = [];
  for (const c of cats) {
    const w = prefs.facilities[c];
    wTotal += w;
    const n = ev.facilities?.counts?.[c];
    if (n == null) {
      labels.push(`${c}: unknown`);
      continue;
    }
    wKnown += w;
    acc += Math.min(n / FACILITY_TARGETS[c], 1) * 100 * w;
    labels.push(`${c}: ${n} within ${ev.facilities?.radiusKm ?? prefs.facilities.radiusKm} km (target ${FACILITY_TARGETS[c]})`);
  }
  return { score: wKnown > 0 ? acc / wKnown : null, known: wTotal ? wKnown / wTotal : 0, detail: labels.join("; "), applicable: true };
}

export function locationScore(opt: ScorableOption, prefs: Preferences): { score: number | null; detail: string } {
  if (prefs.preferredInstitutions.length === 0 && prefs.preferredDistricts.length === 0)
    return { score: null, detail: "No preferred institutions or districts" };
  if (prefs.preferredInstitutions.some((p) => textMatches(opt.institution, p))) return { score: 100, detail: "Preferred institution" };
  if (opt.district == null) return { score: null, detail: "District unknown" };
  if (prefs.preferredDistricts.some((p) => textMatches(opt.district, p))) return { score: 70, detail: "In a preferred district" };
  return { score: 0, detail: "Not a preferred institution or district" };
}

/* ------------------------------- main scoring ----------------------------- */

export function scoreOption(opt: ScorableOption, ev: OptionEvidence, prefs: Preferences): OptionScoreResult {
  const exclusionReasons: string[] = [];
  const warnings: string[] = [];

  if (prefs.excludedInstitutions.some((p) => textMatches(opt.institution, p))) exclusionReasons.push("Institution is on your exclusion list");
  if (prefs.excludedDistricts.some((p) => textMatches(opt.district, p))) exclusionReasons.push("District is on your exclusion list");

  const post = postScore(opt.designation, prefs);
  if (prefs.mandatory.preferredPostsOnly && prefs.posts.length > 0 && opt.designation && post.matchedRank == null)
    exclusionReasons.push("Mandatory: post is not one of your preferred posts");
  if (prefs.mandatory.preferredDistrictsOnly && prefs.preferredDistricts.length > 0) {
    if (opt.district == null) warnings.push("Mandatory district rule could not be checked (district unknown)");
    else if (!prefs.preferredDistricts.some((p) => textMatches(opt.district, p))) exclusionReasons.push("Mandatory: outside your preferred districts");
  }

  const travel = travelScore(ev, prefs);
  if (prefs.mandatory.maxTravelTime) {
    if (travel.minutes == null) warnings.push("Mandatory travel-time limit could not be verified (travel time unknown)");
    else if (travel.minutes > prefs.travel.maxMinutes)
      exclusionReasons.push(`Mandatory: ~${Math.round(travel.minutes)} min exceeds your ${prefs.travel.maxMinutes} min limit`);
  }

  const climate = climateScore(ev, prefs);
  const fac = facilityScore(ev, prefs);
  const loc = locationScore(opt, prefs);

  const raw: Record<CriterionKey, { score: number | null; known: number; detail: string }> = {
    post: { score: post.score, known: post.score == null ? 0 : 1, detail: post.detail },
    travel: { score: travel.score, known: travel.known, detail: travel.detail },
    climate: { score: climate.score, known: climate.known, detail: climate.detail },
    facilities: { score: fac.score, known: fac.known, detail: fac.detail },
    location: { score: loc.score, known: loc.score == null ? 0 : 1, detail: loc.detail },
  };

  const breakdown: CriterionResult[] = CRITERIA.map((c) => ({
    criterion: c,
    enabled: prefs.criteria[c].enabled,
    weight: prefs.criteria[c].enabled ? prefs.criteria[c].weight : 0,
    score: raw[c].score == null ? null : r1(raw[c].score as number),
    known: raw[c].score == null ? 0 : raw[c].known,
    detail: raw[c].detail,
  }));

  const incomplete = !opt.institution || !opt.designation;
  let coverage = 0;
  let weighted = 0;
  for (const b of breakdown) {
    if (!b.enabled || b.score == null) continue;
    const w = b.weight * b.known;
    coverage += w;
    weighted += b.score * w;
  }
  coverage = r1(coverage);
  const finalScore = coverage > 0 ? r1(weighted / coverage) : null;

  let status: ScoreStatus;
  if (incomplete) status = "incomplete";
  else if (opt.decision === "not_considered") status = "not_considered";
  else if (exclusionReasons.length) status = "excluded";
  else if (finalScore == null) status = "unscored";
  else if (coverage >= 99.95) status = "complete";
  else if (coverage >= prefs.minConfidentCoverage) status = "provisional";
  else status = "low_coverage";

  const result: OptionScoreResult = {
    optionId: opt.id,
    status,
    finalScore: status === "incomplete" ? null : finalScore,
    coverage,
    breakdown,
    exclusionReasons,
    warnings,
    explanation: "",
    systemRank: null,
  };
  result.explanation = explain(result);
  return result;
}

const LABEL: Record<CriterionKey, string> = {
  post: "Post",
  travel: "Travel",
  climate: "Climate",
  facilities: "Facilities",
  location: "Preferred location",
};

export function explain(r: OptionScoreResult): string {
  if (r.status === "incomplete") return "Institution or post information is missing; correct this row in the import review before it can be scored.";
  if (r.status === "not_considered") return "You marked this option as not considered. It is kept for review but not ranked.";
  const parts: string[] = [];
  if (r.exclusionReasons.length) parts.push(`Excluded: ${r.exclusionReasons.join("; ")}.`);
  if (r.finalScore == null) parts.push("Unscored: none of your enabled criteria have evidence yet.");
  else {
    const known = r.breakdown.filter((b) => b.enabled && b.score != null);
    const unknown = r.breakdown.filter((b) => b.enabled && b.score == null);
    parts.push(
      `${r.status === "complete" ? "Score" : "Provisional score"} ${r.finalScore} with ${r.coverage}% weighted evidence coverage.`,
    );
    parts.push(known.map((b) => `${LABEL[b.criterion]} ${b.score} (${b.weight}%)`).join(", ") + ".");
    if (unknown.length) parts.push(`Unknown: ${unknown.map((b) => LABEL[b.criterion]).join(", ")}.`);
    if (r.status === "low_coverage") parts.push("Low evidence coverage — ranked below better-evidenced options.");
  }
  if (r.warnings.length) parts.push(r.warnings.join(" "));
  return parts.join(" ");
}

const STATUS_TIER: Record<ScoreStatus, number> = {
  complete: 0,
  provisional: 0,
  low_coverage: 1,
  unscored: 2,
  excluded: 3,
  not_considered: 4,
  incomplete: 5,
};

/**
 * Deterministic ranking. Rankable statuses (complete, provisional, low_coverage, unscored)
 * receive a system rank; excluded / not considered / incomplete rows are kept but unranked.
 * Tie-break: tier → score desc → coverage desc → post score desc → institution → import order.
 */
export function rankOptions(
  options: ScorableOption[],
  results: Map<string, OptionScoreResult>,
): OptionScoreResult[] {
  const byId = new Map(options.map((o) => [o.id, o]));
  const list = options.map((o) => results.get(o.id)!).filter(Boolean);
  const postOf = (r: OptionScoreResult) => r.breakdown.find((b) => b.criterion === "post")?.score ?? -1;
  list.sort((a, b) => {
    const ta = STATUS_TIER[a.status];
    const tb = STATUS_TIER[b.status];
    if (ta !== tb) return ta - tb;
    const sa = a.finalScore ?? -1;
    const sb = b.finalScore ?? -1;
    if (sa !== sb) return sb - sa;
    if (a.coverage !== b.coverage) return b.coverage - a.coverage;
    const pa = postOf(a);
    const pb = postOf(b);
    if (pa !== pb) return pb - pa;
    const oa = byId.get(a.optionId)!;
    const ob = byId.get(b.optionId)!;
    const ia = (oa.institution ?? "").localeCompare(ob.institution ?? "", "en");
    if (ia !== 0) return ia;
    return oa.seq - ob.seq;
  });
  let rank = 0;
  for (const r of list) r.systemRank = STATUS_TIER[r.status] <= 2 ? ++rank : null;
  return list;
}

export function scoreAll(options: ScorableOption[], evidence: Map<string, OptionEvidence>, prefs: Preferences): OptionScoreResult[] {
  const results = new Map<string, OptionScoreResult>();
  for (const o of options) results.set(o.id, scoreOption(o, evidence.get(o.id) ?? {}, prefs));
  return rankOptions(options, results);
}
