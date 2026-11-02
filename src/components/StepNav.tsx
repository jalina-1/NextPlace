"use client";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ALL_STEPS, nextStep, prevStep, type StepKey } from "@/lib/client/steps";

/** Back / Next at the bottom of the result pages (Analysis → Export). */
export function StepNav({ projectId, step, hideNext }: { projectId: string; step: StepKey; hideNext?: boolean }) {
  const prev = prevStep(step);
  const next = nextStep(step);
  const label = (k: StepKey | null) => ALL_STEPS.find((s) => s.key === k)?.label;
  return (
    <div className="mt-8 flex items-center justify-between gap-3 border-t border-navy-100 pt-5">
      {prev ? (
        <Link href={`/projects/${projectId}/${prev}`} className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-navy-800 hover:bg-white">
          <ArrowLeft size={16} /> Back
        </Link>
      ) : (
        <span />
      )}
      {next && !hideNext && (
        <Link href={`/projects/${projectId}/${next}`} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-800">
          Next: {label(next)} <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
