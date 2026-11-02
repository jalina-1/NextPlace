"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";

/** Old address of the single preferences page; the questions are now separate steps. */
export default function PreferencesRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => router.replace(`/projects/${id}/home`), [id, router]);
  return <Spinner />;
}
