"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Download, Search } from "lucide-react";
import { api, errMsg } from "@/lib/client/api";
import { Alert, Badge, Button, Card, Field, Input, NumberInput, Select, Spinner, Textarea } from "@/components/ui";
import { formatColombo } from "@/lib/dates";

type Row = { id: string; name: string; email: string; emailVerified: boolean; role: string; status: string; createdAt: string; accessUntil: string | null; projects: number; pendingPayments: number; paidLkr: number; lastSignIn: string | null };
type Detail = {
  user: { id: string; name: string; email: string; emailVerified: boolean; role: string; status: string; suspendedReason: string | null; createdAt: string };
  accessUntil: string | null;
  sessions: { id: string; createdAt: string; expiresAt: string; ipAddress: string | null; userAgent: string | null }[];
  projects: { id: string; name: string; status: string; createdAt: string; options: number }[];
  payments: { id: string; method: string; amountLkr: number; reference: string | null; paidOn: string | null; status: string; adminNote: string | null; createdAt: string }[];
  grants: { id: string; startsAt: string; endsAt: string; months: number; paymentId: string | null; note: string | null; revokedAt: string | null; revokeReason: string | null }[];
  notes: { id: string; body: string; createdAt: string; author: string | null }[];
  events: { id: string; action: string; data: unknown; createdAt: string }[];
};

const FILTERS = [
  ["all", "Everyone"],
  ["paid", "Paid access"],
  ["free", "No paid access"],
  ["pending", "Payment waiting"],
  ["unverified", "Not verified"],
  ["suspended", "Suspended"],
  ["admins", "Administrators"],
] as const;

const lkr = (n: number) => `LKR ${n.toLocaleString("en-LK")}`;
const day = (d: string | null) => (d ? formatColombo(d) : "—");

function StatusBadges({ u, accessUntil }: { u: { emailVerified: boolean; role: string; status: string }; accessUntil: string | null }) {
  return (
    <span className="flex flex-wrap gap-1">
      {u.role === "admin" && <Badge tone="violet">Admin</Badge>}
      {u.status === "suspended" ? <Badge tone="red">Suspended</Badge> : accessUntil ? <Badge tone="green">Paid</Badge> : <Badge>Free</Badge>}
      {u.emailVerified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Not verified</Badge>}
    </span>
  );
}

