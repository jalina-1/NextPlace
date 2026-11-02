"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errMsg } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import { Alert, Badge, Button, Card, Field, Input, Select, Spinner, Tabs, Textarea } from "@/components/ui";
import { formatColombo } from "@/lib/dates";

type Payment = { id: string; email: string; name: string; method: string; amountLkr: number; reference: string | null; paidOn: string | null; status: string; userNote: string | null; adminNote: string | null; receiptMime: string; createdAt: string; reviewedAt: string | null; accessUntil: string | null };
type Grant = { id: string; email: string; startsAt: string; endsAt: string; months: number; paymentId: string | null; createdAt: string };
type Settings = {
  priceLkr: number;
  accessMonths: number;
  bank: { configured: boolean; bankName: string; branch: string; accountName: string; accountNumber: string; instructions: string };
  quotas: Record<string, number>;
  jobs: { concurrency: number; maxAttempts: number };
};

function Payments() {
  const [status, setStatus] = useState("pending");
  const [data, setData] = useState<{ payments: Payment[]; grants: Grant[] } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => api<{ payments: Payment[]; grants: Grant[] }>(`/api/admin/payments?status=${status}`).then(setData), [status]);
  useEffect(() => {
    load();
  }, [load]);
  async function act(id: string, action: "approve" | "reject" | "note") {
    setMsg(null);
    if (action === "approve" && !confirm("Approve this payment and grant access? Verify the amount and the deposit in the bank account first.")) return;
    try {
      const r = await api<{ alreadyApproved?: boolean }>(`/api/admin/payments/${id}`, { method: "POST", json: { action, note: notes[id] } });
      setMsg(r.alreadyApproved ? "This payment was already approved; no additional access was granted." : `Done: ${action}.`);
      load();
    } catch (e) {
      setMsg(errMsg(e));
    }
  }
  if (!data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label htmlFor="pstatus" className="text-sm">Status</label>
        <Select id="pstatus" className="w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </Select>
      </div>
      {msg && <Alert>{msg}</Alert>}
      {data.payments.length === 0 ? <p className="text-sm text-navy-700">No payments.</p> : (
        <ul className="space-y-3">
          {data.payments.map((p) => (
            <li key={p.id} className="rounded-lg border border-navy-100 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="text-sm">
                  <p className="font-medium">{p.name} &lt;{p.email}&gt;</p>
                  <p className="text-navy-700">{p.method === "atm_deposit" ? "ATM deposit" : "Bank transfer"} · LKR {p.amountLkr.toLocaleString("en-LK")} · paid {p.paidOn ?? "date not given"} · ref {p.reference ?? "—"}</p>
                  <p className="text-xs text-navy-700">Submitted {formatColombo(p.createdAt)}{p.reviewedAt ? ` · reviewed ${formatColombo(p.reviewedAt)}` : ""} · current access until {p.accessUntil ? formatColombo(p.accessUntil) : "none"}</p>
                  {p.userNote && <p className="mt-1 text-xs">User note: {p.userNote}</p>}
                </div>
                <Badge tone={p.status === "approved" ? "green" : p.status === "rejected" ? "red" : "amber"}>{p.status}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "Hide receipt" : "View receipt"}</Button>
                <a className="text-xs underline" href={`/api/payments/${p.id}/receipt`} target="_blank" rel="noreferrer">open in new tab</a>
              </div>
              {open === p.id && (
                <div className="mt-2 overflow-hidden rounded border border-navy-100">
                  {p.receiptMime === "application/pdf" ? (
                    <iframe title="Receipt" src={`/api/payments/${p.id}/receipt`} className="h-96 w-full" sandbox="" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="Payment receipt" src={`/api/payments/${p.id}/receipt`} className="max-h-[32rem] w-auto" />
                  )}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="min-w-64 flex-1">
                  <Textarea aria-label="Admin note" rows={1} placeholder={p.adminNote ?? "Note (shown to the user if rejected)"} value={notes[p.id] ?? ""} onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })} />
                </div>
                {p.status === "pending" && (
                  <>
                    <Button size="sm" onClick={() => act(p.id, "approve")}>Approve</Button>
                    <Button size="sm" variant="danger" onClick={() => act(p.id, "reject")}>Reject</Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={() => act(p.id, "note")}>Save note</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Card title="Access periods">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-navy-700"><tr><th className="py-1">User</th><th>Starts</th><th>Ends</th><th>Months</th><th>Payment</th></tr></thead>
            <tbody>{data.grants.map((g) => <tr key={g.id} className="border-t border-navy-100"><td className="py-1">{g.email}</td><td>{formatColombo(g.startsAt)}</td><td>{formatColombo(g.endsAt)}</td><td>{g.months}</td><td className="text-xs">{g.paymentId?.slice(0, 8) ?? "manual"}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SettingsPanel() {
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  useEffect(() => {
    api<{ settings: Settings }>("/api/admin/settings").then((r) => setS(r.settings));
  }, []);
  if (!s) return <Spinner />;
  async function save() {
    try {
      const r = await api<{ settings: Settings }>("/api/admin/settings", { method: "PUT", json: s });
      setS(r.settings);
      setMsg({ tone: "success", text: "Settings saved." });
    } catch (e) {
      setMsg({ tone: "error", text: errMsg(e) });
    }
  }
  const num = (v: string) => Number(v || 0);
  return (
    <div className="space-y-4">
      <Card title="Price & access period">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Price (LKR)" htmlFor="price"><Input id="price" type="number" value={s.priceLkr} onChange={(e) => setS({ ...s, priceLkr: num(e.target.value) })} /></Field>
          <Field label="Access period (calendar months)" htmlFor="months"><Input id="months" type="number" min={1} max={36} value={s.accessMonths} onChange={(e) => setS({ ...s, accessMonths: num(e.target.value) })} /></Field>
        </div>
      </Card>
      <Card title="Bank instructions">
        <p className="mb-3 text-xs text-navy-700">Shown to users only on the payment step. Payments cannot be submitted until bank name, account name and account number are filled in.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["bankName", "branch", "accountName", "accountNumber"] as const).map((k) => (
            <Field key={k} label={k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())} htmlFor={k}><Input id={k} value={s.bank[k]} onChange={(e) => setS({ ...s, bank: { ...s.bank, [k]: e.target.value } })} /></Field>
          ))}
          <div className="sm:col-span-2"><Field label="Additional instructions" htmlFor="instr"><Textarea id="instr" rows={3} value={s.bank.instructions} onChange={(e) => setS({ ...s, bank: { ...s.bank, instructions: e.target.value } })} /></Field></div>
        </div>
      </Card>
      <Card title="Quotas & analysis limits">
        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(s.quotas).map(([k, v]) => (
            <Field key={k} label={k.replace(/([A-Z])/g, " $1").toLowerCase()} htmlFor={k}><Input id={k} type="number" value={v} onChange={(e) => setS({ ...s, quotas: { ...s.quotas, [k]: num(e.target.value) } })} /></Field>
          ))}
          <Field label="worker concurrency" htmlFor="conc"><Input id="conc" type="number" value={s.jobs.concurrency} onChange={(e) => setS({ ...s, jobs: { ...s.jobs, concurrency: num(e.target.value) } })} /></Field>
          <Field label="max attempts per job" htmlFor="att"><Input id="att" type="number" value={s.jobs.maxAttempts} onChange={(e) => setS({ ...s, jobs: { ...s.jobs, maxAttempts: num(e.target.value) } })} /></Field>
        </div>
      </Card>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Button onClick={save}>Save settings</Button>
    </div>
  );
}

function Jobs() {
  const [jobs, setJobs] = useState<{ id: string; type: string; projectId: string | null; attempts: number; lastError: string | null; updatedAt: string }[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api<{ jobs: typeof jobs }>("/api/admin/jobs").then((r) => setJobs(r.jobs));
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button variant="secondary" onClick={async () => { const r = await api<{ processed: number }>("/api/admin/jobs", { method: "POST", json: { action: "run" } }); setMsg(`Processed ${r.processed} queued job(s).`); load(); }}>Run worker now</Button>
      </div>
      {msg && <Alert>{msg}</Alert>}
      {!jobs ? <Spinner /> : jobs.length === 0 ? <p className="text-sm text-navy-700">No failed jobs.</p> : (
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-navy-100 bg-white p-2 text-sm">
              <span><Badge tone="red">{j.type}</Badge> {j.lastError} <span className="text-xs text-navy-700">· {j.attempts} attempts · {formatColombo(j.updatedAt)}</span></span>
              <Button size="sm" variant="secondary" onClick={async () => { await api("/api/admin/jobs", { method: "POST", json: { action: "retry", jobId: j.id } }); load(); }}>Retry</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Overview() {
  const [d, setD] = useState<{ counts: Record<string, number>; health: { database: { ok: boolean; detail: string }; storage: { ok: boolean; detail: string }; providers: { capability: string; provider: string; configured: boolean; demo?: boolean }[] } } | null>(null);
  useEffect(() => {
    api<typeof d>("/api/admin/overview").then(setD);
  }, []);
  if (!d) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Object.entries(d.counts).map(([k, v]) => (
          <div key={k} className="rounded-lg bg-white p-3 ring-1 ring-navy-100"><p className="text-xs text-navy-700">{k.replace(/_/g, " ")}</p><p className="text-2xl font-semibold tabular">{v}</p></div>
        ))}
      </div>
      <Card title="Connections">
        <ul className="space-y-1 text-sm">
          <li><Badge tone={d.health.database.ok ? "green" : "red"}>{d.health.database.ok ? "OK" : "Error"}</Badge> Database — {d.health.database.detail}</li>
          <li><Badge tone={d.health.storage.ok ? "green" : "red"}>{d.health.storage.ok ? "OK" : "Error"}</Badge> Private storage — {d.health.storage.detail}</li>
        </ul>
      </Card>
      <Card title="Provider configuration (secrets are never shown)">
        <table className="w-full text-left text-sm">
          <tbody>
            {d.health.providers.map((p) => (
              <tr key={p.capability} className="border-t border-navy-100"><td className="py-1.5">{p.capability}</td><td>{p.provider}</td><td>{p.demo ? <Badge tone="violet">demo</Badge> : p.configured ? <Badge tone="green">configured</Badge> : <Badge tone="amber">not configured</Badge>}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function AuditPanel() {
  const [d, setD] = useState<{ events: { id: string; action: string; actor: string | null; targetType: string | null; targetId: string | null; data: unknown; createdAt: string }[]; outbox: { id: string; to: string; subject: string; body: string; status: string; createdAt: string }[] } | null>(null);
  useEffect(() => {
    api<typeof d>("/api/admin/audit").then(setD);
  }, []);
  if (!d) return <Spinner />;
  return (
    <div className="space-y-4">
      <Card title="Audit history">
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-white text-navy-700"><tr><th className="py-1">Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
            <tbody>{d.events.map((e) => <tr key={e.id} className="border-t border-navy-100 align-top"><td className="py-1 whitespace-nowrap">{formatColombo(e.createdAt)}</td><td>{e.actor ?? "—"}</td><td>{e.action}</td><td>{e.targetType}:{e.targetId?.slice(0, 8)}</td><td className="font-mono">{e.data ? JSON.stringify(e.data).slice(0, 120) : ""}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>
      <Card title="Email outbox (used when no email provider is configured)">
        <ul className="space-y-2 text-xs">{d.outbox.map((m) => <li key={m.id} className="rounded bg-navy-50 p-2"><p className="font-medium">{m.subject} → {m.to} · {m.status} · {formatColombo(m.createdAt)}</p><pre className="whitespace-pre-wrap">{m.body}</pre></li>)}</ul>
      </Card>
    </div>
  );
}

export default function AdminPage() {
  const { me } = useSession();
  const [tab, setTab] = useState<"overview" | "payments" | "settings" | "jobs" | "audit">("payments");
  if (!me) return <div className="mx-auto max-w-6xl px-4 py-8"><Spinner /></div>;
  if (me.session !== "active" || me.user.role !== "admin") return <div className="mx-auto max-w-6xl px-4 py-8"><Alert tone="error">Administrators only.</Alert></div>;
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <h1 className="text-2xl font-semibold text-navy-900">Admin</h1>
      <Tabs label="Admin sections" value={tab} onChange={setTab} items={[{ value: "payments", label: "Payments & access" }, { value: "overview", label: "Overview & providers" }, { value: "settings", label: "Settings" }, { value: "jobs", label: "Failed jobs" }, { value: "audit", label: "Audit" }]} />
      {tab === "payments" && <Payments />}
      {tab === "overview" && <Overview />}
      {tab === "settings" && <SettingsPanel />}
      {tab === "jobs" && <Jobs />}
      {tab === "audit" && <AuditPanel />}
    </div>
  );
}
