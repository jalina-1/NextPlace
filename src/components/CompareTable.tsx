"use client";
import { Badge, DemoBadge, ScoreValue, cx } from "./ui";
import { fmtKm, fmtMin } from "./Evidence";
import type { ResultRow } from "@/lib/client/types";
import { formatColombo } from "@/lib/dates";

type Attr = { label: string; get: (r: ResultRow) => number | string | null; fmt?: (v: number | string | null, r: ResultRow) => React.ReactNode; better?: "high" | "low" };
const crit = (c: string) => (r: ResultRow) => r.breakdown.find((b) => b.criterion === c)?.score ?? null;

const ATTRS: Attr[] = [
  { label: "Weighted score", get: (r) => r.score, fmt: (_v, r) => <ScoreValue score={r.score} status={r.status} />, better: "high" },
  { label: "Evidence coverage", get: (r) => r.coverage, fmt: (v) => `${v}%`, better: "high" },
  { label: "Post", get: (r) => r.designation },
  { label: "District", get: (r) => r.district },
  { label: "Original INDEX", get: (r) => r.index },
  { label: "Vacancies", get: (r) => r.vacancies },
  { label: "Travel time (est.)", get: (r) => r.travel.minutes, fmt: (v) => fmtMin(v as number | null), better: "low" },
  { label: "Road distance", get: (r) => r.travel.roadKm, fmt: (v) => fmtKm(v as number | null), better: "low" },
  { label: "Straight-line distance", get: (r) => r.travel.straightKm, fmt: (v) => fmtKm(v as number | null) },
  { label: "Post score", get: crit("post"), better: "high" },
  { label: "Travel score", get: crit("travel"), better: "high" },
  { label: "Climate score", get: crit("climate"), better: "high" },
  { label: "Facility score", get: crit("facilities"), better: "high" },
  { label: "Mean temperature", get: (r) => r.climate?.meanTempC ?? null, fmt: (v) => (v == null ? "Unknown" : `${v} °C`) },
  { label: "Annual rainfall", get: (r) => r.climate?.annualRainMm ?? null, fmt: (v) => (v == null ? "Unknown" : `${v} mm`) },
  { label: "Schools nearby", get: (r) => r.facilities?.counts.schools ?? null, better: "high" },
  { label: "Shops nearby", get: (r) => r.facilities?.counts.shops ?? null, better: "high" },
  { label: "Rent you found (per month)", get: (r) => r.userRentLkr ?? null, fmt: (v) => (v == null ? "Unknown" : `Rs. ${Number(v).toLocaleString("en-LK")}`), better: "low" },
];

export function CompareTable({ rows, compact }: { rows: ResultRow[]; compact?: boolean }) {
  return (
    <div className="max-h-[70vh] overflow-auto rounded-lg border border-navy-100 bg-white">
      <table className="min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 top-0 z-20 min-w-36 border-b border-navy-100 bg-navy-50 px-3 py-2 text-left text-xs text-navy-700">Attribute</th>
            {rows.map((r) => (
              <th key={r.id} scope="col" className="sticky top-0 z-10 min-w-48 border-b border-l border-navy-100 bg-navy-50 px-3 py-2 text-left align-top">
                <span className="block font-semibold text-navy-900">{r.institution}</span>
                <span className="block text-xs font-normal text-navy-700">{r.designation}</span>
                {r.isDemoEvidence && <DemoBadge />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ATTRS.filter((a) => !compact || a.better).map((a) => {
            const vals = rows.map((r) => a.get(r));
            const nums = vals.filter((v): v is number => typeof v === "number");
            const best = a.better && nums.length > 1 ? (a.better === "high" ? Math.max(...nums) : Math.min(...nums)) : null;
            const differs = new Set(vals.map((v) => String(v))).size > 1;
            return (
              <tr key={a.label}>
                <th scope="row" className={cx("sticky left-0 z-10 border-b border-navy-100 bg-white px-3 py-2 text-left text-xs font-medium", differs ? "text-navy-950" : "text-navy-700")}>
                  {a.label} {differs && <span className="sr-only">(differs)</span>}
                </th>
                {rows.map((r, i) => {
                  const v = vals[i];
                  return (
                    <td key={r.id} className={cx("border-b border-l border-navy-100 px-3 py-2 tabular", v === best && best != null && "bg-teal-50 font-semibold text-teal-800", differs && v !== best && "bg-white")}>
                      {v == null ? <Badge>Unknown</Badge> : a.fmt ? a.fmt(v, r) : typeof v === "number" ? v.toFixed(1).replace(/\.0$/, "") : v}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {!compact && (
            <tr>
              <th scope="row" className="sticky left-0 z-10 border-b border-navy-100 bg-white px-3 py-2 text-left text-xs font-medium">Sources</th>
              {rows.map((r) => (
                <td key={r.id} className="border-b border-l border-navy-100 px-3 py-2 align-top text-xs text-navy-700">
                  {r.sources.length === 0 ? "No evidence" : r.sources.map((s, i) => <span key={i} className="block">{s.kind}: {s.provider}{s.isDemo ? " (demo)" : ""}, {formatColombo(s.retrievedAt, false)}</span>)}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
