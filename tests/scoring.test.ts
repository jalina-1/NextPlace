import { describe, it, expect } from "vitest";
import { defaultPreferences, normalizeWeights, validateWeights, type Preferences } from "@/lib/preferences";
import { scoreOption, scoreAll, postScore, lowerIsBetter, lockTail, type ScorableOption, type OptionEvidence } from "@/lib/scoring";
import { addCalendarMonthsColombo } from "@/lib/dates";

function prefs(over: Partial<Preferences> = {}): Preferences {
  return {
    ...defaultPreferences(),
    home: { label: "Kandy", lat: 7.29, lng: 80.63 },
    posts: ["Medical Officer - OPD", "Medical Officer - ETU"],
    climate: { temperature: "cooler", rainfall: "any" },
    ...over,
  };
}
const opt = (id: string, seq: number, over: Partial<ScorableOption> = {}): ScorableOption => ({
  id, seq, institution: `Hospital ${id}`, district: "Kandy", designation: "Medical Officer - OPD", decision: "consider", ...over,
});
const fullEv = (minutes: number, temp: number, schools: number): OptionEvidence => ({
  travel: { primary: { driveMinutes: minutes, driveKm: minutes * 0.8, straightKm: minutes * 0.5 } },
  climate: { meanTempC: temp, annualRainMm: 2000 },
  facilities: { radiusKm: 5, counts: { schools, shops: 5 } },
});

describe("weights", () => {
  it("validates that enabled weights total 100", () => {
    const p = defaultPreferences();
    expect(validateWeights(p.criteria)).toEqual([]);
    p.criteria.post.weight = 60;
    expect(validateWeights(p.criteria)[0].code).toBe("total");
    p.criteria.post.enabled = false;
    p.criteria.travel.enabled = false;
    p.criteria.climate.enabled = false;
    p.criteria.facilities.enabled = false;
    expect(validateWeights(p.criteria).map((i) => i.code)).toContain("none_enabled");
  });
  it("normalizes proportionally to exactly 100 and zeroes disabled criteria", () => {
    const p = defaultPreferences();
    p.criteria.post.weight = 1;
    p.criteria.travel.weight = 1;
    p.criteria.climate.weight = 1;
    p.criteria.facilities.enabled = false;
    const n = normalizeWeights(p.criteria);
    expect(n.post.weight + n.travel.weight + n.climate.weight).toBeCloseTo(100, 5);
    expect(n.facilities.weight).toBe(0);
    expect(validateWeights(n)).toEqual([]);
  });
});

describe("criterion scores", () => {
  it("maps ordered post preferences to explicit scores", () => {
    const p = prefs();
    expect(postScore("Medical Officer - OPD", p)).toMatchObject({ score: 100, matchedRank: 1 });
    expect(postScore("Medical Officer - ETU", p)).toMatchObject({ score: 85, matchedRank: 2 });
    expect(postScore("Registrar", p)).toMatchObject({ score: 0, matchedRank: null });
  });
  it("uses linear thresholds", () => {
    expect(lowerIsBetter(30, 30, 120)).toBe(100);
    expect(lowerIsBetter(75, 30, 120)).toBe(50);
    expect(lowerIsBetter(200, 30, 120)).toBe(0);
  });
  it("uses travel time, not distance, when both are known (no double counting)", () => {
    const p = prefs();
    const r = scoreOption(opt("a", 0), fullEv(75, 20, 3), p);
    const travel = r.breakdown.find((b) => b.criterion === "travel")!;
    expect(travel.score).toBe(50);
    expect(travel.detail).toMatch(/min/);
    expect(travel.detail).not.toMatch(/road distance/);
  });
  it("falls back to road distance (never straight-line) when time is unknown", () => {
    const p = prefs();
    const r = scoreOption(opt("a", 0), { travel: { primary: { driveKm: 15, straightKm: 2 } } }, p);
    expect(r.breakdown.find((b) => b.criterion === "travel")!.score).toBe(100);
    const r2 = scoreOption(opt("a", 0), { travel: { primary: { straightKm: 2 } } }, p);
    expect(r2.breakdown.find((b) => b.criterion === "travel")!.score).toBeNull();
  });
});

