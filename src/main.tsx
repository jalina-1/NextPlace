import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Compass,
  ArrowRight,
  Plus,
  LayoutDashboard,
  SlidersHorizontal,
  Upload,
  BarChart3,
  Columns3,
  ListOrdered,
  CreditCard,
  ShieldCheck,
  LogOut,
  Check,
  ChevronUp,
  ChevronDown,
  Download,
  MapPin,
  Search,
  Menu,
} from "lucide-react";
import { en as t } from "./i18n";
import "./style.css";
async function api(url: string, method = "GET", data?: any) {
  const r = await fetch("/api" + url, {
    method,
    headers:
      data instanceof FormData ? {} : { "Content-Type": "application/json" },
    body:
      data instanceof FormData
        ? data
        : data === undefined
          ? undefined
          : JSON.stringify(data),
  });
  if (r.status === 401 && url !== "/me")
    window.dispatchEvent(new Event("session-invalid"));
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: "Request failed" }));
    throw Error(e.error);
  }
  return r.json();
}
const date = (d: any) =>
  d
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeZone: "Asia/Colombo",
      }).format(new Date(d))
    : "—";
const split = (s: string) =>
  s
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
function App() {
  const [user, U] = useState<any>(null),
    [page, P] = useState("dashboard"),
    [auth, A] = useState("landing"),
    [projects, PS] = useState<any[]>([]),
    [p, SP] = useState<any>(null),
    [error, E] = useState(""),
    [notice, N] = useState(""),
    [busy, B] = useState(false),
    [pub, PUB] = useState<any>({}),
    [mobile, M] = useState(false);
  const run = async (fn: () => Promise<any>) => {
    B(true);
    E("");
    try {
      await fn();
    } catch (e: any) {
      E(e.message);
    } finally {
      B(false);
    }
  };
  const refresh = async () => {
    const me = await api("/me");
    U(me);
    PS(await api("/projects"));
  };
  const load = async (id: string) => SP(await api("/projects/" + id));
  useEffect(() => {
    const listener = () => {
      U(null);
      A("login");
    };
    window.addEventListener("session-invalid", listener);
    return () => window.removeEventListener("session-invalid", listener);
  }, []);
  useEffect(() => {
    api("/public")
      .then(PUB)
      .catch(() => {});
    refresh().catch(() => {});
  }, []);
  useEffect(() => {
    if (p?.status !== "analyzing") return;
    let running = false;
    const timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        await api(`/projects/${p.id}/advance`, "POST");
        await load(p.id);
      } catch (e: any) {
        E(e.message);
      } finally {
        running = false;
      }
    }, 2200);
    return () => clearInterval(timer);
  }, [p?.id, p?.status]);
  const go = (page: string) => {
    P(page);
    M(false);
    N("");
    E("");
  };
  const savePrefs = async (preferences: any) => {
    await api(`/projects/${p.id}/preferences`, "PUT", {
      preferences,
      revision: p.revision,
    });
    await load(p.id);
    N("Preferences saved. Scores use your existing evidence.");
  };
  if (!user)
    return (
      <div className="public">
        <header>
          <Brand />
          <nav>
            <button onClick={() => A("landing")}>{t.ui001}</button>

            <button onClick={() => A("login")}>{t.ui003}</button>
            <button className="primary" onClick={() => A("register")}>
              {t.ui004}
              <ArrowRight size={16} />
            </button>
          </nav>
        </header>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        {auth === "landing" || auth === "pricing" ? (
          <>
            <section className="hero">
              <div>
                <span className="eyebrow">{t.ui005}</span>
                <h1>
                  {t.ui006}
                  <br />
                  <em>{t.ui007}</em>
                </h1>
                <p>{t.ui008}</p>
                <button className="primary large" onClick={() => A("register")}>
                  {t.ui009}
                  <ArrowRight size={18} />
                </button>
                <small>{t.ui010}</small>
              </div>
              <div className="hero-card">
                <span className="eyebrow">{t.ui011}</span>
                <h2>
                  {t.ui012}
                  <br />
                  {t.ui013}
                </h2>
                <div className="compass-art">
                  <Compass size={120} strokeWidth={0.8} />
                </div>
                {[
                  "A posting that fits your goals",
                  "A journey that works for you",
                  "Evidence behind every score",
                ].map((x) => (
                  <p key={x}>
                    <Check size={18} /> {x}
                  </p>
                ))}
                <span className="badge">{t.ui014}</span>
              </div>
            </section>
            <section className="features">
              {[
                [
                  "01",
                  "Tell us what matters",
                  "Choose your preferred posts, journey, climate, and facilities.",
                ],
                [
                  "02",
                  "Make sense of your options",
                  "Import a vacancy list and review the evidence behind each result.",
                ],
                [
                  "03",
                  "Make the list your own",
                  "Compare, refine your order, and export your final preferences.",
                ],
              ].map(([n, h, s]) => (
                <article key={n}>
                  <span className="number">{n}</span>
                  <h3>{h}</h3>
                  <p>{s}</p>
                </article>
              ))}
            </section>
            <footer>{t.disclaimer}</footer>
          </>
        ) : (
          <section className="auth-card">
            <span className="eyebrow">{t.ui021}</span>
            <h1>
              {auth === "register"
                ? "Create your account"
                : auth === "recover"
                  ? "Recover your account"
                  : auth === "reset"
                    ? "Set a new password"
                    : "Welcome back"}
            </h1>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(async () => {
                  const result = await api(
                    "/" + auth,
                    "POST",
                    Object.fromEntries(f),
                  );
                  if (["register", "login"].includes(auth)) await refresh();
                  else {
                    N(
                      result.message ||
                        "Password updated. Sign in to continue.",
                    );
                  }
                });
              }}
            >
              {auth !== "reset" && (
                <label>
                  {t.ui022}
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                  />
                </label>
              )}
              {auth === "reset" && (
                <label>
                  {t.ui023}
                  <input name="token" required />
                </label>
              )}
              {auth !== "recover" && (
                <label>
                  {t.ui024}
                  <input
                    name="password"
                    type="password"
                    minLength={10}
                    required
                    autoComplete={
                      auth === "login" ? "current-password" : "new-password"
                    }
                  />
                  <small>{t.ui025}</small>
                </label>
              )}
              <button className="primary" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : auth === "register"
                    ? "Create account"
                    : auth === "recover"
                      ? "Send recovery email"
                      : auth === "reset"
                        ? "Update password"
                        : "Sign in"}
              </button>
            </form>
            {notice && <p role="status">{notice}</p>}
            <div className="auth-links">
              <button
                onClick={() => A(auth === "login" ? "register" : "login")}
              >
                {auth === "login" ? "Create an account" : "Back to sign in"}
              </button>
              <button onClick={() => A("recover")}>{t.ui026}</button>
              <button onClick={() => A("reset")}>{t.ui027}</button>
            </div>
          </section>
        )}
      </div>
    );
  const nav = [
    ["dashboard", LayoutDashboard, t.dashboard],
    ["preferences", SlidersHorizontal, t.preferences],
    ["import", Upload, t.import],
    ["results", BarChart3, t.results],
    ["compare", Columns3, t.compare],
    ["editor", ListOrdered, t.editor],
    ["payment", CreditCard, t.payment],
    ["account", ShieldCheck, t.account],
    ...(user.role === "admin" ? [["admin", ShieldCheck, t.admin]] : []),
  ] as any[];
  return (
    <div className="app">
      <aside className={mobile ? "open" : ""}>
        <Brand />
        <div className="workspace-label">{t.ui028}</div>
        <nav>
          {nav.map(([key, Icon, label]) => (
            <button
              key={key}
              className={page === key ? "active" : ""}
              onClick={() => go(key)}
            >
              <Icon size={18} />
              {label}
              {key === "payment" && <span className="dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">{user.email[0].toUpperCase()}</div>
          <div>
            <strong>{user.email.split("@")[0]}</strong>
            <small>{user.premium ? "Premium member" : "Free preview"}</small>
          </div>
          <button
            title={t.ui029}
            onClick={() =>
              run(async () => {
                await api("/logout", "POST");
                U(null);
                SP(null);
              })
            }
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <button
            className="mobile-menu"
            onClick={() => M(!mobile)}
            aria-label={t.ui030}
          >
            <Menu />
          </button>
          <span>
            {t.ui031}
            <span className="muted">
              {t.ui032}
              {nav.find((n) => n[0] === page)?.[2]}
            </span>
          </span>
          <span className="badge">
            {user.premium ? "Premium access" : "Free preview"}
          </span>
        </header>
        <div className="content">
          {error && (
            <div className="alert" role="alert">
              {error}
              <button onClick={() => E("")}>{t.ui033}</button>
            </div>
          )}
          {notice && (
            <div className="success" role="status">
              {notice}
            </div>
          )}
          {page === "dashboard" ? (
            <>
              <div className="title-row">
                <div>
                  <span className="eyebrow">{t.ui034}</span>
                  <h1>{t.ui035}</h1>
                  <p>{t.ui036}</p>
                </div>
              </div>
              <div className="stats">
                <article>
                  <span>{t.ui037}</span>
                  <strong>{projects.length.toString().padStart(2, "0")}</strong>
                  <small>{t.ui038}</small>
                </article>
                <article>
                  <span>{t.ui039}</span>
                  <strong>{user.premium ? "Premium" : "Free preview"}</strong>
                  <small>
                    {user.premium
                      ? "Until " + date(user.premiumUntil)
                      : "Three results per confirmed analysis"}
                  </small>
                </article>
                <article className="teal-stat">
                  <Compass size={32} />
                  <h3>{t.ui040}</h3>
                  <p>{t.ui041}</p>
                </article>
              </div>
              <div className="section-heading">
                <h2>{t.ui042}</h2>
                <span className="muted">{t.ui043}</span>
              </div>
              <div className="project-grid">
                {projects.map((x) => (
                  <button
                    className="project-card"
                    key={x.id}
                    onClick={() =>
                      run(async () => {
                        await load(x.id);
                        go(
                          x.status === "draft"
                            ? "preferences"
                            : x.status === "review"
                              ? "import"
                              : "results",
                        );
                      })
                    }
                  >
                    <div>
                      <span className="project-icon">
                        <ListOrdered />
                      </span>
                      <span className="badge">{x.status}</span>
                    </div>
                    <h3>{x.name}</h3>
                    <p>
                      {x.count}
                      {t.ui044}
                      {date(x.createdAt)}
                    </p>
                    <small>
                      {x.demo ? t.synthetic : "Real research project"}
                    </small>
                    <div className="card-link">
                      {t.ui045}
                      <ArrowRight size={16} />
                    </div>
                  </button>
                ))}
                <form
                  className="project-card new-project"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    run(async () => {
                      const r = await api("/projects", "POST", {
                        name: f.get("name"),
                        demo: f.get("demo") === "on",
                      });
                      await refresh();
                      await load(r.id);
                      go("preferences");
                    });
                  }}
                >
                  <Plus size={25} />
                  <h3>{t.ui046}</h3>
                  <label>
                    {t.ui047}
                    <input
                      name="name"
                      placeholder={t.ui048}
                      required
                      maxLength={120}
                    />
                  </label>
                  <label className="check">
                    <input name="demo" type="checkbox" />
                    {t.ui049}
                  </label>
                  <button className="primary" disabled={busy}>
                    {t.ui050}
                    <ArrowRight size={16} />
                  </button>
                </form>
              </div>
              <div className="info-panel">
                <ShieldCheck />
                <div>
                  <h3>{t.ui051}</h3>
                  <p>{t.ui052}</p>
                </div>
              </div>
            </>
          ) : page === "payment" ? (
            <Payments user={user} run={run} />
          ) : page === "admin" ? (
            <Admin run={run} />
          ) : page === "account" ? (
            <>
              <PageTitle eyebrow={t.ui053} title={t.ui054} text={t.ui055} />
              <section className="panel">
                <h3>{user.email}</h3>
                <p>{t.ui056}</p>
                <p>{t.ui057}</p>
                <p>
                  {t.ui058}
                  {date(user.premiumUntil)}
                  {t.ui059}
                </p>
                {projects.map((x) => (
                  <div className="list-row" key={x.id}>
                    <span>{x.name}</span>
                    <button
                      className="danger"
                      onClick={() => {
                        if (
                          confirm(
                            "Permanently delete this project and its source files?",
                          )
                        )
                          run(async () => {
                            await api("/projects/" + x.id, "DELETE");
                            if (p?.id === x.id) SP(null);
                            await refresh();
                          });
                      }}
                    >
                      {t.ui060}
                    </button>
                  </div>
                ))}
              </section>
            </>
          ) : !p ? (
            <div className="empty">
              <Compass size={48} />
              <h2>{t.ui061}</h2>
              <p>{t.ui062}</p>
              <button className="primary" onClick={() => go("dashboard")}>
                {t.ui063}
              </button>
            </div>
          ) : (
            <>
              <div className="project-banner">
                <span>
                  <MapPin size={15} /> {p.name}
                </span>
                <span>
                  {p.demo
                    ? t.synthetic
                    : "Real research · provider evidence only"}
                </span>
              </div>
              {page === "preferences" ? (
                <Preferences
                  key={p.id}
                  p={p}
                  save={(v: any) => run(() => savePrefs(v))}
                  next={() => go("import")}
                  busy={busy}
                />
              ) : page === "import" ? (
                <Import
                  p={p}
                  run={run}
                  reload={() => load(p.id)}
                  next={() => go("results")}
                />
              ) : page === "results" || page === "compare" ? (
                <Results
                  p={p}
                  compare={page === "compare"}
                  user={user}
                  run={run}
                  reload={() => load(p.id)}
                  next={() => go("editor")}
                />
              ) : page === "editor" ? (
                <Editor p={p} user={user} run={run} reload={() => load(p.id)} />
              ) : null}
            </>
          )}
          <footer>{t.disclaimer}</footer>
        </div>
      </main>
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span>
        <Compass size={25} />
      </span>
      <div>
        {t.brand}
        <small>{t.ui066}</small>
      </div>
    </div>
  );
}
function PageTitle({ eyebrow, title, text }: any) {
  return (
    <div className="title-row">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </div>
  );
}
function Preferences({ p, save, next, busy }: any) {
  const [v, V] = useState(p.preferences);
  const field = (key: string, label: string, extra: any = {}) => (
    <label>
      {label}
      <input
        value={v[key] ?? ""}
        {...extra}
        onChange={(e) =>
          V({
            ...v,
            [key]:
              extra.type === "number" ? Number(e.target.value) : e.target.value,
          })
        }
      />
    </label>
  );
  const list = (key: string, label: string) => (
    <label>
      {label}
      <input
        defaultValue={v[key].join(", ")}
        onBlur={(e) => V({ ...v, [key]: split(e.target.value) })}
      />
      <small>{t.ui067}</small>
    </label>
  );
  const total = Object.values(v.weights).reduce(
    (a: any, b: any) => a + b,
    0,
  ) as number;
  return (
    <>
      <PageTitle eyebrow={t.ui068} title={t.ui069} text={t.ui070} />
      <div className="two-col">
        <section className="panel">
          <h2>{t.ui071}</h2>
          {list("posts", "Preferred posts, in priority order")}
          {list("institutions", "Preferred institutions (review notes)")}
          {list("districts", "Preferred districts (review notes)")}
          {list("excludedInstitutions", "Hard exclusions · institutions")}
          {list("excludedDistricts", "Hard exclusions · districts")}
          <p className="hint">{t.ui072}</p>
          <h2>{t.ui073}</h2>
          {field("home", "Approximate home town")}
          {field(
            "secondLocation",
            "Second reference location (optional planning note)",
          )}
          <label>
            {t.ui074}
            <select
              value={v.mode}
              onChange={(e) => V({ ...v, mode: e.target.value })}
            >
              <option value="driving">{t.ui075}</option>
              <option value="transit">{t.ui076}</option>
              <option value="mixed">{t.ui077}</option>
            </select>
          </label>
          <label>
            {t.ui078}
            <select
              value={v.frequency}
              onChange={(e) => V({ ...v, frequency: e.target.value })}
            >
              {["daily", "weekly", "occasional"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <div className="two-col">
            {field("maxMinutes", "Preferred time threshold (minutes)", {
              type: "number",
              min: 1,
            })}
            {field("maxKm", "Distance reference (km, not scored twice)", {
              type: "number",
              min: 1,
            })}
          </div>
          <label>
            {t.ui079}
            <select
              value={v.climate}
              onChange={(e) => V({ ...v, climate: e.target.value })}
            >
              {["any", "cool", "temperate", "warm"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          {field(
            "accommodation",
            "Accommodation preferences (unverified planning notes)",
          )}
          {field("mandatory", "Mandatory requirements to verify personally")}
        </section>
        <section className="panel weights">
          <span className="eyebrow">{t.ui080}</span>
          <h2>{t.ui081}</h2>
          <p>{t.ui082}</p>
          {Object.entries(v.weights).map(([k, w]: any) => (
            <div className="weight" key={k}>
              <label>
                <input
                  type="checkbox"
                  checked={w > 0}
                  onChange={(e) =>
                    V({
                      ...v,
                      weights: { ...v.weights, [k]: e.target.checked ? 10 : 0 },
                    })
                  }
                />
                {
                  (
                    {
                      post: "Post preference",
                      travel: "Travel convenience",
                      climate: "Climate match",
                      facilities: "Nearby schools",
                    } as any
                  )[k]
                }
                <input
                  aria-label={k + " weight"}
                  type="number"
                  min="0"
                  max="100"
                  value={w}
                  onChange={(e) =>
                    V({
                      ...v,
                      weights: { ...v.weights, [k]: Number(e.target.value) },
                    })
                  }
                />
                {t.ui083}
              </label>
              <input
                aria-label={k + " weight slider"}
                type="range"
                min="0"
                max="100"
                value={w}
                onChange={(e) =>
                  V({
                    ...v,
                    weights: { ...v.weights, [k]: Number(e.target.value) },
                  })
                }
              />
            </div>
          ))}
          <div className="list-row">
            <strong>
              {t.ui084}
              {total.toFixed(1)}
              {t.ui083}
            </strong>
            <button
              onClick={() => {
                if (total)
                  V({
                    ...v,
                    weights: Object.fromEntries(
                      Object.entries(v.weights).map(([k, w]: any) => [
                        k,
                        (w / total) * 100,
                      ]),
                    ),
                  });
              }}
            >
              {t.ui085}
            </button>
          </div>
          <p className="hint">{t.ui086}</p>
          <button
            className="primary"
            disabled={busy || Math.abs(total - 100) > 0.001}
            onClick={() => save(v)}
          >
            {t.ui087}
          </button>
          <button className="secondary" onClick={next}>
            {t.ui088}
            <ArrowRight size={16} />
          </button>
        </section>
      </div>
    </>
  );
}
function Import({ p, run, reload, next }: any) {
  const [table, T] = useState(0),
    [mapping, M] = useState<any>({}),
    [edits, ED] = useState<any[]>([]),
    [sharedPost, SETPOST] = useState("");
  const tables = p.import?.tables || [];
  const selected = tables[table];
  const missingRows = selected
    ? selected.rows
        .slice(1)
        .map((row: any[], i: number) => ({ row, i }))
        .filter(({ row }: any) => row.some((v: any) => v !== ""))
        .filter(({ row, i }: any) =>
          ["institution", "post"].some(
            (k) =>
              !String(
                edits[i]?.[k] ??
                  row[selected.rows[0].indexOf(mapping[k])] ??
                  "",
              ).trim(),
          ),
        )
    : [];
  useEffect(() => {
    if (selected) {
      const h = selected.rows[0].map(String);
      const aliases: any = {
        index: /^(index|id|no\.?|serial)$/i,
        district: /district|region/i,
        institution: /institution|hospital|facility/i,
        post: /designation|post|specialty|position|unit/i,
        vacancies: /vacanc|count/i,
      };
      M(
        Object.fromEntries(
          Object.entries(aliases).map(([k, re]: any) => [
            k,
            h.find((x: string) => re.test(x)) || "",
          ]),
        ),
      );
      ED([]);
      SETPOST("");
    }
  }, [selected]);
  return (
    <>
      <PageTitle eyebrow={t.ui089} title={t.ui090} text={t.ui091} />
      <section className="panel">
        <form
          className="upload-zone"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(async () => {
              await api(`/projects/${p.id}/import`, "POST", f);
              await reload();
            });
          }}
        >
          <Upload size={35} />
          <h3>{t.ui092}</h3>
          <p>{t.ui093}</p>
          <input
            aria-label={t.ui094}
            name="file"
            type="file"
            accept=".csv,.xlsx,.pdf"
            required
          />
          <button className="primary" disabled={p.previewFrozen}>
            {t.ui095}
          </button>
          <small>{t.ui096}</small>
        </form>
      </section>
      {selected && (
        <section className="panel">
          <div className="section-heading">
            <h2>{t.ui097}</h2>
            <select
              aria-label={t.ui098}
              value={table}
              onChange={(e) => T(Number(e.target.value))}
            >
              {tables.map((t: any, i: number) => (
                <option value={i} key={i}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {selected.warnings.map((w: string) => (
            <p className="alert" key={w}>
              {w}
            </p>
          ))}
          <div className="mapping">
            {["index", "district", "institution", "post", "vacancies"].map(
              (k) => (
                <label key={k}>
                  {k}
                  {["institution", "post"].includes(k) ? " *" : ""}
                  <select
                    value={mapping[k] || ""}
                    onChange={(e) => M({ ...mapping, [k]: e.target.value })}
                  >
                    <option value="">{t.ui099}</option>
                    {selected.rows[0].map((h: any, i: number) => (
                      <option key={i}>{String(h)}</option>
                    ))}
                  </select>
                </label>
              ),
            )}
          </div>
          <div className="info-panel">
            <div>
              <label>
                {t.sharedPostLabel}
                <input
                  value={sharedPost}
                  maxLength={200}
                  onChange={(e) => SETPOST(e.target.value)}
                  placeholder={t.sharedPostPlaceholder}
                />
              </label>
              <p>{t.sharedPostHelp}</p>
              <button
                className="secondary"
                disabled={!sharedPost.trim() || p.previewFrozen}
                onClick={() =>
                  ED((current) =>
                    selected.rows.slice(1).map((row: any[], i: number) => {
                      const post = String(
                        current[i]?.post ??
                          row[selected.rows[0].indexOf(mapping.post)] ??
                          "",
                      ).trim();
                      return post
                        ? current[i]
                        : { ...current[i], post: sharedPost.trim() };
                    }),
                  )
                }
              >
                {t.fillMissingPosts}
              </button>
            </div>
          </div>
          <p className="hint">{t.ui100}</p>
          {missingRows.length > 0 && (
            <p className="alert" role="status">
              {t.incompleteRows} {missingRows.length}. {t.firstIncompleteRow}{" "}
              {missingRows[0].i + 2}.
            </p>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t.ui101}</th>
                  {["institution", "district", "post"].map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected.rows.slice(1).map((row: any[], i: number) => (
                  <tr key={i}>
                    <td>{i + 2}</td>
                    {["institution", "district", "post"].map((k) => (
                      <td key={k}>
                        <input
                          aria-label={`${k} row ${i + 2}`}
                          value={
                            edits[i]?.[k] ??
                            row[selected.rows[0].indexOf(mapping[k])] ??
                            ""
                          }
                          onChange={(e) =>
                            ED((a) => {
                              const b = [...a];
                              b[i] = { ...b[i], [k]: e.target.value };
                              return b;
                            })
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="primary"
            disabled={p.previewFrozen || missingRows.length > 0}
            onClick={() =>
              run(async () => {
                await api(`/projects/${p.id}/confirm`, "POST", {
                  table,
                  mapping,
                  edits,
                });
                await reload();
              })
            }
          >
            {t.ui102}
            {selected.rows.length - 1}
            {t.ui103}
          </button>
        </section>
      )}
      {p.source?.length > 0 && (
        <section className="panel">
          <h3>
            {p.source.length}
            {t.ui104}
          </h3>
          <p>
            {p.source.filter((o: any) => o.duplicate).length}
            {t.ui105}
          </p>
          <button
            className="primary"
            onClick={() =>
              run(async () => {
                await api(`/projects/${p.id}/analyze`, "POST");
                await reload();
                next();
              })
            }
          >
            {t.ui106}
            <ArrowRight size={16} />
          </button>
        </section>
      )}
    </>
  );
}
function Results({ p, compare, user, run, reload, next }: any) {
  const [search, S] = useState(""),
    [sort, SS] = useState("score"),
    [direction, D] = useState("desc"),
    [ids, IDS] = useState<string[]>([]),
    [n, N] = useState(3);
  let rows = p.results.filter((r: any) =>
    (r.institution + " " + r.district + " " + r.post)
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const value = (r: any) =>
    sort === "score"
      ? r.score
      : sort === "distance" || sort === "minutes"
        ? r.evidence[sort]?.value
        : sort in r.scores
          ? r.scores[sort]
          : r[sort];
  rows = [...rows].sort((a: any, b: any) => {
    const x = value(a),
      y = value(b);
    if (x == null) return y == null ? 0 : 1;
    if (y == null) return -1;
    return (
      (typeof x === "string" ? x.localeCompare(y) : x - y) *
      (direction === "asc" ? 1 : -1)
    );
  });
  return (
    <>
      <PageTitle
        eyebrow={
          compare ? "SIDE BY SIDE" : "STEP 03 · YOUR OPTIONS, IN PERSPECTIVE"
        }
        title={compare ? "Look a little closer." : "Your ranked options."}
        text={t.ui107}
      />
      {p.status === "analyzing" && (
        <section className="panel">
          <h3>{t.ui108}</h3>
          {p.jobs.slice(0, 1).map((j: any) => (
            <div key={j.id}>
              <progress value={j.progress} max={p.total} />
              <p>
                {j.progress}
                {t.ui109}
                {p.total}
                {t.ui044}
                {j.status}
              </p>
              {j.error && <p className="alert">{j.error}</p>}
            </div>
          ))}
          <button
            onClick={() =>
              run(async () => {
                await api(`/projects/${p.id}/cancel`, "POST");
                await reload();
              })
            }
          >
            {t.ui110}
          </button>
        </section>
      )}
      <section className="panel">
        <div className="toolbar">
          <label className="search">
            <Search size={18} />
            <input
              aria-label={t.ui111}
              placeholder={t.ui112}
              value={search}
              onChange={(e) => S(e.target.value)}
            />
          </label>
          <select
            aria-label={t.ui113}
            value={sort}
            onChange={(e) => SS(e.target.value)}
          >
            {[
              "score",
              "institution",
              "district",
              "distance",
              "minutes",
              "post",
              "climate",
              "facilities",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select
            aria-label={t.ui114}
            value={direction}
            onChange={(e) => D(e.target.value)}
          >
            <option value="desc">{t.ui115}</option>
            <option value="asc">{t.ui116}</option>
          </select>
        </div>
        {compare ? (
          <>
            <div className="toolbar">
              <label>
                {t.ui117}
                <input
                  type="number"
                  min="1"
                  max={p.results.length}
                  value={n}
                  onChange={(e) => N(Number(e.target.value))}
                />
              </label>
              <button
                className="secondary"
                onClick={() =>
                  IDS(rows.slice(0, Math.max(0, n)).map((r: any) => r.id))
                }
              >
                {t.ui118}
                {n}
              </button>
              <span className="badge">
                {user.premium
                  ? "Full comparison"
                  : "Up to 3 · larger selections require Premium"}
              </span>
            </div>
            <div className="chips">
              {rows.map((r: any) => (
                <label key={r.id} className="check">
                  <input
                    type="checkbox"
                    checked={ids.includes(r.id)}
                    onChange={(e) =>
                      IDS(
                        e.target.checked
                          ? [...ids, r.id]
                          : ids.filter((i) => i !== r.id),
                      )
                    }
                  />
                  {r.institution}
                  {t.ui119}
                  {r.post}
                </label>
              ))}
            </div>
            <div className="table-scroll">
              <table className="comparison">
                <thead>
                  <tr>
                    <th>{t.ui120}</th>
                    {rows
                      .filter((r: any) => ids.includes(r.id))
                      .map((r: any) => (
                        <th key={r.id}>
                          {r.institution}
                          <small>{r.post}</small>
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    "score",
                    "coverage",
                    "district",
                    "travel",
                    "climate",
                    "facilities",
                  ].map((k) => (
                    <tr key={k}>
                      <th>{k}</th>
                      {rows
                        .filter((r: any) => ids.includes(r.id))
                        .map((r: any) => (
                          <td key={r.id}>{r[k] ?? r.scores[k] ?? "Unknown"}</td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t.ui121}</th>
                  <th>{t.ui122}</th>
                  <th>{t.ui123}</th>
                  <th>{t.ui124}</th>
                  <th>{t.ui125}</th>
                  <th>{t.ui126}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, i: number) => (
                  <tr key={r.id}>
                    <td>
                      <span className="rank">{i + 1}</span>
                    </td>
                    <td>
                      <strong>{r.institution}</strong>
                      <small>
                        {r.post}
                        {t.ui127}
                        {r.index || "—"}
                      </small>
                      {r.excluded && <span className="badge">{t.ui128}</span>}
                    </td>
                    <td>{r.district || "Unknown"}</td>
                    <td>
                      <strong className="score">{r.score ?? "Unscored"}</strong>
                      {r.provisional && <small>{t.ui129}</small>}
                    </td>
                    <td>
                      <div className="coverage">
                        <span style={{ width: r.coverage + "%" }} />
                      </div>
                      <small>
                        {r.coverage}
                        {t.ui130}
                      </small>
                    </td>
                    <td>
                      <details>
                        <summary>{t.ui131}</summary>
                        <p>{r.explanation}</p>
                        {Object.entries(r.scores).map(([k, v]: any) => (
                          <p key={k}>
                            {k}
                            {t.ui132}
                            {v === null ? "Unknown" : v.toFixed(1)}
                            {t.ui133}
                            {p.preferences.weights[k]}
                            {t.ui083}
                          </p>
                        ))}
                        {Object.entries(r.evidence).map(([k, v]: any) => (
                          <p key={k}>
                            <strong>{k}</strong>
                            {t.ui132}
                            {v.value != null
                              ? JSON.stringify(v.value)
                              : v.label}{" "}
                            {v.units}
                            <small>
                              {v.provider}{" "}
                              {v.retrievedAt ? date(v.retrievedAt) : ""}
                            </small>
                            {v.reference?.startsWith("https://") && (
                              <a
                                href={v.reference}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {t.ui134}
                              </a>
                            )}
                            {v.candidates?.map((c: any) => (
                              <button
                                key={c.placeId}
                                onClick={() =>
                                  run(async () => {
                                    await api(
                                      `/projects/${p.id}/location`,
                                      "POST",
                                      { optionId: r.id, ...c.location },
                                    );
                                    await reload();
                                  })
                                }
                              >
                                {t.ui102}
                                {c.label}
                              </button>
                            ))}
                          </p>
                        ))}
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <div className="empty">
                <BarChart3 size={36} />
                <h3>{t.ui135}</h3>
                <p>{t.ui136}</p>
              </div>
            )}
          </div>
        )}
        {!user.premium && p.total > p.results.length && (
          <div className="premium-panel">
            <ShieldCheck size={24} />
            <div>
              <h3>
                {p.total - p.results.length}
                {t.ui137}
              </h3>
              <p>{t.ui138}</p>
            </div>
          </div>
        )}
        <button className="primary" onClick={next}>
          {t.ui139}
          <ArrowRight size={16} />
        </button>
      </section>
    </>
  );
}
function Payments({ user, run }: any) {
  const [pub, PUB] = useState<any>(null);
  const [pricingError, PE] = useState("");
  const [payments, P] = useState<any[]>([]);
  useEffect(() => {
    api("/payments").then(P);
    api("/pricing")
      .then(PUB)
      .catch((e) => PE(e.message));
  }, []);
  if (!pub)
    return (
      <section className="panel">
        <h2>Complete your preview first</h2>
        <p>{pricingError || "Loading access details…"}</p>
        <p>
          Save your preferences, confirm your vacancy list, and finish analysis
          to view payment details.
        </p>
      </section>
    );
  return (
    <>
      <PageTitle eyebrow={t.ui140} title={t.ui141} text={t.ui142} />
      <div className="two-col">
        <section className="panel">
          <span className="badge">{t.ui143}</span>
          <h1>
            {t.ui018}
            {pub.price.toLocaleString()}
          </h1>
          <p>{t.ui144}</p>
          <p>
            {t.ui145}
            {user.premium
              ? "Active until " + date(user.premiumUntil)
              : "Free preview"}
          </p>
          <h3>{t.ui146}</h3>
          <pre className="bank">
            {pub.bank ||
              "Bank instructions are not configured. Please contact the administrator before making a payment."}
          </pre>
        </section>
        <section className="panel">
          <h2>{t.ui147}</h2>
          <p>{t.ui148}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(async () => {
                await api("/payments", "POST", f);
                P(await api("/payments"));
              });
            }}
          >
            <label>
              {t.ui149}
              <input
                type="file"
                name="file"
                accept=".png,.jpg,.jpeg,.pdf"
                required
              />
            </label>
            <button className="primary" disabled={!pub.bank}>
              {t.ui150}
            </button>
          </form>
          {payments.map((x) => (
            <div className="list-row" key={x.id}>
              <div>
                <strong>{x.status}</strong>
                <small>
                  {date(x.created_at)}
                  {t.ui119}
                  {x.notes || "Awaiting manual review"}
                </small>
              </div>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
function Editor({ p, user, run, reload }: any) {
  const [order, O] = useState<string[]>(p.order),
    [excluded, EX] = useState<string[]>(p.manualExcluded || []),
    [undo, UN] = useState<string[][]>([]),
    [redo, RE] = useState<string[][]>([]),
    [saved, SA] = useState("Saved"),
    [search, S] = useState(""),
    [proposal, PR] = useState<any>(null),
    [message, ME] = useState("");
  useEffect(() => {
    O(p.order);
    EX(p.manualExcluded || []);
  }, [p.revision]);
  const change = (ids: string[], ex = excluded) => {
    UN([...undo, order]);
    RE([]);
    O(ids);
    EX(ex);
    SA("Saving…");
    run(async () => {
      try {
        await api(`/projects/${p.id}/order`, "PUT", {
          order: ids,
          excluded: ex,
          revision: p.revision,
        });
        await reload();
        SA("Saved");
      } catch (e) {
        SA("Save failed — reload to recover the latest server version");
        throw e;
      }
    });
  };
  const move = (id: string, to: number) => {
    const next = order.filter((x) => x !== id);
    next.splice(Math.max(0, Math.min(next.length, to)), 0, id);
    change(next);
  };
  if (!user.premium)
    return (
      <div className="empty">
        <ShieldCheck size={42} />
        <h1>{t.ui151}</h1>
        <p>{t.ui152}</p>
      </div>
    );
  return (
    <>
      <PageTitle eyebrow={t.ui153} title={t.ui154} text={t.ui155} />
      <div className="editor-grid">
        <section className="panel pinned">
          <h2>{t.ui156}</h2>
          {order.slice(0, 3).map((id) => {
            const r = p.results.find((r: any) => r.id === id);
            return r ? (
              <article className="mini-option" key={id}>
                <h3>{r.institution}</h3>
                <p>{r.post}</p>
                <strong>{r.score ?? "Unscored"}</strong>
                <small>
                  {r.coverage}
                  {t.ui157}
                  {r.district}
                </small>
              </article>
            ) : null;
          })}
          <h3>{t.ui158}</h3>
          <p className="hint">{t.ui159}</p>
          <textarea
            aria-label={t.ui160}
            value={message}
            onChange={(e) => ME(e.target.value)}
            placeholder={t.ui161}
          />
          <button
            className="secondary"
            onClick={() =>
              run(async () =>
                PR(await api(`/projects/${p.id}/chat`, "POST", { message })),
              )
            }
          >
            {t.ui162}
          </button>
          {proposal && (
            <div className="info-panel">
              <div>
                <p>{proposal.message || proposal.explanation}</p>
                {proposal.weights && (
                  <div>
                    <h3>Proposed weights</h3>
                    {Object.entries(proposal.weights).map(([k, v]: any) => (
                      <p key={k}>
                        {k}: {v}%
                      </p>
                    ))}
                    <button
                      disabled={
                        proposal.revision !== p.revision || !!p.finalizedId
                      }
                      onClick={() =>
                        run(async () => {
                          await api(`/projects/${p.id}/ai/apply`, "POST", {
                            revision: proposal.revision,
                            weights: proposal.weights,
                          });
                          await reload();
                          PR(null);
                        })
                      }
                    >
                      Apply proposed weights
                    </button>
                  </div>
                )}
                {proposal.order && (
                  <>
                    <ol>
                      {proposal.order.map((id: string) => (
                        <li key={id}>
                          {p.results.find((r: any) => r.id === id)?.institution}
                        </li>
                      ))}
                    </ol>
                    <button
                      disabled={
                        proposal.revision !== p.revision || !!p.finalizedId
                      }
                      onClick={() => change(proposal.order)}
                    >
                      {t.ui163}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>
              {order.length}
              {t.ui164}
            </h2>
            <span role="status" className="badge">
              {saved}
            </span>
          </div>
          {p.finalizedId ? (
            <div className="success">
              {t.ui165}
              <button
                onClick={() =>
                  run(async () => {
                    await api(`/projects/${p.id}/reopen`, "POST", {
                      revision: p.revision,
                    });
                    await reload();
                  })
                }
              >
                {t.ui166}
              </button>
            </div>
          ) : (
            <div className="toolbar">
              <button
                disabled={!undo.length}
                onClick={() => {
                  const last = undo.at(-1)!;
                  const old = order;
                  change(last);
                  UN(undo.slice(0, -1));
                  RE([...redo, old]);
                }}
              >
                {t.ui167}
              </button>
              <button
                disabled={!redo.length}
                onClick={() => {
                  const last = redo.at(-1)!;
                  change(last);
                  RE(redo.slice(0, -1));
                }}
              >
                {t.ui168}
              </button>
              <button
                onClick={() => {
                  if (
                    confirm(
                      "Replace your manually edited order with the current system ranking?",
                    )
                  )
                    change(p.results.map((r: any) => r.id));
                }}
              >
                {t.ui169}
              </button>
            </div>
          )}
          <input
            aria-label={t.ui170}
            placeholder={t.ui171}
            value={search}
            onChange={(e) => S(e.target.value)}
          />
          {order.map((id, i) => {
            const r = p.results.find((r: any) => r.id === id);
            if (
              !r ||
              !(r.institution + " " + r.post)
                .toLowerCase()
                .includes(search.toLowerCase())
            )
              return null;
            return (
              <div
                key={id}
                className="order-row"
                draggable={!p.finalizedId}
                onDragStart={(e) => e.dataTransfer.setData("text/plain", id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  if (order.includes(id) && !p.finalizedId) move(id, i);
                }}
              >
                <span className="rank">{i + 1}</span>
                <div className="order-name">
                  <strong>{r.institution}</strong>
                  <small>
                    {r.post}
                    {t.ui172}
                    {r.index}
                  </small>
                  <label className="check">
                    <input
                      type="checkbox"
                      disabled={!!p.finalizedId}
                      checked={excluded.includes(id)}
                      onChange={(e) =>
                        change(
                          order,
                          e.target.checked
                            ? [...excluded, id]
                            : excluded.filter((x) => x !== id),
                        )
                      }
                    />
                    {t.ui173}
                  </label>
                </div>
                <div className="move-controls">
                  <button
                    aria-label={"Move up " + r.institution}
                    disabled={i === 0 || !!p.finalizedId}
                    onClick={() => move(id, i - 1)}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    aria-label={"Move down " + r.institution}
                    disabled={i === order.length - 1 || !!p.finalizedId}
                    onClick={() => move(id, i + 1)}
                  >
                    <ChevronDown size={16} />
                  </button>
                  <input
                    aria-label={"Move " + r.institution + " to position"}
                    type="number"
                    min="1"
                    max={order.length}
                    defaultValue={i + 1}
                    key={i}
                    disabled={!!p.finalizedId}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (
                        Number.isInteger(n) &&
                        n !== i + 1 &&
                        n >= 1 &&
                        n <= order.length
                      )
                        move(id, n - 1);
                    }}
                  />
                  <button
                    disabled={!!p.finalizedId || i === order.length - 1}
                    onClick={() => {
                      const next = [...order];
                      [next[i], next[i + 1]] = [next[i + 1], next[i]];
                      change(next);
                    }}
                  >
                    {t.ui174}
                  </button>
                </div>
              </div>
            );
          })}
          <div className="export-panel">
            <h3>
              {order.length - excluded.length}
              {t.ui175}
            </h3>
            <p>
              {excluded.length}
              {t.ui176}
            </p>
            {p.finalizedId ? (
              <>
                <a
                  className="primary button"
                  href={`/api/projects/${p.id}/export`}
                >
                  <Download size={17} />
                  {t.ui177}
                </a>
                <a
                  className="secondary button"
                  href={`/api/projects/${p.id}/export?analysis=1`}
                >
                  {t.ui178}
                </a>
              </>
            ) : (
              <button
                className="primary"
                onClick={() => {
                  if (
                    confirm(
                      `Finalize ${order.length - excluded.length} preferences?`,
                    )
                  )
                    run(async () => {
                      await api(`/projects/${p.id}/finalize`, "POST", {
                        revision: p.revision,
                      });
                      await reload();
                    });
                }}
              >
                {t.ui179}
                <Check size={17} />
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
function Admin({ run }: any) {
  const [a, A] = useState<any>(null),
    [notes, N] = useState("");
  const reload = async () => A(await api("/admin"));
  useEffect(() => {
    run(reload);
  }, []);
  if (!a) return <p>{t.ui180}</p>;
  return (
    <>
      <PageTitle eyebrow={t.ui181} title={t.ui182} text={t.ui183} />
      <section className="panel">
        <h2>{t.ui184}</h2>
        <label>
          {t.ui185}
          <textarea value={notes} onChange={(e) => N(e.target.value)} />
        </label>
        {a.payments.map((p: any) => (
          <div className="list-row" key={p.id}>
            <div>
              <strong>{p.email}</strong>
              <small>
                {p.status}
                {t.ui119}
                {date(p.created_at)}
                {t.ui186}
                {date(p.premium_until)}
              </small>
              <p>{p.notes}</p>
            </div>
            <a
              href={"/api/files/" + p.file_id}
              target="_blank"
              rel="noreferrer"
            >
              {t.ui187}
            </a>
            {p.status === "pending" && (
              <>
                <button
                  className="primary"
                  onClick={() =>
                    run(async () => {
                      await api("/admin/payments/" + p.id, "POST", {
                        status: "approved",
                        notes,
                      });
                      await reload();
                    })
                  }
                >
                  {t.ui188}
                </button>
                <button
                  className="danger"
                  onClick={() =>
                    run(async () => {
                      await api("/admin/payments/" + p.id, "POST", {
                        status: "rejected",
                        notes,
                      });
                      await reload();
                    })
                  }
                >
                  {t.ui189}
                </button>
              </>
            )}
          </div>
        ))}
        {!a.payments.length && <p>{t.ui190}</p>}
      </section>
      <div className="two-col">
        <section className="panel">
          <h2>{t.ui191}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await api("/admin/settings", "PUT", a.settings);
                await reload();
              });
            }}
          >
            {Object.entries(a.settings).map(([k, v]: any) => (
              <label key={k}>
                {k}
                {k === "bank" ? (
                  <textarea
                    value={v}
                    onChange={(e) =>
                      A({
                        ...a,
                        settings: { ...a.settings, [k]: e.target.value },
                      })
                    }
                  />
                ) : (
                  <input
                    type="number"
                    value={v}
                    min="1"
                    onChange={(e) =>
                      A({
                        ...a,
                        settings: {
                          ...a.settings,
                          [k]: Number(e.target.value),
                        },
                      })
                    }
                  />
                )}
              </label>
            ))}
            <button className="primary">{t.ui192}</button>
          </form>
        </section>
        <section className="panel">
          <h2>{t.ui193}</h2>
          {Object.entries(a.providers).map(([k, v]) => (
            <div className="list-row" key={k}>
              <strong>{k}</strong>
              <span className="badge">
                {v ? "Configured · not a live test" : "Not configured"}
              </span>
            </div>
          ))}
          <h2>{t.ui194}</h2>
          {a.jobs.map((j: any) => (
            <div className="list-row" key={j.id}>
              <div>
                {j.status}
                {t.ui119}
                {j.progress}
                {t.ui195}
                <small>{j.error}</small>
              </div>
              {["failed", "cancelled"].includes(j.status) && (
                <button
                  onClick={() =>
                    run(async () => {
                      await api("/admin/jobs/" + j.id + "/retry", "POST");
                      await reload();
                    })
                  }
                >
                  {t.ui196}
                </button>
              )}
            </div>
          ))}
        </section>
      </div>
      <section className="panel">
        <h2>{t.ui197}</h2>
        {a.audit.map((e: any) => (
          <div className="list-row" key={e.id}>
            <span>{e.event}</span>
            <small>
              {e.subject}
              {t.ui119}
              {date(e.created_at)}
            </small>
          </div>
        ))}
      </section>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
