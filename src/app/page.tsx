import Link from "next/link";
import { ArrowRight, Check, Compass } from "lucide-react";
import { t } from "@/lib/i18n";

const STEPS = [
  { n: "01", title: "Tell us what matters", body: "Upload your vacancy list, then answer a few simple questions about posts, travel, weather and what you need nearby." },
  { n: "02", title: "Make sense of your options", body: "Every option gets a clear score. You can see exactly why — with the source of every fact, and “unknown” where we don’t know." },
  { n: "03", title: "Make the list your own", body: "Compare options, put them in your own order and download your final list as Excel." },
];

export default function Landing() {
  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="grid gap-12 py-14 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <div>
          <p className="eyebrow">Your next chapter, thoughtfully planned</p>
          <h1 className="mt-5 text-5xl font-extrabold leading-[1.05] text-navy-950 sm:text-6xl">
            The right posting.
            <br />
            <span className="text-teal-700">For your life.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-navy-700">
            Turn a long vacancy list into a considered choice. Compare your options, understand the trade-offs, and build your transfer preference list with confidence.
          </p>
          <Link href="/register" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-4 font-semibold text-white shadow-sm hover:bg-teal-800">
            Start your preference list <ArrowRight size={18} />
          </Link>
          <p className="mt-4 text-sm text-navy-700">Made for doctors in Sri Lanka · See your top three options free</p>
        </div>
        <div className="relative mx-auto w-full max-w-md" aria-hidden>
          <div className="absolute inset-0 translate-x-3 translate-y-4 rotate-2 rounded-[2rem] bg-navy-100" />
          <div className="relative -rotate-2 rounded-[2rem] border border-teal-100 bg-teal-50 p-8">
            <p className="eyebrow">A little more clarity</p>
            <p className="font-display mt-4 text-3xl font-bold leading-tight text-navy-950">
              Your priorities.
              <br />
              Your direction.
            </p>
            <div className="my-8 flex justify-center text-teal-700">
              <Compass size={110} strokeWidth={0.9} />
            </div>
            {["A posting that fits your goals", "A journey that works for you", "Evidence behind every score"].map((x) => (
              <p key={x} className="mt-2 flex items-center gap-3 text-sm text-navy-800">
                <Check size={18} className="text-teal-700" /> {x}
              </p>
            ))}
            <span className="mt-6 inline-block rounded-full border border-teal-100 bg-white px-3 py-1 text-xs font-semibold text-teal-800">Explainable by design</span>
          </div>
        </div>
      </section>
      <section className="grid gap-8 border-t border-navy-100 py-14 md:grid-cols-3" aria-label={t("landing.steps.title")}>
        {STEPS.map((s) => (
          <article key={s.n}>
            <p className="text-sm text-navy-700">{s.n}</p>
            <h2 className="mt-3 text-lg font-bold text-navy-950">{s.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-navy-700">{s.body}</p>
          </article>
        ))}
      </section>
      <section className="rounded-3xl bg-navy-900 px-6 py-10 text-white sm:px-12">
        <div className="grid gap-6 md:grid-cols-[2fr_1fr] md:items-center">
          <div>
            <h2 className="text-2xl font-bold">Start free</h2>
            <p className="mt-2 text-navy-100">{t("landing.free.body")}</p>
          </div>
          <div className="md:text-right">
            <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-navy-950 hover:bg-teal-50">
              {t("landing.cta.primary")} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
