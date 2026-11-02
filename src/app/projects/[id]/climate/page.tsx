"use client";
import { useParams } from "next/navigation";
import { Snowflake, Sun, ThermometerSun, Minus, Droplets, CloudRain, School, ShoppingCart, Pill, Landmark, Home, House } from "lucide-react";
import { usePrefs } from "@/lib/client/usePrefs";
import { StepPage, Question, Choices } from "@/components/StepPage";
import { Alert, Spinner, cx } from "@/components/ui";
import type { Preferences } from "@/lib/preferences";

const FACILITIES: { key: "schools" | "shops" | "pharmacies" | "banks"; label: string; icon: React.ReactNode }[] = [
  { key: "schools", label: "Schools", icon: <School size={18} /> },
  { key: "shops", label: "Shops & supermarkets", icon: <ShoppingCart size={18} /> },
  { key: "pharmacies", label: "Pharmacies", icon: <Pill size={18} /> },
  { key: "banks", label: "Banks", icon: <Landmark size={18} /> },
];
const LEVELS = [
  { value: 0, label: "Not needed" },
  { value: 1, label: "Nice to have" },
  { value: 3, label: "Important" },
];

export default function ClimateStep() {
  const { id } = useParams<{ id: string }>();
  const { prefs, update, errors, save, saving, otherStepProblem, loadError } = usePrefs(id, "climate");
  if (loadError) return <Alert tone="error">{loadError}</Alert>;
  if (!prefs) return <Spinner />;
  const setFacility = (k: (typeof FACILITIES)[number]["key"], v: number) => update({ facilities: { ...prefs.facilities, [k]: v } });
  const rental = prefs.rental;
  const setRental = (r: Partial<Preferences["rental"]>) => update({ rental: { ...rental, ...r } }, ["rental"]);
  return (
    <StepPage projectId={id} step="climate" title="Weather, things nearby, and a place to live" intro="Tell us what would make daily life easier." onNext={save} busy={saving} problem={otherStepProblem}>
      <Question field="climate.temperature" title="What kind of weather do you prefer?">
        <Choices
          label="Weather"
          columns={4}
          value={prefs.climate.temperature}
          onChange={(v) => update({ climate: { ...prefs.climate, temperature: v } })}
          options={[
            { value: "cooler", label: "Cool", hint: "Hill country", icon: <Snowflake size={22} /> },
            { value: "moderate", label: "Mild", hint: "Not too hot", icon: <ThermometerSun size={22} /> },
            { value: "warmer", label: "Warm", hint: "Coastal / dry zone", icon: <Sun size={22} /> },
            { value: "any", label: "No preference", icon: <Minus size={22} /> },
          ]}
        />
      </Question>

      <Question field="climate.rainfall" title="How do you feel about rain?">
        <Choices
          label="Rain"
          value={prefs.climate.rainfall}
          onChange={(v) => update({ climate: { ...prefs.climate, rainfall: v } })}
          options={[
            { value: "drier", label: "Less rain is better", icon: <Droplets size={22} /> },
            { value: "wetter", label: "I like the rain", icon: <CloudRain size={22} /> },
            { value: "any", label: "No preference", icon: <Minus size={22} /> },
          ]}
        />
      </Question>

      <Question field="facilities" title="What would you like close by?" hint={`We count these within ${prefs.facilities.radiusKm} km of each hospital. This says nothing about school admission.`}>
        <ul className="space-y-3">
          {FACILITIES.map((f) => (
            <li key={f.key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-2 font-medium text-navy-950">
                <span className="text-teal-700">{f.icon}</span> {f.label}
              </span>
              <div role="radiogroup" aria-label={f.label} className="inline-flex rounded-xl bg-navy-50 p-1">
                {LEVELS.map((l) => {
                  const cur = prefs.facilities[f.key] >= 2 ? 3 : prefs.facilities[f.key];
                  const on = cur === l.value;
                  return (
                    <button key={l.value} type="button" role="radio" aria-checked={on} onClick={() => setFacility(f.key, l.value)} className={cx("rounded-lg px-3 py-1.5 text-sm font-medium", on ? "bg-white text-teal-800 shadow-sm" : "text-navy-700 hover:text-navy-950")}>
                      {l.label}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </Question>

      <Question field="rental" title="Do you need a house to rent?">
        <Choices
          label="Looking for a house to rent"
          columns={2}
          value={rental.looking ? "yes" : "no"}
          onChange={(v) => setRental({ looking: v === "yes" })}
          options={[
            { value: "yes", label: "Yes", icon: <Home size={22} /> },
            { value: "no", label: "No", icon: <House size={22} /> },
          ]}
        />
      </Question>
    </StepPage>
  );
}
