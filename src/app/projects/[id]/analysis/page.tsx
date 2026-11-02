"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, Clock, HelpCircle, XCircle, MapPinOff, Route, Thermometer, School, ArrowRight, Square, RotateCw } from "lucide-react";
import { api, errMsg } from "@/lib/client/api";
import { useProject } from "@/lib/client/project";
import { Alert, Badge, Button, DemoBadge, Spinner, cx } from "@/components/ui";
import { formatColombo } from "@/lib/dates";

type Cand = { label: string; lat: number; lng: number; confidence: number };
type Item = {
  key: string;
  name: string;
  district: string | null;
  posts: string[];
  optionCount: number;
  state: "queued" | "researching" | "done" | "needs_choice" | "not_found" | "failed";
  location: string | null;
  travelMinutes: number | null;
  roadKm: number | null;
  meanTempC: number | null;
  facilities: Record<string, number | null> | null;
  providers: string[];
  isDemo: boolean;
};
type ProgressResp = {
  items: Item[];
  run: { id: string; status: string; level: string; total: number; done: number; failed: number; optionCount: number; evaluated: number; createdAt: string; finishedAt: string | null } | null;
  needsConfirmation: { key: string; name: string; district: string | null; candidates: Cand[]; isDemo: boolean }[];
  notFound: { key: string; name: string; district: string | null }[];
  resolved: number;
  failedJobs: { type: string; error: string | null }[];
};

const STATE: Record<Item["state"], { label: string; icon: React.ReactNode; tone: string }> = {
  done: { label: "Done", icon: <CheckCircle2 size={18} />, tone: "text-teal-700" },
  researching: { label: "Looking it up…", icon: <Loader2 size={18} className="animate-spin" />, tone: "text-teal-600" },
  queued: { label: "Waiting", icon: <Clock size={18} />, tone: "text-navy-700" },
  needs_choice: { label: "Needs your choice", icon: <HelpCircle size={18} />, tone: "text-amber-700" },
  not_found: { label: "Location not found", icon: <MapPinOff size={18} />, tone: "text-navy-700" },
  failed: { label: "Couldn’t look this up", icon: <XCircle size={18} />, tone: "text-red-700" },
};

function fmtMin(m: number | null) {
  if (m == null) return null;
  const h = Math.floor(m / 60);
  return h ? `${h} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`;
}

