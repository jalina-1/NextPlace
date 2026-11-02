import Link from "next/link";
import { t } from "@/lib/i18n";

const STEPS = [
  { n: 1, title: "Set your preferences", body: "Rank the posts you want, mark places to avoid, choose how you travel and how important travel time, climate and nearby schools are to you." },
  { n: 2, title: "Upload your vacancy list", body: "Excel, CSV or PDF. You confirm the columns and check the rows — nothing is guessed silently, and your original INDEX values are kept." },
  { n: 3, title: "Evidence, not guesses", body: "Institutions are matched to locations (you confirm unclear ones). Travel estimates, climate and facility data come with their source and date. Unknown stays unknown." },
  { n: 4, title: "Explainable ranking", body: "Every score shows its breakdown and how much of it is backed by evidence. You decide the weights; changing them never repeats paid lookups." },
  { n: 5, title: "Compare and reorder", body: "Compare options side by side, drag to reorder, and ask the assistant to propose changes you approve before anything is applied." },
  { n: 6, title: "Download your final list", body: "Export your final order to Excel with your original columns plus a Preference Rank column, and an optional analysis sheet." },
];

export default function Landing() {
  return (
    <div>
      <section className="bg-navy-900 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:py-24 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="mb-3 text-sm font-medium uppercase tracking-wider text-teal-100">For doctors in Sri Lanka</p>
            <h1 className="text-3xl font-semibold leading-tight sm:text-5xl">{t("landing.hero.title")}</h1>
            <p className="mt-5 max-w-xl text-base text-navy-100 sm:text-lg">{t("landing.hero.body")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className="rounded-lg bg-teal-500 px-5 py-3 font-medium text-navy-950 hover:bg-teal-100">
                {t("landing.cta.primary")}
              </Link>
              <Link href="/login" className="rounded-lg border border-white/30 px-5 py-3 font-medium hover:bg-white/10">
                {t("landing.cta.secondary")}
              </Link>
            </div>
          </div>
          <div className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10" aria-hidden>
            <div className="space-y-3">
              {[
                ["Teaching Hospital — Medical Officer (OPD)", "86.4", "100%"],
                ["Base Hospital — Medical Officer (ETU)", "79.1", "90%"],
                ["District General Hospital — MO (OPD)", "74.8", "100%"],
              ].map(([name, s, c], i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-white/10 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{name}</p>
                    <p className="text-xs text-navy-100">Evidence coverage {c}</p>
                  </div>
                  <span className="text-xl font-semibold text-teal-100">{s}</span>
                </div>
              ))}
              <p className="text-center text-xs text-navy-100">Illustration only</p>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-14">
        <h2 className="text-2xl font-semibold text-navy-900">{t("landing.steps.title")}</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-xl border border-navy-100 bg-white p-5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-800">{s.n}</span>
              <h3 className="mt-3 font-semibold text-navy-900">{s.title}</h3>
              <p className="mt-1 text-sm text-navy-700">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="mx-auto max-w-7xl px-4">
        <div className="grid gap-6 rounded-2xl border border-teal-100 bg-teal-50 p-6 sm:p-10 lg:grid-cols-[2fr_1fr] lg:items-center">
          <div>
            <h2 className="text-xl font-semibold text-navy-900">{t("landing.free.title")}</h2>
            <p className="mt-2 text-navy-800">{t("landing.free.body")}</p>
          </div>
          <div className="lg:text-right">
            <Link href="/register" className="inline-block rounded-lg bg-teal-700 px-5 py-3 font-medium text-white hover:bg-teal-800">
              {t("landing.cta.primary")}
            </Link>
          </div>
        </div>
        <div className="mt-8 grid gap-4 text-sm text-navy-800 sm:grid-cols-3">
          <div className="rounded-xl bg-white p-5 ring-1 ring-navy-100">
            <h3 className="font-semibold">Private by design</h3>
            <p className="mt-1">An approximate home town is enough. Uploaded files and receipts are stored privately and can be deleted.</p>
          </div>
          <div className="rounded-xl bg-white p-5 ring-1 ring-navy-100">
            <h3 className="font-semibold">Honest about gaps</h3>
            <p className="mt-1">We never invent bus schedules, quarters, workload or eligibility. Missing data is shown as unknown.</p>
          </div>
          <div className="rounded-xl bg-white p-5 ring-1 ring-navy-100">
            <h3 className="font-semibold">You stay in control</h3>
            <p className="mt-1">{t("landing.disclaimer")}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
