"use client";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/client/api";
import { cx, DemoBadge } from "@/components/ui";
import { ProjectContext, type ProjectInfo } from "@/lib/client/project";

const STEPS = [
  { slug: "preferences", label: "Preferences" },
  { slug: "import", label: "Import" },
  { slug: "analysis", label: "Analysis" },
  { slug: "results", label: "Results" },
  { slug: "compare", label: "Compare" },
  { slug: "final", label: "Final list" },
  { slug: "export", label: "Export" },
];

export default function ProjectLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const path = usePathname();
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [error, setError] = useState(false);
  const reload = () => api<ProjectInfo>(`/api/projects/${id}`).then(setInfo).catch(() => setError(true));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (error) return <div className="mx-auto max-w-3xl px-4 py-12 text-center text-navy-800">Project not found. <Link className="underline" href="/dashboard">Back to dashboard</Link></div>;
  return (
    <ProjectContext.Provider value={{ info, reload }}>
      <div className="border-b border-navy-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard" className="text-sm text-navy-700 hover:underline">Dashboard</Link>
            <span className="text-navy-700/50">/</span>
            <h1 className="text-lg font-semibold text-navy-900">{info?.project.name ?? "…"}</h1>
            {info?.project.isDemo && <DemoBadge />}
            <button
              className="ml-auto text-xs text-red-700 hover:underline"
              onClick={async () => {
                if (!confirm("Delete this project, its uploaded file, analysis and final lists? This cannot be undone.")) return;
                await api(`/api/projects/${id}`, { method: "DELETE" });
                location.href = "/dashboard";
              }}
            >
              Delete project
            </button>
          </div>
          <nav aria-label="Project steps" className="-mb-px mt-3 flex gap-1 overflow-x-auto">
            {STEPS.map((s, i) => {
              const href = `/projects/${id}/${s.slug}`;
              const active = path === href;
              return (
                <Link key={s.slug} href={href} aria-current={active ? "page" : undefined} className={cx("whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", active ? "border-teal-600 text-teal-800" : "border-transparent text-navy-700 hover:text-navy-950")}>
                  <span className="mr-1 text-navy-700/60">{i + 1}.</span>
                  {s.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-6">{children}</div>
    </ProjectContext.Provider>
  );
}
