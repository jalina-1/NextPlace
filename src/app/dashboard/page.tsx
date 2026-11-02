"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Compass, ListOrdered, Plus, ShieldCheck } from "lucide-react";
import { api, errMsg } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import { AccessBanner } from "@/components/AccessBanner";
import { Alert, Badge, Button, DemoBadge, Input, Spinner } from "@/components/ui";
import { formatColombo } from "@/lib/dates";

type P = { id: string; name: string; status: string; isDemo: boolean; updatedAt: string; previewFrozenAt: string | null; optionCount: number; run: { status: string; doneTasks: number; totalTasks: number } | null; finalStatus: string | null };

const STATUS: Record<string, string> = { draft: "Upload your list", uploaded: "Confirm columns", mapped: "Answer questions", analyzing: "Analysing", analyzed: "Results ready" };

export default function Dashboard() {
  const { me } = useSession();
  const [projects, setProjects] = useState<P[] | null>(null);
  const [name, setName] = useState("");
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ projects: P[] }>("/api/projects")
      .then((r) => setProjects(r.projects))
      .catch((e) => setError(errMsg(e)));
  }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/projects", { method: "POST", json: { name: demo ? `${name || "Demo list"} (synthetic)` : name || "My transfer list" } });
      if (demo) {
        const csv = await fetch("/demo/demo-vacancies.csv").then((r) => r.blob());
        const fd = new FormData();
        fd.append("file", new File([csv], "demo-vacancies.csv", { type: "text/csv" }));
        await api(`/api/projects/${id}/import`, { method: "POST", body: fd });
      }
      location.href = `/projects/${id}/import`;
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }
  const user = me?.session === "active" ? me : null;
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-8">
      <div>
        <p className="eyebrow">Your next move</p>
        <h1 className="mt-2 text-3xl font-extrabold text-navy-950 sm:text-4xl">A little clarity goes a long way.</h1>
        <p className="mt-2 text-navy-700">Keep your options organised. Build a list that reflects what matters to you.</p>
      </div>
      <AccessBanner />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-navy-100 bg-white p-6">
          <p className="text-sm text-navy-700">Saved projects</p>
          <p className="font-display mt-2 text-4xl font-extrabold text-navy-950">{projects ? String(projects.length).padStart(2, "0") : "—"}</p>
          <p className="mt-1 text-sm text-navy-700">Your lists, all in one place</p>
        </div>
        <div className="rounded-2xl border border-navy-100 bg-white p-6">
          <p className="text-sm text-navy-700">Access</p>
          <p className="font-display mt-2 text-3xl font-extrabold text-navy-950">{user?.access.premium ? "Full access" : "Free preview"}</p>
          <p className="mt-1 text-sm text-navy-700">{user?.access.premium ? `Until ${formatColombo(user.access.activeUntil, false)}` : "Your top three options are free"}</p>
        </div>
        <div className="relative rounded-2xl bg-navy-900 p-6 text-white">
          <Compass className="absolute right-5 top-5 text-teal-500" size={30} />
          <p className="font-display text-xl font-bold">Start with what matters.</p>
          <p className="mt-2 text-sm text-navy-100">Upload your list, answer a few questions, and see your options ranked.</p>
        </div>
      </div>
      <section aria-labelledby="projects-h">
        <div className="mb-4 flex items-end justify-between">
          <h2 id="projects-h" className="text-xl font-bold text-navy-950">Your projects</h2>
          <span className="text-xs text-navy-700">Private to your account</span>
        </div>
        {projects == null ? (
          <Spinner />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="flex h-full flex-col rounded-2xl border border-navy-100 bg-white p-6 shadow-sm transition hover:border-teal-500">
                  <div className="flex items-start justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                      <ListOrdered size={20} />
                    </span>
                    <Badge tone="teal">{p.finalStatus === "finalized" ? "Finalised" : STATUS[p.status] ?? p.status}</Badge>
                  </div>
                  <h3 className="mt-4 text-lg font-bold text-navy-950">{p.name}</h3>
                  <p className="mt-1 text-sm text-navy-700">
                    {p.optionCount} options · {formatColombo(p.updatedAt, false)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">{p.isDemo && <DemoBadge />}</div>
                  <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-teal-800">
                    Open project <ArrowRight size={15} />
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <form onSubmit={create} className="flex h-full flex-col rounded-2xl border-2 border-dashed border-navy-100 bg-white/60 p-6">
                <Plus className="text-teal-700" size={24} />
                <h3 className="mt-3 text-lg font-bold text-navy-950">Create a new project</h3>
                <label htmlFor="pname" className="mt-3 text-sm font-semibold text-navy-900">Project name</label>
                <Input id="pname" placeholder="Annual transfers 2027" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="mt-1" />
                <label className="mt-3 flex items-center gap-2 text-sm text-navy-800">
                  <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="accent-teal-700" /> Try it with a synthetic demo list
                </label>
                {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
                <Button type="submit" disabled={busy} className="mt-4">
                  {busy ? "Creating…" : "Create project"} <ArrowRight size={16} />
                </Button>
              </form>
            </li>
          </ul>
        )}
      </section>
      <div className="flex items-start gap-4 rounded-2xl border border-teal-100 bg-teal-50 p-5">
        <ShieldCheck className="mt-0.5 shrink-0 text-teal-700" />
        <div>
          <p className="font-bold text-navy-950">Your information stays yours.</p>
          <p className="text-sm text-navy-700">A nearby town is enough. You can review your uploaded list and delete a project at any time.</p>
        </div>
      </div>
    </div>
  );
}