function AnalysisInner() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const { reload } = useProject();
  const [p, setP] = useState<ProgressResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const load = useCallback(() => api<ProgressResp>(`/api/projects/${id}/analysis`).then(setP).catch((e) => setError(errMsg(e))), [id]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/projects/${id}/analysis`, { method: "POST" });
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }, [id, load]);

  useEffect(() => {
    load().then(() => {
      if (sp.get("start") === "1" && !started.current) {
        started.current = true;
        router.replace(`/projects/${id}/analysis`);
        start();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    if (p?.run?.status !== "running") return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [p?.run?.status, load]);
  useEffect(() => {
    if (p?.run && p.run.status !== "running") reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.run?.status]);

  async function cancel() {
    setBusy(true);
    try {
      await api(`/api/projects/${id}/analysis`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function choose(key: string, idx: number | null) {
    await api(`/api/projects/${id}/locations`, { method: "POST", json: { institutionKey: key, candidateIndex: idx } });
    await load();
  }

  if (!p) return error ? <Alert tone="error">{error}</Alert> : <Spinner />;
  const run = p.run;
  const running = run?.status === "running";
  const doneCount = p.items.filter((i) => i.state === "done").length;
  const pct = p.items.length ? Math.round((100 * p.items.filter((i) => !["queued", "researching"].includes(i.state)).length) / p.items.length) : running ? 0 : 100;
  const anyDemo = p.items.some((i) => i.isDemo);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Analysis</p>
          <h1 className="mt-2 text-3xl font-extrabold text-navy-950 sm:text-4xl">{running ? "Researching your options…" : run ? "Research finished" : "Ready to research your list"}</h1>
          <p className="mt-2 max-w-2xl text-navy-700">
            For every hospital we find its location, your travel time, the weather and what is nearby. Each result shows where it came from. You can chat with your assistant on the right while this runs.
          </p>
        </div>
        <div className="flex gap-2">
          {running ? (
            <Button variant="secondary" onClick={cancel} disabled={busy}>
              <Square size={14} /> Stop
            </Button>
          ) : (
            <Button onClick={start} disabled={busy}>
              {run ? <><RotateCw size={16} /> Run again</> : "Start analysis"}
            </Button>
          )}
          {run && !running && (
            <Link href={`/projects/${id}/results`} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">
              See results <ArrowRight size={16} />
            </Link>
          )}
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {run && (
        <div className="rounded-2xl border border-navy-100 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-semibold text-navy-950">
              {doneCount} of {p.items.length} hospitals done
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {anyDemo && <DemoBadge />}
              <Badge>{run.level === "full" ? "Full analysis" : `Free preview · ${run.evaluated} of ${run.optionCount} options`}</Badge>
            </span>
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-navy-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Analysis progress">
            <div className="h-2.5 rounded-full bg-teal-700 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-navy-700">
            Started {formatColombo(run.createdAt)}
            {run.finishedAt ? ` · finished ${formatColombo(run.finishedAt)}` : ""}
            {running ? " · you can leave this page; it keeps going." : ""}
          </p>
        </div>
      )}

      {!run && !busy && (
        <div className="rounded-2xl border border-dashed border-navy-100 bg-white p-8 text-center">
          <p className="font-semibold text-navy-950">Nothing researched yet</p>
          <p className="mt-1 text-sm text-navy-700">Make sure you uploaded your list and answered the questions, then press “Start analysis”.</p>
        </div>
      )}

      {p.needsConfirmation.length > 0 && (
        <section className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5" data-field-error="true">
          <h2 className="text-lg font-bold text-navy-950">Which one is the right place?</h2>
          <p className="mt-1 text-sm text-navy-800">These names matched more than one place. Pick the right one, or say none of them.</p>
          <ul className="mt-4 space-y-4">
            {p.needsConfirmation.map((n) => (
              <li key={n.key} className="rounded-xl bg-white p-4">
                <p className="font-semibold">
                  {n.name} {n.district && <span className="text-sm font-normal text-navy-700">({n.district})</span>} {n.isDemo && <DemoBadge />}
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {n.candidates.map((c, i) => (
                    <Button key={i} variant="secondary" size="sm" className="justify-start text-left" onClick={() => choose(n.key, i)}>
                      {c.label}
                    </Button>
                  ))}
                  <Button variant="ghost" size="sm" className="justify-start" onClick={() => choose(n.key, null)}>
                    None of these
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.items.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {p.items.map((it) => {
            const st = STATE[it.state];
            return (
              <li key={it.key} className={cx("rounded-xl border bg-white px-4 py-3", it.state === "researching" ? "border-teal-500" : "border-navy-100")}>
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-semibold text-navy-950">{it.name}</span>
                    <span className="block text-xs text-navy-700">
                      {it.district ?? "District unknown"} · {it.optionCount} option{it.optionCount === 1 ? "" : "s"}
                      {it.posts.length ? ` · ${it.posts.join(", ")}` : ""}
                    </span>
                  </span>
                  <span className={cx("flex shrink-0 items-center gap-1.5 text-sm font-medium", st.tone)}>
                    {st.icon} {st.label}
                  </span>
                </div>
                {(it.travelMinutes != null || it.meanTempC != null || it.facilities?.schools != null || it.isDemo) && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-navy-800">
                    {it.travelMinutes != null && (
                      <span className="inline-flex items-center gap-1">
                        <Route size={14} /> {fmtMin(it.travelMinutes)}
                        {it.roadKm != null ? ` · ${it.roadKm} km` : ""}
                      </span>
                    )}
                    {it.meanTempC != null && (
                      <span className="inline-flex items-center gap-1">
                        <Thermometer size={14} /> {it.meanTempC} °C
                      </span>
                    )}
                    {it.facilities?.schools != null && (
                      <span className="inline-flex items-center gap-1">
                        <School size={14} /> {it.facilities.schools} schools nearby
                      </span>
                    )}
                    {it.isDemo && <DemoBadge />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {p.failedJobs.length > 0 && (
        <Alert tone="warning" title="Some lookups failed">
          Those details stay “unknown” and don&apos;t count against the option. Results are still usable.
        </Alert>
      )}
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense>
      <AnalysisInner />
    </Suspense>
  );
}
