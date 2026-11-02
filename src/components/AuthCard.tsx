import type { ReactNode } from "react";
export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-2xl border border-navy-100 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="mb-6 text-2xl font-semibold text-navy-900">{title}</h1>
        {children}
      </div>
      {footer && <div className="mt-4 text-center text-sm text-navy-700">{footer}</div>}
    </div>
  );
}
