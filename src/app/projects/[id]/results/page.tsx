"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, errMsg } from "@/lib/client/api";
import { Alert, Badge, Button, ButtonLink, Card, DemoBadge, Empty, Input, PremiumBadge, ScoreValue, Select, Spinner, Tabs, cx } from "@/components/ui";
import { Breakdown, Sources, fmtKm, fmtMin } from "@/components/Evidence";
import type { ResultRow } from "@/lib/client/types";
import { Assistant } from "@/components/Assistant";

type Resp = {
  state: "not_analyzed" | "analyzing" | "ready";
  premium: boolean;
  previewFrozen: boolean;
  previewBasis: { totalOptions?: number; eligibleOptions?: number; evaluatedOptions?: number; allEligibleEvaluated?: boolean; level?: string } | null;
  run: { status: string; level: string; evaluated: number; optionCount: number } | null;
  totalOptions: number;
  rows: ResultRow[];
  hiddenCount: number;
  counts: { ranked?: number; excluded?: number; provisional?: number; demo?: number };
  districts?: string[];
};

const SORTS = [
  ["score", "Weighted score"],
  ["rank", "System rank"],
  ["time", "Travel time"],
  ["distance", "Road distance"],
  ["post", "Post-preference score"],
  ["climate", "Climate-match score"],
  ["facilities", "Facility score"],
  ["institution", "Institution"],
  ["district", "District"],
  ["index", "Original INDEX"],
] as const;

