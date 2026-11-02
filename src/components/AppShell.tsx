"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Compass, LayoutDashboard, CreditCard, ShieldCheck, UserRound, LogOut, Menu, X, PanelLeftClose, PanelLeftOpen, Check, ArrowRight } from "lucide-react";
import { useSession } from "@/lib/client/session";
import { useShell } from "@/lib/client/shell";
import { SETUP_STEPS, RESULT_STEPS, ALL_STEPS } from "@/lib/client/steps";
import { t } from "@/lib/i18n";
import { cx } from "./ui";

const PUBLIC = ["/", "/login", "/register", "/forgot-password", "/reset-password", "/privacy"];
const SIDEBAR_KEY = "np-sidebar-collapsed";

export function Logo({ small }: { small?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3 text-navy-950">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
        <Compass size={22} />
      </span>
      {!small && (
        <span className="leading-tight">
          <span className="font-display block text-lg font-bold">{t("app.name")}</span>
          <span className="block text-[9px] font-semibold tracking-[0.18em] text-navy-700">MAKE YOUR NEXT MOVE MATTER</span>
        </span>
      )}
    </Link>
  );
}

async function signOut() {
  await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  location.href = "/";
}

function PublicShell({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const active = me?.session === "active";
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-3" aria-label="Main">
          {active ? (
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">
              My projects <ArrowRight size={16} />
            </Link>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-navy-900 hover:bg-white">{t("nav.signIn")}</Link>
              <Link href="/register" className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">
                {t("nav.getStarted")} <ArrowRight size={16} />
              </Link>
            </>
          )}
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer className="mx-auto mt-16 max-w-6xl border-t border-navy-100 px-4 py-6 text-center text-xs text-navy-700">
        <p>{t("landing.disclaimer")}</p>
        <Link href="/privacy" className="mt-2 inline-block hover:underline">Privacy & data retention</Link>
      </footer>
    </div>
  );
}

function NavItem({ href, icon: Icon, label, active, collapsed, badge, onClick }: { href: string; icon: typeof Compass; label: string; active: boolean; collapsed: boolean; badge?: ReactNode; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cx(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active ? "bg-teal-50 font-semibold text-teal-800" : "text-navy-800 hover:bg-navy-50",
        collapsed && "justify-center px-0",
      )}
    >
      {active && <span className="absolute -left-5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-teal-700" aria-hidden />}
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {badge}
    </Link>
  );
}

