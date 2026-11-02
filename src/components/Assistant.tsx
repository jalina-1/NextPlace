"use client";
import { useEffect, useRef, useState } from "react";
import { api, errMsg } from "@/lib/client/api";
import { Alert, Badge, Button, Textarea } from "./ui";

type Proposal = { id: string; status?: string; preview: unknown };
type Msg = { id: string; role: "user" | "assistant"; content: string; mode: string; proposal: Proposal | null };
type OrderPreview = { type: "order"; summary: { moved: number; newlyExcluded: number; newlyIncluded: number; top: { position: number; previous: number | null; institution: string; designation: string }[] } };
type WeightPreview = { type: "weights"; before: Record<string, { enabled: boolean; weight: number }>; after: Record<string, { enabled: boolean; weight: number }> };

function ProposalCard({ projectId, p, onApplied }: { projectId: string; p: Proposal; onApplied: () => void }) {
  const [status, setStatus] = useState(p.status ?? "pending");
  const [error, setError] = useState<string | null>(null);
  const pv = p.preview as OrderPreview | WeightPreview;
  async function act(action: "apply" | "discard") {
    setError(null);
    try {
      await api(`/api/projects/${projectId}/assistant/proposals/${p.id}`, { method: "POST", json: { action } });
      setStatus(action === "apply" ? "applied" : "discarded");
      if (action === "apply") onApplied();
    } catch (e) {
      setError(errMsg(e));
      if (/changed after/.test(errMsg(e))) setStatus("stale");
    }
  }
  return (
    <div className="mt-2 rounded-lg border border-teal-100 bg-teal-50 p-3 text-sm">
      <p className="font-medium text-navy-900">Proposed change — preview</p>
      {pv.type === "order" ? (
        <>
          <p className="text-xs text-navy-800">{pv.summary.moved} entries move · {pv.summary.newlyExcluded} excluded · {pv.summary.newlyIncluded} re-included. No entries are lost or duplicated.</p>
          <ol className="mt-2 space-y-0.5 text-xs">
            {pv.summary.top.map((t) => (
              <li key={t.position}>
                <span className="tabular font-semibold">{t.position}.</span> {t.institution} — {t.designation}{" "}
                {t.previous && t.previous !== t.position && <span className="text-teal-800">(was {t.previous})</span>}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <table className="mt-2 text-xs">
          <tbody>
            {Object.keys(pv.after).map((k) => (
              <tr key={k}><td className="pr-3">{k}</td><td className="tabular pr-3">{pv.before[k]?.weight ?? 0}%</td><td>→</td><td className="tabular pl-3 font-semibold">{pv.after[k].weight}%</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {error && <div className="mt-2"><Alert tone="error">{error}</Alert></div>}
      {status === "pending" ? (
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => act("apply")}>Apply</Button>
          <Button size="sm" variant="ghost" onClick={() => act("discard")}>Discard</Button>
        </div>
      ) : (
        <Badge tone={status === "applied" ? "green" : "neutral"}>{status}</Badge>
      )}
    </div>
  );
}

export function Assistant({ projectId, onApplied }: { projectId: string; onApplied: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [mode, setMode] = useState<string>("demo");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api<{ mode: string; messages: Msg[] }>(`/api/projects/${projectId}/assistant`).then((r) => {
      setMsgs(r.messages);
      setMode(r.mode);
    });
  }, [projectId]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [msgs]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    const msg = text;
    setText("");
    try {
      const r = await api<{ mode: string; reply: string; proposal: Proposal | null }>(`/api/projects/${projectId}/assistant`, { method: "POST", json: { message: msg } });
      setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "user", content: msg, mode: r.mode, proposal: null }, { id: crypto.randomUUID(), role: "assistant", content: r.reply, mode: r.mode, proposal: r.proposal }]);
    } catch (err) {
      setError(errMsg(err));
      setText(msg);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-navy-900">Assistant</h2>
        {mode === "live" ? <Badge tone="teal">AI (live)</Badge> : mode === "demo" ? <Badge tone="violet">Demo assistant — rule-based, not AI</Badge> : <Badge>Unavailable</Badge>}
      </div>
      <p className="mb-2 text-xs text-navy-700">Explains scores from stored evidence and proposes changes. Nothing changes until you press Apply. It cannot see options you don&apos;t have access to and never guarantees a transfer.</p>
      <div className="min-h-32 flex-1 space-y-3 overflow-y-auto rounded-lg border border-navy-100 bg-navy-50 p-3" aria-live="polite">
        {msgs.length === 0 && <p className="text-xs text-navy-700">Try: “Move options within a three-hour drive closer to the top, while keeping my preferred posts first.”</p>}
        {msgs.map((m) => (
          <div key={m.id} className={m.role === "user" ? "ml-8 rounded-lg bg-white p-2 text-sm" : "mr-8 text-sm"}>
            <p className="whitespace-pre-wrap">{m.content}</p>
            {m.proposal && <ProposalCard projectId={projectId} p={m.proposal} onApplied={onApplied} />}
          </div>
        ))}
        <div ref={end} />
      </div>
      {error && <div className="mt-2"><Alert tone="error">{error}</Alert></div>}
      {mode !== "unavailable" && (
        <form onSubmit={send} className="mt-2 flex gap-2">
          <label htmlFor="ask" className="sr-only">Ask the assistant</label>
          <Textarea id="ask" rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about your options…" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }} />
          <Button type="submit" disabled={busy}>{busy ? "…" : "Send"}</Button>
        </form>
      )}
    </div>
  );
}
