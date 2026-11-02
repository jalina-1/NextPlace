"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, errMsg } from "@/lib/client/api";
import { useProject } from "@/lib/client/project";
import { Alert, Badge, Button, Card, Empty, Field, Input, Select, Spinner, Tabs, cx } from "@/components/ui";
import { StepPage } from "@/components/StepPage";

type Cell = string | number | null;
type TableInfo = { key: string; label: string; rowCount: number; headerRowIndex: number; headers: string[]; suggestion: { mapping: Record<string, number | null>; confidence: Record<string, number>; ambiguous: string[] }; warnings: string[]; previewRows: { ref: string; cells: Cell[]; confidence: number; flags: string[] }[] };
type ImportState = { source: { id: string; name: string; kind: string; sizeBytes: number; status: string; warnings: string[] } | null; mapping: { tableKey: string; headerRowIndex: number; mapping: Record<string, number | null>; originalHeaders: string[]; confirmedAt: string } | null; tables: TableInfo[]; ocrAvailable?: boolean };
type Row = { id: string; seq: number; sourceRef: string; original: Cell[]; index: string | null; district: string | null; institution: string | null; designation: string | null; vacancies: string | null; corrections: Record<string, string>; confidence: number; flags: string[]; duplicateGroup: string | null; decision: string };
type RowsResp = { headers: string[]; total: number; filtered: number; counts: { flagged: number; incomplete: number; duplicates: number; notConsidered: number }; rows: Row[] };

const FIELDS = [
  { key: "index", label: "INDEX / reference", required: false },
  { key: "district", label: "District", required: false },
  { key: "institution", label: "Institution", required: true },
  { key: "designation", label: "Post / designation", required: true },
  { key: "vacancies", label: "Vacancies", required: false },
] as const;

const FLAG_LABEL: Record<string, string> = {
  incomplete: "Missing institution or post",
  possible_duplicate: "Possible duplicate",
  wrapped_row_merged: "Wrapped line joined",
  formula_value_used: "Formula value used",
  text_outside_columns: "Text outside columns",
  missing_cells: "Empty cells",
  manually_corrected: "Corrected",
  column_count_mismatch: "Column count differs",
  short_row: "Short row",
};
const flagLabel = (f: string) => FLAG_LABEL[f] ?? (f.startsWith("possibly_truncated") ? `Possibly truncated (${f.split(":")[1]})` : f);

function Upload({ id, onDone, hasSource }: { id: string; onDone: () => void; hasSource: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    if (!file) return;
    if (hasSource && !confirm("Replace the current file? Imported rows, analysis results and the final list for this project will be reset.")) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      await api(`/api/projects/${id}/import`, { method: "POST", body: fd });
      setFile(null);
      onDone();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <label htmlFor="file" className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-navy-100 bg-navy-50 px-6 py-8 text-center hover:border-teal-600">
        <span className="font-medium text-navy-900">{file ? file.name : "Choose your vacancy list"}</span>
        <span className="mt-1 text-xs text-navy-700">Excel (.xlsx), CSV or PDF · up to 15 MB · macros are never run</span>
        <input id="file" type="file" className="sr-only" accept=".xlsx,.csv,.pdf,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {error && <Alert tone="error">{error}</Alert>}
      <Button onClick={go} disabled={!file || busy}>{busy ? "Reading file…" : "Upload and read"}</Button>
    </div>
  );
}

