"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Heart, Ban, Plus, X, Info } from "lucide-react";
import { api } from "@/lib/client/api";
import { usePrefs } from "@/lib/client/usePrefs";
import { StepPage, Question } from "@/components/StepPage";
import { Alert, Button, Select, Spinner, cx } from "@/components/ui";
import { DISTRICTS } from "@/lib/places";

function Picker({ id, label, options, values, onChange, tone, placeholder }: { id: string; label: string; options: string[]; values: string[]; onChange: (v: string[]) => void; tone: "teal" | "red"; placeholder: string }) {
  const [pick, setPick] = useState("");
  const available = options.filter((o) => !values.includes(o));
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-navy-900">{label}</p>
      <div className="flex gap-2">
        <Select id={id} aria-label={label} value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1">
          <option value="">{placeholder}</option>
          {available.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="secondary"
          disabled={!pick}
          onClick={() => {
            onChange([...values, pick]);
            setPick("");
          }}
        >
          <Plus size={16} /> Add
        </Button>
      </div>
      {values.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {values.map((v) => (
            <li key={v} className={cx("inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-sm font-medium", tone === "teal" ? "bg-teal-100 text-teal-800" : "bg-red-100 text-red-800")}>
              {v}
              <button type="button" aria-label={`Remove ${v}`} className="rounded-full p-0.5 hover:bg-white/70" onClick={() => onChange(values.filter((x) => x !== v))}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PlacesStep() {
  const { id } = useParams<{ id: string }>();
  const { prefs, update, save, saving, otherStepProblem, loadError } = usePrefs(id, "places");
  const [fromFile, setFromFile] = useState<{ institutions: string[]; districts: string[] }>({ institutions: [], districts: [] });
  useEffect(() => {
    api<{ institutions: string[]; districts: string[] }>(`/api/projects/${id}/designations`).then(setFromFile);
  }, [id]);
  if (loadError) return <Alert tone="error">{loadError}</Alert>;
  if (!prefs) return <Spinner />;
  const districts = Array.from(new Set([...DISTRICTS, ...fromFile.districts])).sort((a, b) => a.localeCompare(b, "en"));
  return (
    <StepPage projectId={id} step="places" title="Any places you like — or can’t go to?" intro="Both questions are optional. Skip them if you have no strong feelings." onNext={save} busy={saving} problem={otherStepProblem}>
      <Question
        field="preferred"
        optional
        title={
          <span className="inline-flex items-center gap-2">
            <Heart size={20} className="text-teal-700" /> Places you would like
          </span>
        }
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Picker id="pd" label="Districts" placeholder="Choose a district" options={districts} values={prefs.preferredDistricts} onChange={(v) => update({ preferredDistricts: v })} tone="teal" />
          <Picker id="pi" label="Hospitals" placeholder="Choose a hospital from your list" options={fromFile.institutions} values={prefs.preferredInstitutions} onChange={(v) => update({ preferredInstitutions: v })} tone="teal" />
        </div>
        {!prefs.criteria.location.enabled && (prefs.preferredDistricts.length > 0 || prefs.preferredInstitutions.length > 0) && (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <Info size={16} className="mt-0.5 shrink-0" />
            <span>
              These places don&apos;t change your scores yet. To give them extra points, turn on “Places I like” in{" "}
              <Link className="font-semibold underline" href={`/projects/${id}/weights`}>What matters most</Link>.
            </span>
          </p>
        )}
      </Question>

      <Question
        field="excluded"
        optional
        title={
          <span className="inline-flex items-center gap-2">
            <Ban size={20} className="text-red-700" /> Places you can never go to
          </span>
        }
        hint="These are not deleted. They always stay at the very bottom of your list, below everything else."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Picker id="ed" label="Districts" placeholder="Choose a district" options={districts} values={prefs.excludedDistricts} onChange={(v) => update({ excludedDistricts: v })} tone="red" />
          <Picker id="ei" label="Hospitals" placeholder="Choose a hospital from your list" options={fromFile.institutions} values={prefs.excludedInstitutions} onChange={(v) => update({ excludedInstitutions: v })} tone="red" />
        </div>
      </Question>
    </StepPage>
  );
}