const STATUS_BADGE: Record<string, { tone: "green" | "amber" | "red" | "neutral"; label: string }> = {
  complete: { tone: "green", label: "Complete evidence" },
  provisional: { tone: "amber", label: "Provisional" },
  low_coverage: { tone: "amber", label: "Low evidence" },
  unscored: { tone: "neutral", label: "Unscored" },
  excluded: { tone: "red", label: "Excluded" },
  not_considered: { tone: "neutral", label: "Not considered" },
  incomplete: { tone: "red", label: "Incomplete row" },
};

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [view, setView] = useState<"ranked" | "excluded" | "all">("ranked");
  const [sort, setSort] = useState<string>("score");
  const [dir, setDir] = useState<"" | "asc" | "desc">("");
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState("");
  const [maxMinutes, setMaxMinutes] = useState("");
  const [minCoverage, setMinCoverage] = useState("");
  const [matched, setMatched] = useState(false);
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const load = useCallback(() => {
    const p = new URLSearchParams({ view, sort });
    if (dir) p.set("dir", dir);
    if (q) p.set("q", q);
    if (district) p.set("district", district);
    if (maxMinutes) p.set("maxMinutes", maxMinutes);
    if (minCoverage) p.set("minCoverage", minCoverage);
    if (matched) p.set("matchedPostsOnly", "true");
    api<Resp>(`/api/projects/${id}/results?${p}`).then(setData).catch((e) => setError(errMsg(e)));
  }, [id, view, sort, dir, q, district, maxMinutes, minCoverage, matched]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Spinner />;
  if (data.state === "not_analyzed") return <Empty title="No analysis yet"><ButtonLink href={`/projects/${id}/analysis`}>Go to analysis</ButtonLink></Empty>;
  if (data.state === "analyzing") return <Empty title="Your free preview is being prepared">Results appear when the first analysis finishes. <Link className="underline" href={`/projects/${id}/analysis`}>See progress</Link></Empty>;

  const basis = data.previewBasis;
  const maxCompare = data.premium ? 50 : 3;
  const toggle = (rid: string) => setSelected((s) => (s.includes(rid) ? s.filter((x) => x !== rid) : s.length >= maxCompare ? s : [...s, rid]));

  return (
    <div className="space-y-5">
      {!data.premium && (
        <Alert tone="info" title="Free preview: your top three">
          These three were selected from the {basis?.evaluatedOptions ?? "?"} option(s) researched in your first analysis
          {basis?.allEligibleEvaluated ? ", which covered every option you are considering." : ` — not the whole list of ${basis?.totalOptions ?? data.totalOptions}. They are not necessarily the best three overall.`}{" "}
          You can sort, compare and re-weight these three. The remaining options stay hidden until you unlock full access.
        </Alert>
      )}
      {data.run?.status === "running" && <Alert tone="info">Analysis is still running; results update as evidence arrives and are provisional.</Alert>}
      {(data.counts.demo ?? 0) > 0 && (
        <p className="flex items-center gap-2 text-xs text-navy-700"><DemoBadge /> Some evidence below is synthetic demo data from the built-in demo providers, not real research.</p>
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Tabs label="Result view" value={view} onChange={setView} items={[{ value: "ranked", label: `Ranked${data.counts.ranked != null ? ` (${data.counts.ranked})` : ""}` }, { value: "excluded", label: `Excluded & incomplete${data.counts.excluded != null ? ` (${data.counts.excluded})` : ""}` }, { value: "all", label: "All" }]} />
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor="sort" className="block text-xs text-navy-700">Sort by</label>
              <Select id="sort" value={sort} onChange={(e) => { setSort(e.target.value); setDir(""); }}>
                {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </div>
            <Button variant="secondary" size="sm" aria-label="Toggle sort direction" onClick={() => setDir(dir === "asc" ? "desc" : "asc")}>{dir === "asc" ? "↑ Asc" : dir === "desc" ? "↓ Desc" : "Default"}</Button>
          </div>
          <Input aria-label="Search" placeholder="Search" className="w-40" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select aria-label="District" className="w-40" value={district} onChange={(e) => setDistrict(e.target.value)}>
            <option value="">All districts</option>
            {(data.districts ?? []).map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
          <Input aria-label="Maximum travel minutes" placeholder="Max travel (min)" inputMode="numeric" className="w-36" value={maxMinutes} onChange={(e) => setMaxMinutes(e.target.value.replace(/\D/g, ""))} />
          <Input aria-label="Minimum evidence coverage percent" placeholder="Min coverage %" inputMode="numeric" className="w-36" value={minCoverage} onChange={(e) => setMinCoverage(e.target.value.replace(/\D/g, ""))} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={matched} onChange={(e) => setMatched(e.target.checked)} /> Preferred posts only</label>
        </div>
        <p className="mt-3 text-xs text-navy-700">Unknown values always sort last, in either direction. Ties are broken by system rank, then import order. Change weights in <Link href={`/projects/${id}/preferences`} className="underline">Preferences → Weights</Link>; scores are recalculated from stored evidence.</p>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-navy-700">{data.rows.length} shown · {selected.length} selected for comparison{!data.premium && " (max 3)"}</p>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={selected.length < 2} onClick={() => router.push(`/projects/${id}/compare?ids=${selected.join(",")}`)}>Compare selected</Button>
          {data.premium && <ButtonLink href={`/projects/${id}/final`}>Edit final list</ButtonLink>}
        </div>
      </div>

      {data.rows.length === 0 ? (
        <Empty title="No options match these filters" />
      ) : (
        <ul className="space-y-3">
          {data.rows.map((r, i) => {
            const st = STATUS_BADGE[r.status] ?? { tone: "neutral", label: r.status };
            return (
              <li key={r.id} className="rounded-xl border border-navy-100 bg-white shadow-sm">
                <div className="flex flex-wrap items-start gap-3 p-4">
                  <input type="checkbox" className="mt-1.5" aria-label={`Select ${r.institution} for comparison`} checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                  <div className="w-10 text-center">
                    <span className="block text-xs text-navy-700">{data.premium ? "Rank" : "#"}</span>
                    <span className="tabular text-lg font-semibold text-navy-900">{data.premium ? r.systemRank ?? "—" : i + 1}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-navy-900">{r.institution}</p>
                    <p className="text-sm text-navy-800">{r.designation}</p>
                    <p className="text-xs text-navy-700">{r.district ?? "District unknown"} · INDEX {r.index ?? "—"} · {r.vacancies ? `${r.vacancies} vacancies` : "vacancies not stated"}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <Badge>Evidence {r.coverage}%</Badge>
                      {r.isDemoEvidence && <DemoBadge />}
                      {r.preferenceRank && <Badge tone="teal">Your rank {r.preferenceRank}</Badge>}
                    </div>
                  </div>
                  <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs sm:w-80">
                    <div><dt className="text-navy-700">Travel</dt><dd className="tabular font-medium">{fmtMin(r.travel.minutes)}</dd></div>
                    <div><dt className="text-navy-700">Road</dt><dd className="tabular font-medium">{fmtKm(r.travel.roadKm)}</dd></div>
                    <div><dt className="text-navy-700">Straight line</dt><dd className="tabular font-medium">{fmtKm(r.travel.straightKm)}</dd></div>
                  </dl>
                  <div className="w-28 text-right">
                    <ScoreValue score={r.score} status={r.status} />
                  </div>
                </div>
                <div className="border-t border-navy-100 px-4 py-2">
                  <p className="text-sm text-navy-800">{r.explanation}</p>
                  <button className="mt-1 text-sm font-medium text-teal-800 underline" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                    {open === r.id ? "Hide details" : "Score breakdown & sources"}
                  </button>
                  {open === r.id && (
                    <div className="mt-3 grid gap-4 pb-2 lg:grid-cols-2">
                      <Breakdown items={r.breakdown} />
                      <div className="space-y-2">
                        <Sources sources={r.sources} location={r.location} />
                        {r.climate && <p className="text-xs">Climate: {r.climate.meanTempC ?? "?"} °C mean · {r.climate.annualRainMm ?? "?"} mm/yr</p>}
                        {r.facilities && <p className="text-xs">Within {r.facilities.radiusKm} km: {Object.entries(r.facilities.counts).map(([k, v]) => `${k} ${v ?? "?"}`).join(", ")}</p>}
                        <p className="text-xs text-navy-700">Source row: {r.sourceRef}</p>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <details className="rounded-xl border border-navy-100 bg-white p-4 shadow-sm">
        <summary className="cursor-pointer font-medium text-navy-900">Ask the assistant about {data.premium ? "your options" : "your three preview options"}</summary>
        <div className="mt-3 h-[26rem]"><Assistant projectId={id} onApplied={load} /></div>
      </details>

      {!data.premium && data.hiddenCount > 0 && (
        <div className={cx("rounded-xl border-2 border-dashed border-amber-200 bg-amber-50 p-6 text-center")}>
          <p className="text-lg font-semibold text-navy-900">{data.hiddenCount} additional options — unlock full access</p>
          <p className="mt-1 text-sm text-navy-800">Full access shows the complete analyzed ranking with evidence, larger comparisons, final-list editing with the assistant, and Excel export.</p>
          <div className="mt-4 flex justify-center gap-2">
            <ButtonLink href={`/payment?project=${id}`}>See how to unlock</ButtonLink>
            <PremiumBadge />
          </div>
        </div>
      )}
    </div>
  );
}