function Mapping({ id, state, onConfirmed }: { id: string; state: ImportState; onConfirmed: () => void }) {
  const initialKey = state.mapping?.tableKey ?? state.tables.reduce((best, t) => (t.suggestion.mapping.institution != null && t.rowCount > (best?.rowCount ?? 0) ? t : best), state.tables[0])?.key;
  const [tableKey, setTableKey] = useState(initialKey);
  const table = state.tables.find((t) => t.key === tableKey) ?? state.tables[0];
  const [headerRow, setHeaderRow] = useState(state.mapping?.headerRowIndex ?? table.headerRowIndex);
  const [mapping, setMapping] = useState<Record<string, number | null>>(state.mapping?.mapping ?? table.suggestion.mapping);
  const [preview, setPreview] = useState<{ headers: string[]; issues: string[]; total: number; incomplete: number; duplicates: number; rows: { seq: number; sourceRef: string; fields: Record<string, string | null>; confidence: number; flags: string[] }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headers = (table.previewRows[headerRow]?.cells ?? []).map((c, i) => (c == null || c === "" ? `Column ${i + 1}` : String(c)));
  useEffect(() => {
    setPreview(null);
    const t = setTimeout(() => {
      doPreview();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableKey, headerRow, mapping]);
  async function doPreview() {
    setBusy(true);
    setError(null);
    try {
      setPreview(await api(`/api/projects/${id}/import/preview`, { method: "POST", json: { tableKey, headerRowIndex: headerRow, mapping } }));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirmIt() {
    if (state.mapping && !confirm("Re-confirming the mapping re-creates all rows. Corrections, analysis results and your final list for this project will be reset. Continue?")) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/projects/${id}/import/confirm`, { method: "POST", json: { tableKey, headerRowIndex: headerRow, mapping } });
      onConfirmed();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      {state.tables.length > 1 && (
        <Field label="Which sheet or table contains the vacancy list?" htmlFor="tbl">
          <Select id="tbl" value={tableKey} onChange={(e) => { const t = state.tables.find((x) => x.key === e.target.value)!; setTableKey(t.key); setHeaderRow(t.headerRowIndex); setMapping(t.suggestion.mapping); }}>
            {state.tables.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </Select>
        </Field>
      )}
      {table.warnings.length > 0 && <Alert tone="warning">{table.warnings.map((w) => <p key={w}>{w}</p>)}</Alert>}
      <Field label="Header row" htmlFor="hdr" hint="The row that contains the column names. Rows above it (titles) are ignored.">
        <Select id="hdr" value={headerRow} onChange={(e) => setHeaderRow(Number(e.target.value))}>
          {table.previewRows.slice(0, 40).map((r, i) => (
            <option key={i} value={i}>
              {r.ref}: {r.cells.filter((c) => c != null && c !== "").slice(0, 5).join(" | ").slice(0, 90)}
            </option>
          ))}
        </Select>
      </Field>
      <div>
        <h3 className="mb-2 text-sm font-medium">Column mapping</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {FIELDS.map((f) => (
            <Field key={f.key} htmlFor={`map-${f.key}`} label={<>{f.label} {f.required && <span className="text-red-700">*</span>} {table.suggestion.ambiguous.includes(f.key) && <Badge tone="amber">ambiguous</Badge>}</>}>
              <Select id={`map-${f.key}`} value={mapping[f.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value === "" ? null : Number(e.target.value) })}>
                <option value="">— not in file —</option>
                {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
              </Select>
            </Field>
          ))}
        </div>
        <p className="mt-2 text-xs text-navy-700">All other columns are kept exactly as they are and appear in your export. INDEX is kept as a reference and is never assumed to be unique.</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={confirmIt} disabled={busy || !preview || preview.issues.some((i) => /required|outside|same column/.test(i))}>Confirm mapping and import rows</Button>
      </div>
      {preview && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="teal">{preview.total} rows</Badge>
            {preview.incomplete > 0 && <Badge tone="red">{preview.incomplete} incomplete</Badge>}
            {preview.duplicates > 0 && <Badge tone="amber">{preview.duplicates} possible duplicates</Badge>}
          </div>
          {preview.issues.length > 0 && <Alert tone={preview.issues.some((i) => /required/.test(i)) ? "error" : "warning"}>{preview.issues.map((i) => <p key={i}>{i}</p>)}</Alert>}
          <div className="max-h-96 overflow-auto rounded-lg border border-navy-100">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-navy-50 text-xs uppercase text-navy-700">
                <tr><th className="px-3 py-2">Source</th>{FIELDS.map((f) => <th key={f.key} className="px-3 py-2">{f.label}</th>)}<th className="px-3 py-2">Notes</th></tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.seq} className="border-t border-navy-100">
                    <td className="px-3 py-1.5 text-xs text-navy-700">{r.sourceRef}</td>
                    {FIELDS.map((f) => <td key={f.key} className={cx("px-3 py-1.5", !r.fields[f.key] && f.required && "bg-red-50")}>{r.fields[f.key] ?? <span className="text-navy-700/50">—</span>}</td>)}
                    <td className="px-3 py-1.5">{r.flags.map((fl) => <Badge key={fl} tone="amber">{flagLabel(fl)}</Badge>)}{r.confidence < 0.9 && <Badge tone="amber">confidence {Math.round(r.confidence * 100)}%</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.total > preview.rows.length && <p className="text-xs text-navy-700">Showing the first {preview.rows.length} rows.</p>}
        </div>
      )}
    </div>
  );
}

function EditRow({ id, row, onDone }: { id: string; row: Row; onDone: () => void }) {
  const [v, setV] = useState({ index: row.index ?? "", district: row.district ?? "", institution: row.institution ?? "", designation: row.designation ?? "", vacancies: row.vacancies ?? "" });
  const [error, setError] = useState<string | null>(null);
  async function save() {
    try {
      await api(`/api/projects/${id}/rows`, { method: "PATCH", json: { optionId: row.id, fields: v } });
      onDone();
    } catch (e) {
      setError(errMsg(e));
    }
  }
  return (
    <div className="space-y-3 rounded-lg bg-navy-50 p-3">
      <p className="text-xs text-navy-700">Original cells: {row.original.map((c) => (c == null ? "—" : String(c))).join(" | ")}</p>
      <div className="grid gap-2 sm:grid-cols-5">
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label} htmlFor={`e-${row.id}-${f.key}`}>
            <Input id={`e-${row.id}-${f.key}`} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
          </Field>
        ))}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-2">
        <Button size="sm" onClick={save}>Save correction</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

function Review({ id }: { id: string }) {
  const [filter, setFilter] = useState<"all" | "flagged" | "incomplete" | "duplicates" | "not_considered">("all");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<RowsResp | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const load = useCallback(() => {
    api<RowsResp>(`/api/projects/${id}/rows?filter=${filter}&q=${encodeURIComponent(q)}&offset=${offset}&limit=50`).then(setData);
  }, [id, filter, q, offset]);
  useEffect(() => {
    load();
  }, [load]);
  async function decide(ids: string[], decision: "consider" | "not_considered") {
    await api(`/api/projects/${id}/rows`, { method: "POST", json: { optionIds: ids, decision } });
    load();
  }
  if (!data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          label="Row filter"
          value={filter}
          onChange={(v) => { setFilter(v); setOffset(0); }}
          items={[
            { value: "all", label: `All (${data.total})` },
            { value: "flagged", label: `Needs review (${data.counts.flagged})` },
            { value: "incomplete", label: `Incomplete (${data.counts.incomplete})` },
            { value: "duplicates", label: `Duplicates (${data.counts.duplicates})` },
            { value: "not_considered", label: `Not considered (${data.counts.notConsidered})` },
          ]}
        />
        <Input aria-label="Search rows" placeholder="Search institution, district, post" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} className="max-w-xs" />
      </div>
      <p className="text-xs text-navy-700">Mark options you do not want to consider. NextPlace never decides eligibility from a job title. Possible duplicates are only flagged — decide for yourself whether to keep both.</p>
      {data.rows.length === 0 ? (
        <Empty title="No rows match this view" />
      ) : (
        <ul className="divide-y divide-navy-100 rounded-lg border border-navy-100 bg-white">
          {data.rows.map((r) => (
            <li key={r.id} className={cx("p-3", r.decision === "not_considered" && "bg-navy-50/60")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-navy-900">
                    <span className="mr-2 text-xs text-navy-700">INDEX {r.index ?? "—"}</span>
                    {r.institution ?? <span className="text-red-700">Institution missing</span>} — {r.designation ?? <span className="text-red-700">Post missing</span>}
                  </p>
                  <p className="text-xs text-navy-700">{r.district ?? "District unknown"} · {r.vacancies ? `${r.vacancies} vacancies` : "vacancies not stated"} · {r.sourceRef}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.flags.map((f) => <Badge key={f} tone={f === "incomplete" ? "red" : f === "manually_corrected" ? "teal" : "amber"}>{flagLabel(f)}</Badge>)}
                    {r.confidence < 0.9 && <Badge tone="amber">Extraction confidence {Math.round(r.confidence * 100)}%</Badge>}
                    {r.decision === "not_considered" && <Badge>Not considered</Badge>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(editing === r.id ? null : r.id)}>Correct</Button>
                  {r.decision === "consider" ? (
                    <Button size="sm" variant="secondary" onClick={() => decide([r.id], "not_considered")}>Don&apos;t consider</Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => decide([r.id], "consider")}>Consider</Button>
                  )}
                </div>
              </div>
              {editing === r.id && <div className="mt-3"><EditRow id={id} row={r} onDone={() => { setEditing(null); load(); }} /></div>}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between text-sm">
        <span className="text-navy-700">{data.filtered === 0 ? 0 : offset + 1}–{Math.min(offset + 50, data.filtered)} of {data.filtered}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</Button>
          <Button size="sm" variant="secondary" disabled={offset + 50 >= data.filtered} onClick={() => setOffset(offset + 50)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

export default function ImportPage() {
  const { id } = useParams<{ id: string }>();
  const { info, reload } = useProject();
  const [state, setState] = useState<ImportState | null>(null);
  const [remap, setRemap] = useState(false);
  const [needUpload, setNeedUpload] = useState(false);
  const load = useCallback(() => api<ImportState>(`/api/projects/${id}/import`).then(setState), [id]);
  useEffect(() => {
    load();
  }, [load]);
  if (!state) return <Spinner />;
  const locked = !!info?.project.previewFrozenAt && !info?.premium;
  const confirmed = !!state.mapping;
  return (
    <StepPage
      projectId={id}
      step="import"
      title="Upload your vacancy list"
      intro="Start with the list you received (Excel, CSV or PDF). We use it to find the posts and hospitals for the next questions."
      problem={needUpload ? { step: "import", message: state.source ? "Confirm the columns (step 2 below) before you continue." : "Upload your vacancy list before you continue." } : null}
      onNext={() => {
        if (!confirmed) {
          setNeedUpload(true);
          requestAnimationFrame(() => document.querySelector("[data-upload]")?.scrollIntoView({ behavior: "smooth", block: "center" }));
          return false;
        }
        return true;
      }}
    >
    <div className="space-y-6">
      <Card className={needUpload && !state.source ? "border-red-300 ring-4 ring-red-50" : undefined} title="1. Upload your list" actions={state.source && <a className="text-sm text-teal-800 underline" href={`/api/projects/${id}/source`}>Download original file</a>}>
        {state.source && (
          <p className="mb-4 text-sm text-navy-800">
            Current file: <strong>{state.source.name}</strong> ({state.source.kind.toUpperCase()}, {Math.round(state.source.sizeBytes / 1024)} KB)
          </p>
        )}
        {state.source?.status === "needs_ocr" && (
          <div className="mb-4">
            <Alert tone="warning" title="This PDF appears to be scanned">
              {state.source.warnings.map((w) => <p key={w}>{w}</p>)}
            </Alert>
          </div>
        )}
        {state.source?.status === "failed" && <div className="mb-4"><Alert tone="error">{state.source.warnings.join(" ")}</Alert></div>}
        {locked ? (
          <Alert tone="info">Your free preview for this project is fixed, so the list can&apos;t be replaced here. Create a new project or unlock full access to upload a different list.</Alert>
        ) : (
          <div data-upload><Upload id={id} hasSource={!!state.source} onDone={() => { load(); reload(); setRemap(true); setNeedUpload(false); }} /></div>
        )}
      </Card>
      {state.source?.status === "parsed" && state.tables.length > 0 && (!state.mapping || remap) && !locked && (
        <Card className={needUpload ? "border-red-300 ring-4 ring-red-50" : undefined} title="2. Confirm the columns">
          <div data-upload><Mapping key={state.source?.id} id={id} state={state} onConfirmed={() => { setRemap(false); setNeedUpload(false); load(); reload(); }} /></div>
        </Card>
      )}
      {state.mapping && (
        <Card
          title="3. Review imported rows"
          actions={
            <div className="flex gap-2">
              {!remap && !locked && <Button size="sm" variant="ghost" onClick={() => setRemap(true)}>Change mapping</Button>}

            </div>
          }
        >
          <Review id={id} />
        </Card>
      )}
    </div>
    </StepPage>
  );
}
