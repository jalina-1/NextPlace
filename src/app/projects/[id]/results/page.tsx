"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, errMsg } from "@/lib/client/api";
import { Alert, Badge, Button, ButtonLink, Card, DemoBadge, Empty, Input, PremiumBadge, ScoreValue, Select, Spinner, Tabs, cx } from "@/components/ui";
import { Breakdown, Sources, fmtKm, fmtMin } from "@/components/Evidence";
import type { ResultRow } from "@/lib/client/types";

type Resp = {
  state: "not_analyzed" | "analyzing" | "ready";
  premium: boolean;
  previewFrozen: boolean;
  previewBasis: { totalOptions?: number; eligibleOptions?: number; evaluatedOptions?: number; allEligibleEvaluated?: boolean; level?: string } | null;
  run: { status: string; level: string; evaluated: number; optionCount: number } | null;
  totalOptions: number;
  rows: ResultRow[];
  hiddenCount: number;
  counts: { ranked?: number; excluded?: number; unranked?: number; provisional?: number; demo?: number };
  districts?: string[];
};

const SORTS = [
  ["score", "Best match"],
  ["time", "Closest first"],
  ["district", "District"],
  ["institution", "Hospital name"],
] as const;

type Point = { good: boolean | null; text: string };

/** Two or three plain-language points about an option (no numbers or jargon). */
function keyPoints(r: ResultRow): Point[] {
  const pts: Point[] = [];
  if (r.lockedToBottom) pts.push({ good: false, text: "On your “can’t go” list" });
  const c = (k: string) => r.breakdown.find((b) => b.criterion === k && b.enabled && b.weight > 0);
  const post = c("post");
  if (post?.score != null) pts.push(post.score >= 100 ? { good: true, text: "Your first-choice post" } : post.score > 0 ? { good: true, text: "One of the posts you picked" } : { good: false, text: "Not a post you picked" });
  const travel = c("travel");
  const mins = r.travel.minutes;
  if (travel?.score != null) {
    const when = mins != null ? ` (about ${fmtMin(mins)})` : "";
    pts.push(travel.score >= 70 ? { good: true, text: `Short journey${when}` } : travel.score <= 30 ? { good: false, text: `Long journey${when}` } : { good: null, text: `Medium journey${when}` });
  }
  const loc = c("location");
  if (loc?.score != null && loc.score > 0) pts.push({ good: true, text: "A place you like" });
  const climate = c("climate");
  if (climate?.score != null && (climate.score >= 70 || climate.score <= 30)) pts.push(climate.score >= 70 ? { good: true, text: "Weather you like" } : { good: false, text: "Not the weather you prefer" });
  const fac = c("facilities");
  if (fac?.score != null && (fac.score >= 70 || fac.score <= 30)) pts.push(fac.score >= 70 ? { good: true, text: "Schools and shops nearby" } : { good: false, text: "Few schools or shops nearby" });
  return pts.slice(0, 3);
}

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [sort, setSort] = useState<string>("score");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const load = useCallback(() => {
    const p = new URLSearchParams({ view: "ranked", sort });
    if (q) p.set("q", q);
    api<Resp>(`/api/projects/${id}/results?${p}`).then(setData).catch((e) => setError(errMsg(e)));
  }, [id, sort, q]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    window.addEventListener("np-proposal-applied", load);
    return () => window.removeEventListener("np-proposal-applied", load);
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
        <Alert tone="info" title="Your top three — free">
          {basis?.allEligibleEvaluated
            ? "These are your best three matches from your whole list."
            : `These are the best three of the ${basis?.evaluatedOptions ?? "?"} options we checked for free, not necessarily the best of your whole list.`}{" "}
          Unlock full access to see every option.
        </Alert>
      )}
      {data.run?.status === "running" && <Alert tone="info">Analysis is still running; results update as evidence arrives and are provisional.</Alert>}
      {(data.counts.demo ?? 0) > 0 && (
        <p className="flex items-center gap-2 text-xs text-navy-700"><DemoBadge /> Some evidence below is synthetic demo data from the built-in demo providers, not real research.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-48 flex-1">
          <span className="sr-only">Search</span>
          <Input placeholder="Search hospital, district or post" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-navy-800">
          Sort by
          <Select aria-label="Sort by" className="w-44" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-navy-700">{data.rows.length} shown · {selected.length} selected for comparison{!data.premium && " (max 3)"}</p>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={selected.length < 2} onClick={() => router.push(`/projects/${id}/compare?ids=${selected.join(",")}`)}>Compare selected</Button>
          {data.premium && <ButtonLink href={`/projects/${id}/final`}>Edit final list</ButtonLink>}
        </div>
      </div>

      {data.rows.length === 0 ? (
        <Empty title="Nothing matches your search" />
      ) : (
        <ul className="space-y-3">
          {data.rows.map((r, i) => {
            return (
              <li key={r.id} className={cx("rounded-xl border bg-white shadow-sm", r.lockedToBottom ? "border-dashed border-navy-100 opacity-80" : "border-navy-100")}>
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1.5 h-4 w-4 shrink-0 accent-teal-700" aria-label={`Select ${r.institution} for comparison`} checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-sm font-bold text-teal-800" aria-label={data.premium ? `System rank ${r.systemRank ?? "none"}` : `Preview option ${i + 1}`}>
                      {data.premium ? r.systemRank ?? "—" : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold break-words text-navy-950">{r.institution}</p>
                      <p className="text-sm text-navy-800">{r.designation}</p>
                      <p className="text-xs text-navy-700">{r.district ?? "District unknown"} · INDEX {r.index ?? "—"} · {r.vacancies ? `${r.vacancies} vacancies` : "vacancies not stated"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <ScoreValue score={r.score} status={r.status} />
                    </div>
                  </div>
                  {(r.coverage < 100 || r.isDemoEvidence || r.preferenceRank) && (
                    <div className="mt-3 flex flex-wrap gap-1.5 sm:pl-[5.25rem]">
                      {r.coverage < 100 && <Badge tone="amber">Some information missing</Badge>}
                      {r.isDemoEvidence && <DemoBadge />}
                      {r.preferenceRank && <Badge tone="teal">Your rank {r.preferenceRank}</Badge>}
                    </div>
                  )}
                  <dl className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-navy-50 px-3 py-2 text-xs sm:ml-[5.25rem]">
                    <div><dt className="text-navy-700">Travel</dt><dd className="tabular font-semibold">{fmtMin(r.travel.minutes)}</dd></div>
                    <div><dt className="text-navy-700">Road</dt><dd className="tabular font-semibold">{fmtKm(r.travel.roadKm)}</dd></div>
                    <div><dt className="text-navy-700">Straight line</dt><dd className="tabular font-semibold">{fmtKm(r.travel.straightKm)}</dd></div>
                  </dl>
                </div>
                <div className="border-t border-navy-100 px-4 py-2">
                  <ul className="space-y-1 text-sm">
                    {keyPoints(r).map((pt) => (
                      <li key={pt.text} className="flex items-center gap-2">
                        <span aria-hidden className={cx("font-bold", pt.good === true ? "text-teal-700" : pt.good === false ? "text-red-600" : "text-navy-700")}>{pt.good === true ? "✓" : pt.good === false ? "✗" : "•"}</span>
                        <span className="text-navy-900">{pt.text}</span>
                      </li>
                    ))}
                  </ul>
                  <button className="mt-1 text-sm font-medium text-teal-800 underline" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                    {open === r.id ? "Hide details" : "Details"}
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


      {(data.counts.unranked ?? 0) > 0 && (
        <p className="rounded-xl bg-navy-50 px-4 py-3 text-sm text-navy-800">
          {data.counts.unranked} option{data.counts.unranked === 1 ? "" : "s"} couldn&apos;t be ranked because some details are missing in your list.{" "}
          <Link className="font-semibold text-teal-800 underline" href={`/projects/${id}/import`}>Fix them in step 1</Link>
        </p>
      )}

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
