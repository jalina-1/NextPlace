"use client";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-teal-700 text-white hover:bg-teal-800 disabled:bg-teal-700/50",
  secondary: "bg-white text-navy-900 border border-navy-100 hover:border-teal-600 hover:text-teal-800 disabled:opacity-50",
  ghost: "text-navy-800 hover:bg-navy-100 disabled:opacity-50",
  danger: "bg-red-700 text-white hover:bg-red-800 disabled:opacity-50",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }>(function Button(
  { variant = "primary", size = "md", className, ...p },
  ref,
) {
  return (
    <button
      ref={ref}
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
        size === "sm" ? "px-2.5 py-1.5 text-sm" : "px-4 py-2.5 text-sm",
        VARIANTS[variant],
        className,
      )}
    />
  );
});

export function ButtonLink({ href, variant = "primary", className, children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cx("inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors", VARIANTS[variant], className)}>
      {children}
    </Link>
  );
}

export function Card({ className, children, title, actions }: { className?: string; children: ReactNode; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx("rounded-xl border border-navy-100 bg-white p-4 shadow-sm sm:p-6", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-semibold text-navy-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const BADGES = {
  neutral: "bg-navy-100 text-navy-800",
  teal: "bg-teal-100 text-teal-800",
  amber: "bg-amber-100 text-amber-900",
  red: "bg-red-100 text-red-800",
  violet: "bg-violet-100 text-violet-800",
  green: "bg-green-100 text-green-800",
};
export function Badge({ tone = "neutral", children, title }: { tone?: keyof typeof BADGES; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", BADGES[tone])}>
      {children}
    </span>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="violet" title="Synthetic demo data from the built-in demo provider — not real research.">
      DEMO data
    </Badge>
  );
}

export function PremiumBadge() {
  return <Badge tone="amber">Premium</Badge>;
}

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-navy-900">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-navy-700/80">{hint}</p>}
      {error && (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-navy-100 bg-white px-3 py-2 text-sm text-navy-950 placeholder:text-navy-700/50 focus:border-teal-600 focus:outline-none";
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cx(inputCls, className)} />;
});
export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(inputCls, "pr-8", className)} />;
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx(inputCls, className)} />;
}

const ALERTS = {
  info: "border-navy-100 bg-navy-50 text-navy-900",
  success: "border-teal-100 bg-teal-50 text-teal-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-800",
};
export function Alert({ tone = "info", title, children }: { tone?: keyof typeof ALERTS; title?: ReactNode; children?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-lg border px-4 py-3 text-sm", ALERTS[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-navy-700" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" aria-hidden />
      {label}
    </span>
  );
}

export function Progress({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-navy-700">
        <span>{label}</span>
        <span className="tabular">{Math.round(v)}%</span>
      </div>
      <div className="h-2 rounded-full bg-navy-100" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-2 rounded-full bg-teal-600 transition-all" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-navy-100 bg-white px-6 py-10 text-center">
      <p className="font-medium text-navy-900">{title}</p>
      {children && <div className="mt-2 text-sm text-navy-700">{children}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto rounded-lg bg-navy-100 p-1">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cx("whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium", value === it.value ? "bg-white text-navy-950 shadow-sm" : "text-navy-700 hover:text-navy-950")}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function ScoreValue({ score, status }: { score: number | null; status: string }) {
  if (status === "incomplete") return <Badge tone="red">Incomplete</Badge>;
  if (status === "not_considered") return <Badge>Not considered</Badge>;
  if (score == null) return <Badge>Unscored</Badge>;
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="tabular text-base font-semibold text-navy-950">{score.toFixed(1)}</span>
      {status !== "complete" && status !== "excluded" && <span className="text-xs text-amber-800">{status === "low_coverage" ? "low evidence" : "provisional"}</span>}
    </span>
  );
}