describe("final score and missing data", () => {
  it("equals Σ score × weight / 100 with complete data", () => {
    const p = prefs();
    const r = scoreOption(opt("a", 0), fullEv(30, 18, 3), p);
    // post 100×50 + travel 100×30 + climate 100×10 + facilities: schools 3/3=100 (w2), shops 5/5=100 (w1) → 100×10
    expect(r.finalScore).toBe(100);
    expect(r.coverage).toBe(100);
    expect(r.status).toBe("complete");
    const r2 = scoreOption(opt("b", 1, { designation: "Medical Officer - ETU" }), fullEv(75, 23, 0), p);
    // post 85, travel 50, climate cooler 23°C → (28-23)/10*100=50, facilities: schools 0 (w2) + shops 100 (w1) → 33.33
    const expected = (85 * 50 + 50 * 30 + 50 * 10 + (100 / 3) * 10) / 100;
    expect(r2.finalScore).toBeCloseTo(Math.round(expected * 10) / 10, 5);
  });

  it("keeps unknown as unknown: provisional over known criteria with coverage shown", () => {
    const p = prefs();
    const r = scoreOption(opt("a", 0), { travel: { primary: { driveMinutes: 30 } } }, p);
    // known: post (50) + travel (30) = 80% coverage; climate/facilities unknown (not zero)
    expect(r.coverage).toBe(80);
    expect(r.finalScore).toBe(100);
    expect(r.status).toBe("provisional");
    expect(r.breakdown.find((b) => b.criterion === "climate")!.score).toBeNull();
    expect(r.explanation).toMatch(/Unknown: Climate, Facilities/);
  });

  it("marks low-coverage options and ranks them below better-evidenced ones", () => {
    const p = prefs({ posts: [] }); // post becomes unknown
    p.criteria.post.weight = 50;
    const a = opt("a", 0);
    const b = opt("b", 1);
    const ev = new Map<string, OptionEvidence>([
      ["a", { climate: { meanTempC: 18 } }], // only climate known: 10% coverage, score 100
      ["b", fullEv(100, 26, 1)], // all but post: 50% coverage, lower score
    ]);
    p.minConfidentCoverage = 40;
    const ranked = scoreAll([a, b], ev, p);
    expect(ranked[0].optionId).toBe("b");
    expect(ranked[1].status).toBe("low_coverage");
    expect(ranked[1].finalScore).toBe(100);
  });

  it("shows Unscored when all enabled criteria are unknown", () => {
    const p = prefs({ posts: [], home: null });
    const r = scoreOption(opt("a", 0), {}, p);
    expect(r.status).toBe("unscored");
    expect(r.finalScore).toBeNull();
    expect(r.coverage).toBe(0);
  });

  it("never removes 'never' options: ranks them below every other option, even with a higher score", () => {
    const p = prefs({ excludedDistricts: ["Jaffna"] });
    const fast: OptionEvidence = fullEv(30, 18, 3);
    const slow: OptionEvidence = fullEv(110, 28, 0);
    const options = [opt("a", 0, { district: "Jaffna" }), opt("b", 1), opt("c", 2, { designation: null }), opt("d", 3, { district: "Galle" })];
    const ranked = scoreAll(options, new Map([["a", fast], ["b", slow], ["d", slow]]), p);
    const byId = Object.fromEntries(ranked.map((r) => [r.optionId, r]));
    expect(ranked).toHaveLength(4);
    expect(byId.a.status).toBe("excluded");
    expect(byId.a.finalScore!).toBeGreaterThan(byId.b.finalScore!);
    expect(byId.a.systemRank).toBe(3); // after b and d despite the higher score
    expect(byId.c.status).toBe("incomplete");
    expect(byId.c.systemRank).toBeNull();
  });

  it("keeps locked options at the tail of any order", () => {
    expect(lockTail(["x", "a", "y", "b"], new Set(["x", "y"]))).toEqual(["a", "b", "x", "y"]);
  });

  it("breaks ties deterministically by institution then import order", () => {
    const p = prefs();
    const options = [opt("x", 2, { institution: "B" }), opt("y", 1, { institution: "A" }), opt("z", 0, { institution: "A" })];
    const r1 = scoreAll(options, new Map(), p).map((r) => r.optionId);
    const r2 = scoreAll([...options].reverse(), new Map(), p).map((r) => r.optionId);
    expect(r1).toEqual(["z", "y", "x"]);
    expect(r2).toEqual(r1);
  });

  it("applies the mandatory travel-time limit only when time is known", () => {
    const p = prefs();
    p.mandatory.maxTravelTime = true;
    p.travel.maxMinutes = 120;
    expect(scoreOption(opt("a", 0), fullEv(150, 20, 1), p).status).toBe("excluded");
    const unknown = scoreOption(opt("a", 0), {}, p);
    expect(unknown.status).not.toBe("excluded");
    expect(unknown.warnings[0]).toMatch(/could not be verified/);
  });
});

describe("calendar months in Asia/Colombo", () => {
  it("adds 12 months at the same local time", () => {
    const start = new Date("2026-11-02T04:30:00Z"); // 10:00 Colombo
    expect(addCalendarMonthsColombo(start, 12).toISOString()).toBe("2027-11-02T04:30:00.000Z");
  });
  it("clamps to month end", () => {
    const start = new Date("2027-01-31T06:30:00Z"); // 12:00 Colombo, 31 Jan
    expect(addCalendarMonthsColombo(start, 1).toISOString()).toBe("2027-02-28T06:30:00.000Z");
  });
  it("uses the Colombo date, not the UTC date", () => {
    const start = new Date("2027-01-31T20:00:00Z"); // 01:30 on 1 Feb Colombo
    expect(addCalendarMonthsColombo(start, 1).toISOString()).toBe("2027-02-28T20:00:00.000Z"); // 01:30 on 1 Mar Colombo
  });
});

describe("threshold validation", () => {
  it("rejects ideal values that are not below the maximum", async () => {
    const { validateThresholds } = await import("@/lib/preferences");
    const p = defaultPreferences();
    expect(validateThresholds(p)).toEqual([]);
    p.travel = { idealMinutes: 0, maxMinutes: 0, idealKm: 60, maxKm: 250 };
    expect(validateThresholds(p).map((i) => i.code)).toEqual(["travel_minutes"]);
    p.travel = { idealMinutes: 30, maxMinutes: 120, idealKm: 300, maxKm: 250 };
    expect(validateThresholds(p).map((i) => i.code)).toEqual(["travel_km"]);
  });
});
