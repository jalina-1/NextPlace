"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError, errMsg } from "@/lib/client/api";
import { Alert, Badge, Button, ButtonLink, Card, Empty, PremiumBadge, Spinner } from "@/components/ui";
import { formatColombo } from "@/lib/dates";

type Final = { items: string[]; excluded: string[]; revision: number; status: string; finalizedRevisionId: string | null; validation: string[]; revisions: { id: string; number: number; createdAt: string }[] };

export default function ExportPage() {
  const { id } = useParams<{ id: string }>();
  const [f, setF] = useState<Final | null>(null);
  const [premiumErr, setPremiumErr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<Final>(`/api/projects/${id}/final`).then(setF).catch((e) => (e instanceof ApiError && e.status === 402 ? setPremiumErr(true) : setError(errMsg(e)))), [id]);
  useEffect(() => {
    load();
  }, [load]);
  if (premiumErr)
    return (
      <Empty title="Excel export is part of full access">
        <div className="flex justify-center gap-2"><ButtonLink href={`/payment?project=${id}`}>Unlock full access</ButtonLink><PremiumBadge /></div>
      </Empty>
    );
  if (!f) return error ? <Alert tone="error">{error}</Alert> : <Spinner />;
  async function finalize() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/projects/${id}/final`, { method: "POST", json: { action: "finalize", expectedRevision: f!.revision } });
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <Card title="Summary before finalizing">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-navy-50 p-3"><dt className="text-navy-700">Entries in your list</dt><dd className="text-2xl font-semibold tabular">{f.items.length}</dd></div>
          <div className="rounded-lg bg-navy-50 p-3"><dt className="text-navy-700">Excluded / left out</dt><dd className="text-2xl font-semibold tabular">{f.excluded.length}</dd></div>
          <div className="rounded-lg bg-navy-50 p-3"><dt className="text-navy-700">Status</dt><dd className="text-lg font-semibold">{f.status === "finalized" ? "Finalized" : "Editing"}</dd></div>
        </dl>
        {f.validation.length > 0 ? (
          <div className="mt-4"><Alert tone="error" title="Fix these before finalizing">{f.validation.map((v) => <p key={v}>{v}</p>)}</Alert></div>
        ) : f.status !== "finalized" ? (
          <div className="mt-4"><Alert tone="success">No validation problems found.</Alert></div>
        ) : null}
        {error && <div className="mt-4"><Alert tone="error">{error}</Alert></div>}
        <div className="mt-4 flex flex-wrap gap-2">
          {f.status !== "finalized" ? (
            <>
              <ButtonLink variant="secondary" href={`/projects/${id}/final`}>Back to editing</ButtonLink>
              <Button onClick={finalize} disabled={busy || f.validation.length > 0}>Finalize this order</Button>
            </>
          ) : (
            <ButtonLink variant="secondary" href={`/projects/${id}/final`}>Open editor (reopen to change)</ButtonLink>
          )}
        </div>
        <p className="mt-3 text-xs text-navy-700">Finalizing creates an immutable revision. Exports are always generated from a finalized revision, so the file matches exactly what you reviewed.</p>
      </Card>
      <Card title="Download Excel">
        {f.revisions.length === 0 ? (
          <p className="text-sm text-navy-700">Finalize your list to download it.</p>
        ) : (
          <>
            <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={analysis} onChange={(e) => setAnalysis(e.target.checked)} /> Include an analysis sheet (scores, evidence coverage, explanations and sources)</label>
            <ul className="space-y-2">
              {f.revisions.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-navy-100 p-3">
                  <span className="text-sm">Revision #{r.number} · finalized {formatColombo(r.createdAt)} {r.id === f.finalizedRevisionId && <Badge tone="green">current</Badge>}</span>
                  <a className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800" href={`/api/projects/${id}/export?revision=${r.id}${analysis ? "&analysis=1" : ""}`}>Download .xlsx</a>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-navy-700">The preference sheet keeps your original column names and values (including INDEX) and adds a Preference Rank column. Visual formatting, formulas and macros from an uploaded workbook are not reproduced. Text that could be read as a spreadsheet formula is prefixed with an apostrophe for safety.</p>
          </>
        )}
      </Card>
      <Alert tone="info" title="Next steps">NextPlace does not submit your application. Use this list when completing the official transfer application yourself, and verify every entry against the official vacancy list.</Alert>
    </div>
  );
}
