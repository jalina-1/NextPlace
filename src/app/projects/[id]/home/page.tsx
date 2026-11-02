"use client";
import { useParams } from "next/navigation";
import { Bus, Car, Shuffle, CalendarDays, CalendarRange, CalendarClock } from "lucide-react";
import { usePrefs } from "@/lib/client/usePrefs";
import { StepPage, Question, Choices } from "@/components/StepPage";
import { Alert, Select, Spinner } from "@/components/ui";
import { DISTRICT_TOWNS } from "@/lib/places";
import type { Place, Preferences } from "@/lib/preferences";

/** "Longest journey" choices. Comfortable time and distances are derived so the user never sees thresholds. */
const JOURNEYS = [
  { value: 60, label: "Up to 1 hour" },
  { value: 120, label: "Up to 2 hours" },
  { value: 180, label: "Up to 3 hours" },
  { value: 300, label: "More than 3 hours is fine" },
];

function travelFor(maxMinutes: number): Preferences["travel"] {
  return {
    maxMinutes,
    idealMinutes: Math.round(maxMinutes / 3),
    maxKm: Math.round(maxMinutes * 0.8),
    idealKm: Math.round((maxMinutes * 0.8) / 3),
  };
}

function TownSelect({ id, value, onChange, placeholder }: { id: string; value: Place | null; onChange: (p: Place | null) => void; placeholder: string }) {
  const town = DISTRICT_TOWNS.find((t) => value && t.lat === value.lat && t.lng === value.lng);
  return (
    <Select
      id={id}
      aria-label={placeholder}
      value={town?.town ?? (value ? "__pin" : "")}
      onChange={(e) => {
        const t = DISTRICT_TOWNS.find((x) => x.town === e.target.value);
        onChange(t ? { label: t.town, lat: t.lat, lng: t.lng } : null);
      }}
      className="py-3 text-base"
    >
      <option value="">{placeholder}</option>
      {DISTRICT_TOWNS.map((t) => (
        <option key={t.town} value={t.town}>
          {t.town}
        </option>
      ))}
      {value && !town && <option value="__pin">{value.label}</option>}
    </Select>
  );
}

export default function HomeStep() {
  const { id } = useParams<{ id: string }>();
  const { prefs, update, errors, save, saving, otherStepProblem, loadError } = usePrefs(id, "home");
  if (loadError) return <Alert tone="error">{loadError}</Alert>;
  if (!prefs) return <Spinner />;
  const journey = JOURNEYS.find((j) => j.value === prefs.travel.maxMinutes)?.value ?? null;
  return (
    <StepPage projectId={id} step="home" title="Where do you live, and how do you travel?" intro="This tells us how far each hospital is from you." onNext={save} busy={saving} problem={otherStepProblem}>
      <Question field="home" title="Which town do you live in (or closest to)?" hint="A nearby town is enough. We never ask for your address." error={errors.home}>
        <TownSelect id="home" value={prefs.home} placeholder="Choose your town" onChange={(p) => update({ home: p })} />
      </Question>

      <Question field="travelMode" title="How do you usually travel?">
        <Choices
          label="How do you usually travel?"
          value={prefs.travelMode}
          onChange={(v) => update({ travelMode: v })}
          options={[
            { value: "driving", label: "My own vehicle", icon: <Car size={22} /> },
            { value: "public", label: "Bus or train", icon: <Bus size={22} /> },
            { value: "mixed", label: "Both", icon: <Shuffle size={22} /> },
          ]}
        />
      </Question>

      <Question field="travelFrequency" title="How often will you travel home?">
        <Choices
          label="How often will you travel home?"
          value={prefs.travelFrequency}
          onChange={(v) => update({ travelFrequency: v })}
          options={[
            { value: "daily", label: "Every day", icon: <CalendarDays size={22} /> },
            { value: "weekly", label: "Every week", icon: <CalendarRange size={22} /> },
            { value: "occasional", label: "Now and then", icon: <CalendarClock size={22} /> },
          ]}
        />
      </Question>

      <Question field="travel.maxMinutes" title="What is the longest journey you would accept?" hint="Closer places get more points. Places further than this get the fewest." error={errors["travel.maxMinutes"]}>
        <Choices label="Longest journey" columns={4} value={journey} onChange={(v) => update({ travel: travelFor(v) }, ["travel"])} options={JOURNEYS} />
      </Question>

      <Question field="secondLocation" optional title="Is there a second place we should consider?" hint="For example your partner’s or child’s town. Leave it empty if not.">
        <TownSelect id="second" value={prefs.secondLocation} placeholder="No second place" onChange={(p) => update({ secondLocation: p })} />
      </Question>
    </StepPage>
  );
}