function Sidebar({ collapsed, onToggle, onNavigate, mobile }: { collapsed: boolean; onToggle?: () => void; onNavigate?: () => void; mobile?: boolean }) {
  const { me } = useSession();
  const { project, stepErrors } = useShell();
  const path = usePathname();
  const user = me?.session === "active" ? me : null;
  const stepHref = (k: string) => `/projects/${project?.id}/${k}`;
  const label = (s: string) => <p className="mb-2 mt-5 px-3 text-[10px] font-bold tracking-[0.18em] text-navy-700">{s}</p>;
  return (
    <div className={cx("flex h-full flex-col bg-white", collapsed ? "w-[76px] px-3" : "w-[264px] px-5")}>
      <div className={cx("flex items-center pt-5 pb-2", collapsed ? "justify-center" : "justify-between")}>
        <Logo small={collapsed} />
        {mobile && (
          <button onClick={onNavigate} aria-label="Close menu" className="rounded-lg p-2 hover:bg-navy-50">
            <X size={20} />
          </button>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto pb-4" aria-label="Workspace">
        {!collapsed && label("YOUR WORKSPACE")}
        {collapsed && <div className="h-4" />}
        <NavItem href="/dashboard" icon={LayoutDashboard} label="My projects" active={path === "/dashboard"} collapsed={collapsed} onClick={onNavigate} />
        {project && (
          <>
            {!collapsed ? label(project.name.toUpperCase().slice(0, 28)) : <div className="my-3 border-t border-navy-100" />}
            {SETUP_STEPS.map((s, i) => (
              <NavItem
                key={s.key}
                href={stepHref(s.key)}
                icon={s.icon}
                label={`${i + 1}. ${s.label}`}
                active={path === stepHref(s.key)}
                collapsed={collapsed}
                onClick={onNavigate}
                badge={stepErrors[s.key] ? <span className={cx("h-2.5 w-2.5 rounded-full bg-red-600", collapsed && "absolute right-2 top-2")} aria-label="Needs attention" /> : null}
              />
            ))}
            {!collapsed ? label("RESULTS") : <div className="my-3 border-t border-navy-100" />}
            {RESULT_STEPS.map((s) => (
              <NavItem key={s.key} href={stepHref(s.key)} icon={s.icon} label={s.label} active={path === stepHref(s.key)} collapsed={collapsed} onClick={onNavigate} />
            ))}
          </>
        )}
        {!collapsed ? label("ACCOUNT") : <div className="my-3 border-t border-navy-100" />}
        <NavItem
          href="/payment"
          icon={CreditCard}
          label="Full access"
          active={path === "/payment"}
          collapsed={collapsed}
          onClick={onNavigate}
          badge={user && !user.access.premium ? <span className={cx("h-2 w-2 rounded-full bg-amber-500", collapsed && "absolute right-2 top-2")} aria-hidden /> : null}
        />
        <NavItem href="/account" icon={UserRound} label="Account & privacy" active={path === "/account"} collapsed={collapsed} onClick={onNavigate} />
        {user?.user.role === "admin" && <NavItem href="/admin" icon={ShieldCheck} label="Admin" active={path === "/admin"} collapsed={collapsed} onClick={onNavigate} />}
      </nav>
      <div className={cx("flex items-center gap-3 border-t border-navy-100 py-4", collapsed && "flex-col")}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-100 text-sm font-semibold text-navy-900" aria-hidden>
          {user?.user.name?.[0]?.toUpperCase() ?? "?"}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-semibold">{user?.user.name}</span>
            <span className="block text-xs text-navy-700">{user?.access.premium ? "Full access" : "Free preview"}</span>
          </span>
        )}
        <button onClick={signOut} title={t("nav.signOut")} aria-label={t("nav.signOut")} className="rounded-lg p-2 text-navy-800 hover:bg-navy-50">
          <LogOut size={18} />
        </button>
      </div>
      {onToggle && (
        <button
          onClick={onToggle}
          className={cx("mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-navy-700 hover:bg-navy-50", collapsed && "justify-center px-0")}
          aria-label={collapsed ? "Expand sidebar" : "Minimize sidebar"}
          title={collapsed ? "Expand sidebar" : "Minimize sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && "Minimize sidebar"}
        </button>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const { project } = useShell();
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => setDrawer(false), [path]);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };
  if (PUBLIC.includes(path) || me?.session !== "active") return <PublicShell>{children}</PublicShell>;
  const stepKey = path.split("/")[3];
  const step = ALL_STEPS.find((s) => s.key === stepKey);
  const crumb = project && step ? step.label : path.startsWith("/admin") ? "Admin" : path.startsWith("/payment") ? "Full access" : path.startsWith("/account") ? "Account & privacy" : "My projects";
  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <aside className="sticky top-0 hidden h-screen shrink-0 border-r border-navy-100 lg:block">
        <Sidebar collapsed={collapsed} onToggle={toggle} />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-navy-950/30" aria-label="Close menu" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 shadow-xl">
            <Sidebar collapsed={false} mobile onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-navy-100 bg-white/95 px-4 py-4 backdrop-blur sm:px-8">
          <button className="rounded-lg p-2 hover:bg-navy-50 lg:hidden" aria-label="Open menu" aria-expanded={drawer} onClick={() => setDrawer(true)}>
            <Menu size={20} />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm text-navy-900">
            <span className="hidden sm:inline">{project && step ? project.name : "Workspace"} </span>
            <span className="text-navy-700">/ {crumb}</span>
          </p>
          {project?.isDemo && <span className="hidden rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800 sm:inline">Demo data</span>}
          <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
            {me.access.premium ? "Full access" : "Free preview"}
          </span>
        </header>
        <main id="main" className="flex-1">{children}</main>
        <footer className="px-4 py-6 text-center text-xs text-navy-700 sm:px-8">{t("landing.disclaimer")}</footer>
      </div>
    </div>
  );
}
