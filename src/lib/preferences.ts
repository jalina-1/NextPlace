/**
 * Preference model, validation and weight helpers.
 * Shared by client (forms) and server (validation). Contains no secrets.
 */
import { z } from "zod";

export const CRITERIA = ["post", "travel", "climate", "facilities", "location"] as const;
export type CriterionKey = (typeof CRITERIA)[number];

export const FACILITY_CATEGORIES = ["schools", "shops", "pharmacies", "banks"] as const;
export type FacilityCategory = (typeof FACILITY_CATEGORIES)[number];

const placeSchema = z.object({
  label: z.string().trim().min(1).max(120),
  /** Approximate coordinates (town centre or a map pin) — never an exact address. */
  lat: z.number().min(5.5).max(10.2),
  lng: z.number().min(79.3).max(82.2),
});
export type Place = z.infer<typeof placeSchema>;

const criterionSchema = z.object({ enabled: z.boolean(), weight: z.number().min(0).max(100) });

const importance = z.number().int().min(0).max(3);

export const preferencesSchema = z.object({
  home: placeSchema.nullable(),
  secondLocation: placeSchema.nullable(),
  /** Share (0–90%) of the travel score taken from the second location when set. */
  secondLocationShare: z.number().min(0).max(90),

  /** Ordered list: first is most preferred. Matched against the designation text. */
  posts: z.array(z.string().trim().min(1).max(120)).max(30),
  postScoring: z.object({
    firstChoice: z.number().min(0).max(100),
    stepDown: z.number().min(0).max(50),
    floor: z.number().min(0).max(100),
    unmatched: z.number().min(0).max(100),
  }),

  preferredInstitutions: z.array(z.string().trim().min(1).max(160)).max(50),
  preferredDistricts: z.array(z.string().trim().min(1).max(60)).max(25),
  /** Hard exclusions — matching rows are kept but marked excluded and not ranked. */
  excludedInstitutions: z.array(z.string().trim().min(1).max(160)).max(100),
  excludedDistricts: z.array(z.string().trim().min(1).max(60)).max(25),

  travelMode: z.enum(["public", "driving", "mixed"]),
  travelFrequency: z.enum(["daily", "weekly", "occasional"]),
  travel: z.object({
    idealMinutes: z.number().min(0).max(1440),
    maxMinutes: z.number().min(1).max(1440),
    idealKm: z.number().min(0).max(1000),
    maxKm: z.number().min(1).max(1000),
  }),

  climate: z.object({
    temperature: z.enum(["any", "cooler", "moderate", "warmer"]),
    rainfall: z.enum(["any", "drier", "wetter"]),
  }),

  facilities: z.object({
    radiusKm: z.number().min(1).max(25),
    schools: importance,
    shops: importance,
    pharmacies: importance,
    banks: importance,
  }),

  accommodation: z.object({
    wantsQuarters: z.boolean(),
    notes: z.string().max(500),
  }),

  mandatory: z.object({
    /** Exclude options whose known travel time exceeds travel.maxMinutes. */
    maxTravelTime: z.boolean(),
    /** Exclude options that match none of the preferred posts. */
    preferredPostsOnly: z.boolean(),
    /** Exclude options outside the preferred districts. */
    preferredDistrictsOnly: z.boolean(),
  }),

  criteria: z.object({
    post: criterionSchema,
    travel: criterionSchema,
    climate: criterionSchema,
    facilities: criterionSchema,
    location: criterionSchema,
  }),

  /** Options below this weighted evidence coverage (%) are ranked after better-evidenced ones. */
  minConfidentCoverage: z.number().min(0).max(100),
  notes: z.string().max(1000),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const TRAVEL_DEFAULTS: Record<Preferences["travelFrequency"], Preferences["travel"]> = {
  daily: { idealMinutes: 30, maxMinutes: 120, idealKm: 15, maxKm: 80 },
  weekly: { idealMinutes: 120, maxMinutes: 360, idealKm: 60, maxKm: 250 },
  occasional: { idealMinutes: 240, maxMinutes: 600, idealKm: 120, maxKm: 400 },
};

export function defaultPreferences(): Preferences {
  return {
    home: null,
    secondLocation: null,
    secondLocationShare: 30,
    posts: [],
    postScoring: { firstChoice: 100, stepDown: 15, floor: 40, unmatched: 0 },
    preferredInstitutions: [],
    preferredDistricts: [],
    excludedInstitutions: [],
    excludedDistricts: [],
    travelMode: "driving",
    travelFrequency: "daily",
    travel: { ...TRAVEL_DEFAULTS.daily },
    climate: { temperature: "any", rainfall: "any" },
    facilities: { radiusKm: 5, schools: 2, shops: 1, pharmacies: 0, banks: 0 },
    accommodation: { wantsQuarters: false, notes: "" },
    mandatory: { maxTravelTime: false, preferredPostsOnly: false, preferredDistrictsOnly: false },
    criteria: {
      post: { enabled: true, weight: 50 },
      travel: { enabled: true, weight: 30 },
      climate: { enabled: true, weight: 10 },
      facilities: { enabled: true, weight: 10 },
      location: { enabled: false, weight: 0 },
    },
    minConfidentCoverage: 60,
    notes: "",
  };
}

export type WeightIssue = { code: string; message: string };

const EPS = 0.01;

/** Weights of enabled criteria must total exactly 100 (within 0.01). */
export function validateWeights(criteria: Preferences["criteria"]): WeightIssue[] {
  const issues: WeightIssue[] = [];
  const enabled = CRITERIA.filter((c) => criteria[c].enabled);
  if (enabled.length === 0) issues.push({ code: "none_enabled", message: "Enable at least one criterion." });
  const total = enabled.reduce((s, c) => s + criteria[c].weight, 0);
  if (enabled.length > 0 && Math.abs(total - 100) > EPS)
    issues.push({ code: "total", message: `Enabled weights total ${round2(total)}%; they must total 100%.` });
  for (const c of enabled) {
    if (criteria[c].weight <= 0) issues.push({ code: "zero", message: `${c} is enabled but has 0% weight.` });
  }
  return issues;
}

/**
 * Scales enabled weights proportionally so they sum to 100, rounding to 2 decimals
 * and assigning the rounding remainder to the largest weight. If all enabled weights
 * are zero they are split equally. Disabled criteria are set to 0.
 */
export function normalizeWeights(criteria: Preferences["criteria"]): Preferences["criteria"] {
  const out = structuredClone(criteria);
  const enabled = CRITERIA.filter((c) => out[c].enabled);
  for (const c of CRITERIA) if (!out[c].enabled) out[c].weight = 0;
  if (enabled.length === 0) return out;
  const total = enabled.reduce((s, c) => s + Math.max(0, out[c].weight), 0);
  for (const c of enabled) out[c].weight = total > 0 ? round2((Math.max(0, out[c].weight) / total) * 100) : round2(100 / enabled.length);
  const sum = enabled.reduce((s, c) => s + out[c].weight, 0);
  const diff = round2(100 - sum);
  if (diff !== 0) {
    const largest = [...enabled].sort((a, b) => out[b].weight - out[a].weight || CRITERIA.indexOf(a) - CRITERIA.indexOf(b))[0];
    out[largest].weight = round2(out[largest].weight + diff);
  }
  return out;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Merges stored (possibly older) preference JSON with defaults, then validates. */
export function parsePreferences(raw: unknown): Preferences {
  const d = defaultPreferences();
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...d, ...r };
  for (const k of ["postScoring", "travel", "climate", "facilities", "accommodation", "mandatory", "criteria"] as const) {
    merged[k] = { ...(d[k] as object), ...((r[k] as object) ?? {}) };
  }
  const parsed = preferencesSchema.safeParse(merged);
  return parsed.success ? parsed.data : d;
}
