"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useSession } from "@/lib/client/session";
import { t } from "@/lib/i18n";
import { cx } from "./ui";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold text-navy-950">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="15" fill="#10263f" />
        <path d="M16 6 L20 16 L16 26 L12 16 Z" fill="#14a89c" />
        <circle cx="16" cy="16" r="2.2" fill="#fff" />
      </svg>
      <span>{t("app.name")}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = me?.session === "active" ? me : null;
  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    router.push("/");
    location.reload();
  }
  const links = active
    ? [
        { href: "/dashboard", label: t("nav.dashboard") },
        { href: "/account", label: t("nav.account") },
        ...(active.user.role === "admin" ? [{ href: "/admin", label: t("nav.admin") }] : []),
      ]
    : [];
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-navy-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className={cx("rounded-md px-3 py-2 text-sm font-medium", path.startsWith(l.href) ? "bg-teal-50 text-teal-800" : "text-navy-800 hover:bg-navy-50")}>
                {l.label}
              </Link>
            ))}
            {active ? (
              <button onClick={signOut} className="rounded-md px-3 py-2 text-sm font-medium text-navy-800 hover:bg-navy-50">
                {t("nav.signOut")}
              </button>
            ) : me ? (
              <>
                <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium text-navy-800 hover:bg-navy-50">
                  {t("nav.signIn")}
                </Link>
                <Link href="/register" className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800">
                  {t("nav.getStarted")}
                </Link>
              </>
            ) : null}
          </nav>
          <button className="rounded-md p-2 sm:hidden" aria-expanded={open} aria-controls="mobile-nav" aria-label="Menu" onClick={() => setOpen(!open)}>
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        </div>
        {open && (
          <nav id="mobile-nav" className="border-t border-navy-100 px-4 py-2 sm:hidden" aria-label="Mobile">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded px-2 py-2 text-sm">
                {l.label}
              </Link>
            ))}
            {active ? (
              <button onClick={signOut} className="block w-full rounded px-2 py-2 text-left text-sm">
                {t("nav.signOut")}
              </button>
            ) : (
              <>
                <Link href="/login" className="block rounded px-2 py-2 text-sm">
                  {t("nav.signIn")}
                </Link>
                <Link href="/register" className="block rounded px-2 py-2 text-sm font-medium text-teal-800">
                  {t("nav.getStarted")}
                </Link>
              </>
            )}
          </nav>
        )}
      </header>
      <main id="main">{children}</main>
      <footer className="mt-16 border-t border-navy-100 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-navy-700">
          <p className="max-w-2xl">{t("landing.disclaimer")}</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:underline">
              Privacy & data retention
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
