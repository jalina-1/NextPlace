"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { ALL_STEPS, SETUP_STEPS, nextStep, prevStep, type StepKey } from "@/lib/client/steps";
import { cx, Spinner } from "./ui";

/** Frame for one setup step: step label, title, the questions, and Back / Next. */
export function StepPage({
  projectId,
  step,
  title,
  intro,
  children,
  onNext,
  busy,
  problem,
  nextLabel,
  nextQuery,
}: {
  projectId: string;
  step: StepKey;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  /** Returns true when the user may continue. */
  onNext?: () => Promise<boolean> | boolean;
  busy?: boolean;
  problem?: { step: StepKey; message: string } | null;
  nextLabel?: string;
  nextQuery?: string;
}) {
  const router = useRouter();
  const idx = SETUP_STEPS.findIndex((s) => s.key === step);
  const prev = prevStep(step);
  const next = nextStep(step);
  async function go() {
    if (onNext && !(await onNext())) return;
    if (next) router.push(`/projects/${projectId}/${next}${nextQuery ? `?${nextQuery}` : ""}`);
  }
  return (
    <div className="space-y-6">
      <div>
        {idx >= 0 && <p className="eyebrow">Step {idx + 1} of {SETUP_STEPS.length}</p>}
        <h1 className="mt-2 text-3xl font-extrabold text-navy-950 sm:text-4xl">{title}</h1>
        {intro && <div className="mt-3 max-w-2xl text-navy-700">{intro}</div>}
      </div>
      {idx >= 0 && (
        <ol className="flex gap-1.5" aria-label="Progress">
          {SETUP_STEPS.map((s, i) => (
            <li key={s.key} className={cx("h-1.5 flex-1 rounded-full", i <= idx ? "bg-teal-700" : "bg-navy-100")} aria-label={`${s.label}${i < idx ? " (done)" : i === idx ? " (current)" : ""}`} />
          ))}
        </ol>
      )}
      <div className="space-y-5">{children}</div>
      {problem && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {problem.message}{" "}
          {problem.step !== step && (
            <Link className="font-semibold underline" href={`/projects/${projectId}/${problem.step}`}>
              Go to “{ALL_STEPS.find((s) => s.key === problem.step)?.label}”
            </Link>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-navy-100 pt-5">
        {prev ? (
          <Link href={`/projects/${projectId}/${prev}`} className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-navy-800 hover:bg-white">
            <ArrowLeft size={16} /> Back
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <button onClick={go} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
            {busy ? <Spinner label="Saving…" /> : <>{nextLabel ?? "Save and continue"} <ArrowRight size={16} /></>}
          </button>
        )}
      </div>
    </div>
  );
}

/** One question. Shows its error in red right under it and is the scroll target when invalid. */
export function Question({ title, hint, error, children, field, optional }: { title: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; field: string; optional?: boolean }) {
  return (
    <section data-field={field} data-field-error={error ? "true" : undefined} className={cx("rounded-2xl border bg-white p-5 shadow-sm sm:p-6", error ? "field-error border-red-300" : "border-navy-100")}>
      <h2 className="text-lg font-bold text-navy-950">
        {title} {optional && <span className="ml-1 text-xs font-medium text-navy-700">(optional)</span>}
      </h2>
      {hint && <p className="mt-1 text-sm text-navy-700">{hint}</p>}
      <div className="mt-4">{children}</div>
      {error && (
        <p className="mt-3 flex items-start gap-2 text-sm font-medium text-red-700" role="alert">
          <span aria-hidden>⚠</span> {error}
        </p>
      )}
    </section>
  );
}

/** Large, tappable single-choice cards. */
export function Choices<T extends string | number>({
  value,
  onChange,
  options,
  label,
  columns = 3,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string; icon?: ReactNode }[];
  label: string;
  columns?: 2 | 3 | 4;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("choice-group grid gap-3 rounded-xl", columns === 2 ? "sm:grid-cols-2" : columns === 4 ? "grid-cols-2 sm:grid-cols-4" : "sm:grid-cols-3")}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              "relative flex flex-col items-start rounded-xl border-2 px-4 py-3.5 text-left transition-colors",
              on ? "border-teal-700 bg-teal-50" : "border-navy-100 bg-white hover:border-teal-500",
            )}
          >
            {o.icon && <span className={cx("mb-2", on ? "text-teal-700" : "text-navy-700")}>{o.icon}</span>}
            <span className="font-semibold text-navy-950">{o.label}</span>
            {o.hint && <span className="mt-0.5 text-xs text-navy-700">{o.hint}</span>}
            {on && (
              <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-teal-700 text-white" aria-hidden>
                <Check size={13} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
