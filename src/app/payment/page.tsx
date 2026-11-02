"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errMsg } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import { AccessBanner } from "@/components/AccessBanner";
import { Alert, Badge, Button, Card, Empty, Field, Input, Select, Spinner, Textarea } from "@/components/ui";
import { formatColombo } from "@/lib/dates";

type Bank = { configured: boolean; bankName?: string; branch?: string; accountName?: string; accountNumber?: string; instructions?: string };
type Pay = { id: string; method: string; amountLkr: number; reference: string | null; paidOn: string | null; status: string; adminNote: string | null; createdAt: string; reviewedAt: string | null };
type Resp = { eligible: boolean; price: { amountLkr: number; months: number } | null; bank: Bank; access: { premium: boolean; activeUntil: string | null; pendingPayment: boolean }; payments: Pay[] };

const TONE: Record<string, "amber" | "green" | "red"> = { pending: "amber", approved: "green", rejected: "red" };

export default function PaymentPage() {
  const { refresh } = useSession();
  const [d, setD] = useState<Resp | null>(null);
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const load = useCallback(() => api<Resp>("/api/payments").then(setD), []);
  useEffect(() => {
    load();
  }, [load]);
  if (!d) return <div className="mx-auto max-w-3xl px-4 py-8"><Spinner /></div>;
  if (!d.eligible)
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Empty title="See your free results first">Set your preferences, upload your list and run the analysis to see your free top three. Full-access details are shown after that. <Link className="underline" href="/dashboard">Go to dashboard</Link></Empty>
      </div>
    );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setMsg({ tone: "error", text: "Attach a photo or PDF of your receipt." });
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("method", method);
    fd.append("reference", reference);
    fd.append("paidOn", paidOn);
    fd.append("note", note);
    fd.append("receipt", file);
    try {
      await api("/api/payments", { method: "POST", body: fd });
      setMsg({ tone: "success", text: "Receipt received. An administrator will review it; access starts only after approval." });
      setFile(null);
      setReference("");
      setNote("");
      await load();
      await refresh();
    } catch (err) {
      setMsg({ tone: "error", text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }
  const price = d.price!;
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold text-navy-900">Unlock full access</h1>
      <AccessBanner />
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-navy-700">One-time manual payment</p>
            <p className="text-3xl font-semibold text-navy-950 tabular">LKR {price.amountLkr.toLocaleString("en-LK")}</p>
            <p className="text-sm text-navy-800">for {price.months === 12 ? "one year" : `${price.months} months`} of full access from the time your payment is approved (calendar months, Asia/Colombo time). It does not renew automatically. If you renew while access is active, the new period starts when the current one ends.</p>
          </div>
          <ul className="text-sm text-navy-800">
            <li>✓ Complete analyzed ranking</li>
            <li>✓ Larger comparisons</li>
            <li>✓ Final-list editor with assistant</li>
            <li>✓ Excel export</li>
          </ul>
        </div>
      </Card>
      <Card title="1. Pay by bank transfer or ATM deposit">
        {d.bank.configured ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-navy-700">Bank</dt><dd className="font-medium">{d.bank.bankName}</dd></div>
            <div><dt className="text-navy-700">Branch</dt><dd className="font-medium">{d.bank.branch || "—"}</dd></div>
            <div><dt className="text-navy-700">Account name</dt><dd className="font-medium">{d.bank.accountName}</dd></div>
            <div><dt className="text-navy-700">Account number</dt><dd className="font-medium tabular">{d.bank.accountNumber}</dd></div>
            {d.bank.instructions && <div className="sm:col-span-2"><dt className="text-navy-700">Instructions</dt><dd className="whitespace-pre-wrap">{d.bank.instructions}</dd></div>}
          </dl>
        ) : (
          <Alert tone="warning" title="Payment details are not available yet">The administrator has not configured bank details. Please check back later — do not send money to any account not shown here.</Alert>
        )}
      </Card>
      {d.bank.configured && (
        <Card title="2. Upload your receipt">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Payment method" htmlFor="method">
              <Select id="method" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="bank_transfer">Bank transfer</option>
                <option value="atm_deposit">ATM / cash deposit</option>
              </Select>
            </Field>
            <Field label="Date paid" htmlFor="paid"><Input id="paid" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></Field>
            <Field label="Reference / transaction number (optional)" htmlFor="ref"><Input id="ref" maxLength={80} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
            <Field label="Receipt (JPG, PNG, WEBP or PDF, max 8 MB)" htmlFor="rcpt"><Input id="rcpt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
            <div className="sm:col-span-2"><Field label="Note for the reviewer (optional)" htmlFor="note"><Textarea id="note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
            {msg && <div className="sm:col-span-2"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
            <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Uploading…" : "Submit receipt for review"}</Button></div>
          </form>
          <p className="mt-3 text-xs text-navy-700">Receipts are stored privately and seen only by you and the administrators who review payments. Uploading a receipt does not grant access by itself.</p>
        </Card>
      )}
      <Card title="Your payments">
        {d.payments.length === 0 ? <p className="text-sm text-navy-700">No payments yet.</p> : (
          <ul className="divide-y divide-navy-100">
            {d.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{formatColombo(p.createdAt)} · {p.method === "atm_deposit" ? "ATM deposit" : "Bank transfer"} · LKR {p.amountLkr.toLocaleString("en-LK")}{p.reference ? ` · ${p.reference}` : ""}</span>
                <span className="flex items-center gap-2">
                  <Badge tone={TONE[p.status]}>{p.status}</Badge>
                  {p.adminNote && p.status === "rejected" && <span className="text-xs text-red-800">{p.adminNote}</span>}
                  <a className="text-xs underline" href={`/api/payments/${p.id}/receipt`} target="_blank" rel="noreferrer">receipt</a>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
