"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errMsg } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import { AccessBanner } from "@/components/AccessBanner";
import { Alert, Badge, Button, Card, DemoBadge, Empty, Input, Spinner } from "@/components/ui";
import { formatColombo } from "@/lib/dates";

type P = { id: string; name: string; status: string; isDemo: boolean; updatedAt: string; previewFrozenAt: string | null; optionCount: number; run: { status: string; doneTasks: number; totalTasks: number } | null; finalStatus: string | null };

const STATUS: Record<string, string> = { draft: "Set up", uploaded: "File uploaded", mapped: "Ready to analyze", analyzing: "Analyzing", analyzed: "Analyzed" };

export default function Dashboard() {
  const { me } = useSession();
  const [projects, setProjects] = useState<P[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => api<{ projects: P[] }>("/api/projects").then((r) => setProjects(r.projects)).catch((e) => setError(errMsg(e)));
  useEffect(() => {
    load();
  }, []);
  async function create(demo = false) {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/projects", { method: "POST", json: { name: demo ? "Demo list (synthetic)" : name || "My transfer list" } });
      if (demo) {
        const csv = await fetch("/demo/demo-vacancies.csv").then((r) => r.blob());
        const fd = new FormData();
        fd.append("file", new File([csv], "demo-vacancies.csv", { type: "text/csv" }));
        await api(`/api/projects/${id}/import`, { method: "POST", body: fd });
      }
      location.href = `/projects/${id}/${demo ? "import" : "preferences"}`;
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }
  const user = me?.session === "active" ? me.user : null;
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Welcome{user ? `, ${user.name}` : ""}</h1>
        <p className="text-sm text-navy-700">Each project holds one vacancy list with your preferences, analysis and final order.</p>
      </div>
      <AccessBanner />
      <Card title="Start a new project">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            create(false);
          }}
        >
          <label className="sr-only" htmlFor="pname">Project name</label>
          <Input id="pname" placeholder="e.g. 2026 annual transfers" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          <Button type="submit" disabled={busy}>Create project</Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => create(true)}>
            Try with synthetic demo list
          </Button>
        </form>
        {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
      </Card>
      <section aria-labelledby="projects-h">
        <h2 id="projects-h" className="mb-3 text-lg font-semibold text-navy-900">Your projects</h2>
        {projects == null ? (
          <Spinner />
        ) : projects.length === 0 ? (
          <Empty title="No projects yet">Create a project to upload your vacancy list.</Empty>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="block h-full rounded-xl border border-navy-100 bg-white p-5 shadow-sm hover:border-teal-600">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-navy-900">{p.name}</h3>
                    {p.isDemo && <DemoBadge />}
                  </div>
                  <p className="mt-1 text-xs text-navy-700">Updated {formatColombo(p.updatedAt)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge tone="teal">{STATUS[p.status] ?? p.status}</Badge>
                    <Badge>{p.optionCount} options</Badge>
                    {p.run?.status === "running" && <Badge tone="amber">Analysis {p.run.totalTasks ? Math.round((p.run.doneTasks / p.run.totalTasks) * 100) : 0}%</Badge>}
                    {p.previewFrozenAt && <Badge tone="green">Free preview ready</Badge>}
                    {p.finalStatus === "finalized" && <Badge tone="green">Finalized</Badge>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
