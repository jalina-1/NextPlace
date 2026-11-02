"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession, authPost } from "@/lib/client/session";
import { api, errMsg } from "@/lib/client/api";
import { AccessBanner } from "@/components/AccessBanner";
import { Alert, Button, Card, Field, Input, Spinner } from "@/components/ui";
import { formatColombo } from "@/lib/dates";

export default function AccountPage() {
  const { me } = useSession();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const loadProjects = () => api<{ projects: { id: string; name: string }[] }>("/api/projects").then((r) => setProjects(r.projects)).catch(() => {});
  useEffect(() => {
    loadProjects();
  }, []);
  if (me?.session !== "active") return <div className="mx-auto max-w-3xl px-4 py-8"><Spinner /></div>;
  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    try {
      await authPost("change-password", { currentPassword: cur, newPassword: next, revokeOtherSessions: true });
      setMsg({ tone: "success", text: "Password changed." });
      setCur("");
      setNext("");
    } catch (err) {
      setMsg({ tone: "error", text: errMsg(err) });
    }
  }
  async function deleteAccount() {
    try {
      await api("/api/account", { method: "DELETE" });
      location.href = "/";
    } catch (err) {
      setMsg({ tone: "error", text: errMsg(err) });
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold text-navy-900">Account & privacy</h1>
      <AccessBanner />
      <Card title="Profile">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-navy-700">Name</dt><dd>{me.user.name}</dd></div>
          <div><dt className="text-navy-700">Email</dt><dd>{me.user.email}</dd></div>
          <div><dt className="text-navy-700">Access</dt><dd>{me.access.premium ? `Full access until ${formatColombo(me.access.activeUntil)}` : "Free preview"}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-navy-700">Only one active session is allowed. Signing in elsewhere signs you out here. <Link className="underline" href="/payment">Payments</Link></p>
      </Card>
      <Card title="Change password">
        <form onSubmit={changePw} className="grid gap-3 sm:grid-cols-2">
          <Field label="Current password" htmlFor="cur"><Input id="cur" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
          <Field label="New password" htmlFor="new" hint="At least 10 characters."><Input id="new" type="password" autoComplete="new-password" minLength={10} required value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          <div className="sm:col-span-2"><Button type="submit">Change password</Button></div>
        </form>
      </Card>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Card title="Your projects">
        {projects.length === 0 ? (
          <p className="text-sm text-navy-700">No projects.</p>
        ) : (
          <ul className="divide-y divide-navy-100">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{p.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-700"
                  onClick={async () => {
                    if (!confirm(`Delete “${p.name}”, its uploaded file, analysis and final lists? This cannot be undone.`)) return;
                    await api(`/api/projects/${p.id}`, { method: "DELETE" });
                    loadProjects();
                  }}
                >
                  Delete project
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Data & deletion">
        <p className="text-sm text-navy-800">You can delete any project from its page. Deleting your account permanently removes all projects, uploaded lists, receipts, payment records and access periods. See <Link className="underline" href="/privacy">privacy & retention</Link>.</p>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <Field label='Type "DELETE" to confirm' htmlFor="del"><Input id="del" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></Field>
          <Button variant="danger" disabled={confirmText !== "DELETE"} onClick={deleteAccount}>Delete my account</Button>
        </div>
      </Card>
    </div>
  );
}
