"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "@/lib/client/project";
import { Spinner } from "@/components/ui";

const NEXT: Record<string, string> = { draft: "import", uploaded: "import", mapped: "home", analyzing: "analysis", analyzed: "results" };
export default function ProjectHome() {
  const { id } = useParams<{ id: string }>();
  const { info } = useProject();
  const router = useRouter();
  useEffect(() => {
    if (info) router.replace(`/projects/${id}/${NEXT[info.project.status] ?? "import"}`);
  }, [info, id, router]);
  return <Spinner />;
}
