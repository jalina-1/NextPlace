"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, errMsg } from "@/lib/client/api";
import { useProject } from "@/lib/client/project";
import { Alert, Badge, Button, ButtonLink, Card, DemoBadge, Progress, Spinner } from "@/components/ui";
import { formatColombo } from "@/lib/dates";

type Cand = { label: string; lat: number; lng: number; confidence: number; sourceUrl?: string };
type ProgressResp = {
  run: { id: string; status: string; level: string; total: number; done: number; failed: number; optionCount: number; evaluated: number; createdAt: string; finishedAt: string | null } | null;
  needsConfirmation: { key: string; name: string; district: string | null; candidates: Cand[]; isDemo: boolean }[];
  notFound: { key: string; name: string; district: string | null }[];
  resolved: number;
  failedJobs: { type: string; error: string | null }[];
};

const RUN_LABEL: Record<string, string> = { running: "Running", completed: "Completed", partial: "Completed with some failures", cancelled: "Cancelled", failed: "Failed", queued: "Queued" };

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const { reload } = useProject();
  const [p, setP] = useState<ProgressResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<ProgressResp>(`/api/projects/${id}/analysis`).then(setP).catch((e) => setError(errMsg(e))), [id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (p?.run?.status !== "running") return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [p?.run?.status, load]);
  useEffect(() => {
    if (p?.run && p.run.status !== "running") reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.run?.status]);

  async function start() {
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
  }
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
  const pct = run && run.total ? (100 * (run.done + run.failed)) / run.total : 0;
  return (
    <div className="space-y-6">
      <Card
        title="Research & analysis"
        actions={
          run?.status === "running" ? (
            <Button variant="secondary" onClick={cancel} disabled={busy}>Cancel</Button>
          ) : (
            <Button onClick={start} disabled={busy}>{run ? "Run analysis again" : "Start analysis"}</Button>
          )
        }
      >
        <div className="space-y-4 text-sm">
          <p className="text-navy-800">
            NextPlace matches each institution to a location, then retrieves travel estimates from your location(s), climate normals and nearby-facility counts. Results are cached and re-used; changing weights later recalculates scores without new lookups.
          </p>
          <p className="flex items-center gap-2 text-xs text-navy-700">
            <DemoBadge /> appears wherever evidence comes from the built-in synthetic demo providers rather than real research.
          </p>
          {error && <Alert tone="error">{error}</Alert>}
          {!run && <Alert>No analysis yet. Make sure your preferences (including an approximate home location) are saved and the import is confirmed.</Alert>}
          {run && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge tone={run.status === "completed" ? "green" : run.status === "running" ? "teal" : "amber"}>{RUN_LABEL[run.status] ?? run.status}</Badge>
                <Badge>{run.level === "full" ? "Full analysis" : "Free preview analysis"}</Badge>
                <Badge>{run.evaluated} of {run.optionCount} options researched</Badge>
                {p.resolved > 0 && <Badge tone="teal">{p.resolved} locations resolved</Badge>}
              </div>
              <Progress value={run.status === "running" ? pct : run.status === "cancelled" ? pct : 100} label={`${run.done} of ${run.total} research tasks done${run.failed ? `, ${run.failed} failed` : ""}`} />
              {run.level === "preview" && run.evaluated < run.optionCount && (
                <Alert tone="info">
                  The free preview researches up to {run.evaluated} options (your preferred posts first). Your free top three are chosen only from these, so they are not necessarily the best three in the whole list.
                </Alert>
              )}
              <p className="text-xs text-navy-700">Started {formatColombo(run.createdAt)}{run.finishedAt ? ` · finished ${formatColombo(run.finishedAt)}` : ""}</p>
              {run.status === "running" && <Spinner label="Researching… you can leave this page; work continues in the background." />}
              {run.status !== "running" && run.status !== "cancelled" && (
                <ButtonLink href={`/projects/${id}/results`}>View results</ButtonLink>
              )}
            </>
          )}
        </div>
      </Card>

      {p.needsConfirmation.length > 0 && (
        <Card title={`Confirm ${p.needsConfirmation.length} location${p.needsConfirmation.length === 1 ? "" : "s"}`}>
          <p className="mb-4 text-sm text-navy-700">These names matched more than one place. Choose the correct one — we never pick silently. Options for unconfirmed institutions stay without location evidence.</p>
          <ul className="space-y-4">
            {p.needsConfirmation.map((n) => (
              <li key={n.key} className="rounded-lg border border-navy-100 p-3">
                <p className="font-medium">{n.name} {n.district && <span className="text-sm text-navy-700">({n.district})</span>} {n.isDemo && <DemoBadge />}</p>
                <div className="mt-2 flex flex-col gap-2">
                  {n.candidates.map((c, i) => (
                    <Button key={i} variant="secondary" size="sm" className="justify-start text-left" onClick={() => choose(n.key, i)}>
                      {c.label} <span className="text-xs text-navy-700">({c.lat.toFixed(3)}, {c.lng.toFixed(3)})</span>
                    </Button>
                  ))}
                  <Button variant="ghost" size="sm" className="justify-start" onClick={() => choose(n.key, null)}>None of these — leave location unknown</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {p.notFound.length > 0 && (
        <Card title="Institutions without a location match">
          <p className="mb-2 text-sm text-navy-700">Travel, climate and facility criteria stay unknown for these. You can correct the institution or district text in the import review and run analysis again.</p>
          <ul className="list-disc pl-5 text-sm">{p.notFound.map((n) => <li key={n.key}>{n.name}{n.district ? ` (${n.district})` : ""}</li>)}</ul>
        </Card>
      )}

      {p.failedJobs.length > 0 && (
        <Card title="Research errors">
          <p className="mb-2 text-sm text-navy-700">Some lookups failed after retries. Affected criteria are shown as unknown; partial results are still usable.</p>
          <ul className="space-y-1 text-sm">{p.failedJobs.map((f, i) => <li key={i}><Badge tone="red">{f.type}</Badge> {f.error}</li>)}</ul>
        </Card>
      )}
    </div>
  );
}
