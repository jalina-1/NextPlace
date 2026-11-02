import { z } from "zod";
export const keys = ["post", "travel", "climate", "facilities"] as const;
export type Criterion = (typeof keys)[number];
export const preferencesSchema = z.object({
  posts: z.array(z.string()).default([]),
  districts: z.array(z.string()).default([]),
  institutions: z.array(z.string()).default([]),
  excludedDistricts: z.array(z.string()).default([]),
  excludedInstitutions: z.array(z.string()).default([]),
  home: z.string().max(200).default(""),
  secondLocation: z.string().max(200).default(""),
  mode: z.enum(["driving", "transit", "mixed"]).default("driving"),
  frequency: z.enum(["daily", "weekly", "occasional"]).default("daily"),
  maxMinutes: z.number().positive().default(180),
  maxKm: z.number().positive().default(150),
  climate: z.enum(["cool", "temperate", "warm", "any"]).default("any"),
  accommodation: z.string().max(200).default(""),
  mandatory: z.string().max(1000).default(""),
  weights: z
    .object({
      post: z.number().min(0).max(100),
      travel: z.number().min(0).max(100),
      climate: z.number().min(0).max(100),
      facilities: z.number().min(0).max(100),
    })
    .refine(
      (w) =>
        Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 100) < 0.001,
      "Enabled weights must total 100%",
    ),
});
export const defaults = preferencesSchema.parse({
  weights: { post: 50, travel: 30, climate: 10, facilities: 10 },
});
export function score(option: any, p: any) {
  const e = option.evidence || {};
  const i = p.posts.findIndex(
    (v: string) => v.toLowerCase() === option.post.toLowerCase(),
  );
  const scores: Record<Criterion, number | null> = {
    post: p.posts.length
      ? i < 0
        ? 0
        : Math.max(0, 100 - (i * 100) / p.posts.length)
      : null,
    travel:
      e.minutes?.value != null
        ? Math.max(0, 100 - (50 * e.minutes.value) / p.maxMinutes)
        : null,
    climate:
      p.climate === "any"
        ? null
        : e.temperature?.value != null
          ? Math.max(
              0,
              100 -
                Math.abs(
                  e.temperature.value -
                    ({ cool: 18, temperate: 24, warm: 29 } as any)[p.climate],
                ) *
                  10,
            )
          : null,
    facilities:
      e.schoolKm?.value != null
        ? Math.max(0, 100 - e.schoolKm.value * 20)
        : null,
  };
  let coverage = 0,
    total = 0;
  for (const k of keys)
    if (scores[k] !== null) {
      coverage += p.weights[k];
      total += scores[k]! * p.weights[k];
    }
  const excluded =
    p.excludedDistricts.includes(option.district) ||
    p.excludedInstitutions.includes(option.institution);
  return {
    ...option,
    scores,
    score: coverage ? Math.round((total / coverage) * 100) / 100 : null,
    coverage,
    provisional: coverage < 100,
    excluded,
    explanation: coverage
      ? `Weighted score over ${coverage}% known evidence. ${coverage < 100 ? "Provisional; missing criteria are omitted." : ""}`
      : "Unscored: no enabled criteria have evidence.",
  };
}
export function rank(options: any[], p: any) {
  return options
    .map((o) => score(o, p))
    .sort(
      (a, b) =>
        Number(a.excluded) - Number(b.excluded) ||
        (b.score ?? -1) - (a.score ?? -1) ||
        b.coverage - a.coverage ||
        a.id.localeCompare(b.id),
    );
}
export function validOrder(ids: string[], options: any[]) {
  return (
    ids.length === options.length &&
    new Set(ids).size === ids.length &&
    ids.every((id) => options.some((o) => o.id === id))
  );
}
export function addYear(date: Date) {
  const d = new Date(date.getTime() + 330 * 60000);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return new Date(d.getTime() - 330 * 60000);
}
export function safeCell(value: any) {
  return typeof value === "string" && /^[\s]*[=+@-]/.test(value)
    ? "'" + value
    : value;
}