export function Users() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ users: Row[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const query = `q=${encodeURIComponent(q)}&filter=${filter}`;

  const load = useCallback(() => {
    setError(null);
    return api<{ users: Row[]; total: number; pageSize: number }>(`/api/admin/users?${query}&page=${page}`).then(setData).catch((e) => setError(errMsg(e)));
  }, [query, page]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  if (openId) return <UserDetail id={openId} onBack={() => { setOpenId(null); load(); }} />;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="relative block min-w-64 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-700" aria-hidden />
          <Input aria-label="Search users" placeholder="Search by name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="pl-9" />
        </label>
        <Select aria-label="Filter users" className="w-48" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}>
          {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
        <a href={`/api/admin/users/export?${query}`} className="inline-flex items-center gap-1.5 rounded-xl border border-navy-100 bg-white px-3 py-2 text-sm font-medium text-navy-900 hover:bg-navy-50">
          <Download size={15} aria-hidden /> Download CSV
        </a>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {!data ? <Spinner /> : (
        <>
          <p className="text-sm text-navy-700">{data.total} user{data.total === 1 ? "" : "s"}</p>
          <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-navy-100">
            <table className="w-full text-left text-sm">
              <thead className="bg-navy-50 text-xs text-navy-700">
                <tr><th className="px-3 py-2">User</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Access until</th><th className="px-3 py-2">Paid</th><th className="px-3 py-2">Projects</th><th className="px-3 py-2">Joined</th><th className="px-3 py-2">Last sign-in</th></tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="cursor-pointer border-t border-navy-100 hover:bg-teal-50" onClick={() => setOpenId(u.id)}>
                    <td className="px-3 py-2">
                      <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); setOpenId(u.id); }}>
                        <span className="block font-medium text-navy-950">{u.name}</span>
                        <span className="text-xs text-navy-700">{u.email}</span>
                      </button>
                    </td>
                    <td className="px-3 py-2"><StatusBadges u={u} accessUntil={u.accessUntil} />{u.pendingPayments > 0 && <span className="mt-1 block"><Badge tone="amber">Payment waiting</Badge></span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{day(u.accessUntil)}</td>
                    <td className="px-3 py-2 whitespace-nowrap tabular">{u.paidLkr ? lkr(u.paidLkr) : "—"}</td>
                    <td className="px-3 py-2 tabular">{u.projects}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{day(u.createdAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{day(u.lastSignIn)}</td>
                  </tr>
                ))}
                {data.users.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-navy-700">No users match.</td></tr>}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center gap-3 text-sm">
              <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Back</Button>
              <span>Page {page + 1} of {pages}</span>
              <Button size="sm" variant="secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function UserDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [months, setMonths] = useState(12);
  const [grantNote, setGrantNote] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");

  const load = useCallback(() => api<Detail>(`/api/admin/users/${id}`).then(setD).catch((e) => setMsg({ tone: "error", text: errMsg(e) })), [id]);
  useEffect(() => {
    load();
  }, [load]);

  async function act(body: Record<string, unknown>, done: string, ask?: string) {
    if (ask && !confirm(ask)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ deleted?: boolean }>(`/api/admin/users/${id}`, { method: "POST", json: body });
      setPassword("");
      if (r.deleted) return onBack();
      setReason("");
      setMsg({ tone: "success", text: done });
      await load();
    } catch (e) {
      setMsg({ tone: "error", text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <div className="space-y-3"><BackButton onBack={onBack} />{msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : <Spinner />}</div>;
  const u = d.user;
  const suspended = u.status === "suspended";
  const isAdmin = u.role === "admin";
  const now = Date.now();
  return (
    <div className="space-y-4">
      <BackButton onBack={onBack} />
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-navy-100">
        <div>
          <h2 className="font-display text-xl font-semibold text-navy-950">{u.name}</h2>
          <p className="text-sm text-navy-700">{u.email}</p>
          <p className="mt-1 text-xs text-navy-700">Joined {day(u.createdAt)} · Paid access until {d.accessUntil ? day(d.accessUntil) : "none"}</p>
          {suspended && <p className="mt-1 text-sm text-red-700">Suspended: {u.suspendedReason}</p>}
        </div>
        <StatusBadges u={u} accessUntil={d.accessUntil} />
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Account">
          <div className="flex flex-wrap gap-2">
            {u.emailVerified
              ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => act({ action: "unverify" }, "Marked as not verified.")}>Remove verification</Button>
              : <Button size="sm" disabled={busy} onClick={() => act({ action: "verify" }, "Account verified.")}>Verify account</Button>}
            <Button size="sm" variant="secondary" disabled={busy || d.sessions.length === 0} onClick={() => act({ action: "sign_out" }, "Signed out everywhere.", "Sign this user out on all devices?")}>Sign out everywhere</Button>
            {suspended && <Button size="sm" disabled={busy} onClick={() => act({ action: "unsuspend" }, "Suspension lifted.")}>Lift suspension</Button>}
          </div>
          {!suspended && !isAdmin && (
            <div className="mt-4 border-t border-navy-100 pt-3">
              <Field label="Suspend this account" hint="The user is signed out and cannot sign in until you lift it." htmlFor="susp">
                <Input id="susp" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Button className="mt-2" size="sm" variant="danger" disabled={busy || !reason.trim()} onClick={() => act({ action: "suspend", reason }, "Account suspended.", `Suspend ${u.email}?`)}>Suspend</Button>
            </div>
          )}
        </Card>

        <Card title="Paid access">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Months" htmlFor="gm"><NumberInput id="gm" integer min={1} max={36} value={months} onValue={setMonths} className="w-24" /></Field>
            <div className="min-w-48 flex-1"><Field label="Note (optional)" htmlFor="gn"><Input id="gn" value={grantNote} onChange={(e) => setGrantNote(e.target.value)} placeholder="e.g. paid in cash" /></Field></div>
            <Button size="sm" disabled={busy} onClick={() => act({ action: "grant", months, note: grantNote || undefined }, `Gave ${months} month(s) of access.`, `Give ${u.email} ${months} month(s) of paid access without a payment?`)}>Give access</Button>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {d.grants.length === 0 && <li className="text-navy-700">No access periods yet.</li>}
            {d.grants.map((g) => {
              const live = !g.revokedAt && new Date(g.endsAt).getTime() > now;
              return (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy-50 px-3 py-2">
                  <span>
                    {day(g.startsAt)} → {day(g.endsAt)} · {g.months} mo · {g.paymentId ? "payment" : "manual"}
                    {g.note && <span className="block text-xs text-navy-700">{g.note}</span>}
                    {g.revokedAt && <span className="block text-xs text-red-700">Removed {day(g.revokedAt)}: {g.revokeReason}</span>}
                  </span>
                  {g.revokedAt ? <Badge tone="red">Removed</Badge> : live ? (
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => { const r = prompt("Why are you removing this access? (required)"); if (r?.trim()) act({ action: "revoke_grant", grantId: g.id, reason: r }, "Access removed."); }}>Remove</Button>
                  ) : <Badge>Ended</Badge>}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Private notes" >
          <p className="mb-2 text-xs text-navy-700">Only administrators can see these.</p>
          <Textarea aria-label="New note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write a note about this user" />
          <Button className="mt-2" size="sm" disabled={busy || !note.trim()} onClick={async () => { await act({ action: "note", body: note }, "Note saved."); setNote(""); }}>Add note</Button>
          <ul className="mt-3 space-y-2 text-sm">
            {d.notes.map((n) => <li key={n.id} className="rounded-lg bg-navy-50 px-3 py-2"><p className="whitespace-pre-wrap">{n.body}</p><p className="mt-1 text-xs text-navy-700">{n.author ?? "deleted admin"} · {day(n.createdAt)}</p></li>)}
          </ul>
        </Card>

        <Card title="Payments">
          {d.payments.length === 0 ? <p className="text-sm text-navy-700">No payments.</p> : (
            <ul className="space-y-2 text-sm">
              {d.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-navy-50 px-3 py-2">
                  <span>{lkr(p.amountLkr)} · {p.method === "atm_deposit" ? "ATM deposit" : "Bank transfer"} · ref {p.reference ?? "—"}<span className="block text-xs text-navy-700">Sent {day(p.createdAt)}{p.adminNote ? ` · ${p.adminNote}` : ""}</span></span>
                  <span className="flex items-center gap-2">
                    <a className="text-xs underline" href={`/api/payments/${p.id}/receipt`} target="_blank" rel="noreferrer">receipt</a>
                    <Badge tone={p.status === "approved" ? "green" : p.status === "rejected" ? "red" : "amber"}>{p.status}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-navy-700">Approve or reject waiting payments in the Payments tab.</p>
        </Card>

        <Card title="Projects">
          {d.projects.length === 0 ? <p className="text-sm text-navy-700">No projects.</p> : (
            <ul className="space-y-1 text-sm">{d.projects.map((p) => <li key={p.id} className="flex justify-between gap-2 border-t border-navy-100 py-1.5 first:border-0"><span>{p.name}</span><span className="text-xs text-navy-700">{p.options} options · {p.status} · {day(p.createdAt)}</span></li>)}</ul>
          )}
        </Card>

        <Card title="Signed-in devices">
          {d.sessions.length === 0 ? <p className="text-sm text-navy-700">Not signed in anywhere.</p> : (
            <ul className="space-y-1 text-xs">{d.sessions.map((s) => <li key={s.id} className="rounded bg-navy-50 px-2 py-1.5">Since {day(s.createdAt)} · IP {s.ipAddress || "unknown"}<span className="block truncate text-navy-700">{s.userAgent || "unknown device"}</span></li>)}</ul>
          )}
        </Card>
      </div>

      <Card title="History">
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left text-xs">
            <tbody>{d.events.map((e) => <tr key={e.id} className="border-t border-navy-100 align-top"><td className="py-1 pr-3 whitespace-nowrap">{day(e.createdAt)}</td><td className="pr-3">{e.action}</td><td className="font-mono text-navy-700">{e.data ? JSON.stringify(e.data).slice(0, 140) : ""}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>

      <Card title="Danger zone">
        <p className="mb-3 text-sm text-navy-700">These need your own password again. They cannot be used on your own account.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Your password" htmlFor="apw"><Input id="apw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {!isAdmin && <Field label={`To delete, type ${u.email}`} htmlFor="cem"><Input id="cem" value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} autoComplete="off" /></Field>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {isAdmin
            ? <Button size="sm" variant="danger" disabled={busy || !password} onClick={() => act({ action: "set_role", role: "user", password }, "Administrator role removed.", `Remove the administrator role from ${u.email}?`)}>Remove administrator role</Button>
            : <Button size="sm" variant="secondary" disabled={busy || !password || suspended} onClick={() => act({ action: "set_role", role: "admin", password }, "This user is now an administrator.", `Make ${u.email} an administrator? They will be able to do everything you can.`)}>Make administrator</Button>}
          {!isAdmin && <Button size="sm" variant="danger" disabled={busy || !password || confirmEmail.trim().toLowerCase() !== u.email.toLowerCase()} onClick={() => act({ action: "delete", confirmEmail, password }, "Deleted.", `Permanently delete ${u.email} with all projects, files and receipts? This cannot be undone.`)}>Delete account</Button>}
        </div>
      </Card>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-800 hover:underline"><ArrowLeft size={16} aria-hidden /> All users</button>;
}
