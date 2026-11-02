"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, errMsg } from "@/lib/client/api";
import { Alert, Badge, Button, Card, Field, Input, Select, Spinner, Textarea, cx } from "@/components/ui";
import { CRITERIA, normalizeWeights, TRAVEL_DEFAULTS, validateWeights, type CriterionKey, type Preferences, type Place } from "@/lib/preferences";
import { DISTRICT_TOWNS, DISTRICTS } from "@/lib/places";
import { FACILITY_TARGETS } from "@/lib/scoring";
import { WeightsEditor } from "@/components/WeightsEditor";

const STEPS = ["Home & travel", "Posts", "Places", "Climate & facilities", "Requirements", "Weights"] as const;


function ListEditor({ label, values, onChange, placeholder, ordered, suggestions, id }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string; ordered?: boolean; suggestions?: string[]; id: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  };
  const move = (i: number, d: number) => {
    const n = [...values];
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
  };
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-navy-900">{label}</label>
      <div className="flex gap-2">
        <Input id={id} list={suggestions ? `${id}-list` : undefined} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
        {suggestions && <datalist id={`${id}-list`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
        <Button type="button" variant="secondary" onClick={add}>Add</Button>
      </div>
      {values.length > 0 && (
        <ol className="space-y-1">
          {values.map((v, i) => (
            <li key={v} className="flex items-center gap-2 rounded-lg bg-navy-50 px-3 py-1.5 text-sm">
              {ordered && <span className="tabular w-6 font-semibold text-teal-800">{i + 1}.</span>}
              <span className="flex-1">{v}</span>
              {ordered && (
                <>
                  <button type="button" className="rounded px-1 hover:bg-white" aria-label={`Move ${v} up`} onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                  <button type="button" className="rounded px-1 hover:bg-white" aria-label={`Move ${v} down`} onClick={() => move(i, 1)} disabled={i === values.length - 1}>↓</button>
                </>
              )}
              <button type="button" className="rounded px-1 text-red-700 hover:bg-white" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>✕</button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PlacePicker({ value, onChange, label, id }: { value: Place | null; onChange: (p: Place | null) => void; label: string; id: string }) {
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const town = DISTRICT_TOWNS.find((t) => value && t.lat === value.lat && t.lng === value.lng);
  return (
    <div className="space-y-2">
      <Field label={label} htmlFor={id} hint="An approximate town is enough. We never need your exact address.">
        <Select
          id={id}
          value={town ? town.town : value ? "__custom" : ""}
          onChange={(e) => {
            const t = DISTRICT_TOWNS.find((x) => x.town === e.target.value);
            if (t) onChange({ label: t.town, lat: t.lat, lng: t.lng });
            else if (e.target.value === "") onChange(null);
          }}
        >
          <option value="">Not set</option>
          {DISTRICT_TOWNS.map((t) => <option key={t.town} value={t.town}>{t.town} (district centre)</option>)}
          {value && !town && <option value="__custom">{value.label} (pin)</option>}
        </Select>
      </Field>
      <details className="text-sm">
        <summary className="cursor-pointer text-teal-800">Use a map pin or coordinates instead</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Input aria-label="Label" placeholder="Label, e.g. Peradeniya" defaultValue={value?.label} id={`${id}-label`} />
          <Input aria-label="Latitude" placeholder="Latitude (e.g. 7.27)" inputMode="decimal" defaultValue={value?.lat} id={`${id}-lat`} />
          <Input aria-label="Longitude" placeholder="Longitude (e.g. 80.60)" inputMode="decimal" defaultValue={value?.lng} id={`${id}-lng`} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              const lbl = (document.getElementById(`${id}-label`) as HTMLInputElement).value || "Pinned location";
              const lat = Number((document.getElementById(`${id}-lat`) as HTMLInputElement).value);
              const lng = Number((document.getElementById(`${id}-lng`) as HTMLInputElement).value);
              if (lat >= 5.5 && lat <= 10.2 && lng >= 79.3 && lng <= 82.2) onChange({ label: lbl, lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 });
              else setGeoMsg("Coordinates must be within Sri Lanka.");
            }}
          >
            Use these coordinates
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              navigator.geolocation?.getCurrentPosition(
                (p) => onChange({ label: "Approximate current location", lat: Math.round(p.coords.latitude * 100) / 100, lng: Math.round(p.coords.longitude * 100) / 100 }),
                () => setGeoMsg("Location permission was not granted."),
              )
            }
          >
            Use my approximate current location
          </Button>
        </div>
        <p className="mt-1 text-xs text-navy-700">Coordinates are rounded to about 1 km.</p>
        {geoMsg && <p className="text-xs text-red-700">{geoMsg}</p>}
      </details>
    </div>
  );
}

function Importance({ label, value, onChange, id }: { label: string; value: number; onChange: (n: number) => void; id: string }) {
  return (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={0}>Not important</option>
        <option value={1}>Somewhat important</option>
        <option value={2}>Important</option>
        <option value={3}>Very important</option>
      </Select>
    </Field>
  );
}

export default function PreferencesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [revision, setRevision] = useState<number>(1);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<{ tone: "success" | "error"; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api<{ preferences: Preferences; revision: number }>(`/api/projects/${id}/preferences`).then((r) => {
      setPrefs(r.preferences);
      setRevision(r.revision);
    });
  }, [id]);
  if (!prefs) return <Spinner />;
  const set = <K extends keyof Preferences>(k: K, v: Preferences[K]) => setPrefs({ ...prefs, [k]: v });
  async function save(next?: () => void) {
    setSaving(true);
    setStatus(null);
    try {
      const r = await api<{ revision: number }>(`/api/projects/${id}/preferences`, { method: "PUT", json: { preferences: prefs, revision } });
      setRevision(r.revision);
      setStatus({ tone: "success", msg: "Saved. Scores were recalculated from existing evidence (no new lookups)." });
      next?.();
    } catch (e) {
      setStatus({ tone: "error", msg: errMsg(e) });
    } finally {
      setSaving(false);
    }
  }
  const last = step === STEPS.length - 1;
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <nav aria-label="Preference steps">
        <ol className="flex gap-1 overflow-x-auto lg:flex-col">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined} className={cx("w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm", i === step ? "bg-teal-700 text-white" : "text-navy-800 hover:bg-white")}>
                {i + 1}. {s}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <Card title={STEPS[step]}>
        <div className="space-y-5">
          {step === 0 && (
            <>
              <PlacePicker id="home" label="Approximate home location" value={prefs.home} onChange={(p) => set("home", p)} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="How do you travel?" htmlFor="mode">
                  <Select id="mode" value={prefs.travelMode} onChange={(e) => set("travelMode", e.target.value as Preferences["travelMode"])}>
                    <option value="driving">Private driving</option>
                    <option value="public">Public transport</option>
                    <option value="mixed">Mixed</option>
                  </Select>
                </Field>
                <Field label="How often would you travel home?" htmlFor="freq" hint="Changing this resets the travel thresholds below to suggested values.">
                  <Select id="freq" value={prefs.travelFrequency} onChange={(e) => { const f = e.target.value as Preferences["travelFrequency"]; setPrefs({ ...prefs, travelFrequency: f, travel: { ...TRAVEL_DEFAULTS[f] } }); }}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="occasional">Occasionally</option>
                  </Select>
                </Field>
              </div>
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-medium">Travel score thresholds (visible and editable)</legend>
                <Field label="Ideal travel time (minutes) — scores 100" htmlFor="im"><Input id="im" type="number" min={0} value={prefs.travel.idealMinutes} onChange={(e) => set("travel", { ...prefs.travel, idealMinutes: Number(e.target.value) })} /></Field>
                <Field label="Maximum travel time (minutes) — scores 0" htmlFor="mm"><Input id="mm" type="number" min={1} value={prefs.travel.maxMinutes} onChange={(e) => set("travel", { ...prefs.travel, maxMinutes: Number(e.target.value) })} /></Field>
                <Field label="Ideal road distance (km)" htmlFor="ik" hint="Used only when travel time is unknown."><Input id="ik" type="number" min={0} value={prefs.travel.idealKm} onChange={(e) => set("travel", { ...prefs.travel, idealKm: Number(e.target.value) })} /></Field>
                <Field label="Maximum road distance (km)" htmlFor="mk"><Input id="mk" type="number" min={1} value={prefs.travel.maxKm} onChange={(e) => set("travel", { ...prefs.travel, maxKm: Number(e.target.value) })} /></Field>
              </fieldset>
              <PlacePicker id="second" label="Optional second reference location (e.g. a partner's workplace)" value={prefs.secondLocation} onChange={(p) => set("secondLocation", p)} />
              {prefs.secondLocation && (
                <Field label={`Share of the travel score from the second location: ${prefs.secondLocationShare}%`} htmlFor="share">
                  <input id="share" type="range" min={0} max={90} value={prefs.secondLocationShare} onChange={(e) => set("secondLocationShare", Number(e.target.value))} className="w-full accent-teal-700" />
                </Field>
              )}
            </>
          )}
          {step === 1 && (
            <>
              <ListEditor id="posts" ordered label="Preferred posts, designations, specialties or units (most preferred first)" placeholder="e.g. Medical Officer - OPD" values={prefs.posts} onChange={(v) => set("posts", v)} />
              <p className="text-sm text-navy-700">
                A designation matches when it contains your text. Post #k scores max({prefs.postScoring.floor}, {prefs.postScoring.firstChoice} − {prefs.postScoring.stepDown} × (k−1)); non-matching posts score {prefs.postScoring.unmatched}. NextPlace never decides eligibility from a job title — you choose which options to consider in the import review.
              </p>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="1st choice score" htmlFor="ps1"><Input id="ps1" type="number" value={prefs.postScoring.firstChoice} onChange={(e) => set("postScoring", { ...prefs.postScoring, firstChoice: Number(e.target.value) })} /></Field>
                <Field label="Step down per rank" htmlFor="ps2"><Input id="ps2" type="number" value={prefs.postScoring.stepDown} onChange={(e) => set("postScoring", { ...prefs.postScoring, stepDown: Number(e.target.value) })} /></Field>
                <Field label="Lowest matched score" htmlFor="ps3"><Input id="ps3" type="number" value={prefs.postScoring.floor} onChange={(e) => set("postScoring", { ...prefs.postScoring, floor: Number(e.target.value) })} /></Field>
                <Field label="Non-matching score" htmlFor="ps4"><Input id="ps4" type="number" value={prefs.postScoring.unmatched} onChange={(e) => set("postScoring", { ...prefs.postScoring, unmatched: Number(e.target.value) })} /></Field>
              </div>
            </>
          )}
          {step === 2 && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <h3 className="font-medium text-teal-800">Soft preferences <Badge tone="teal">raise the score</Badge></h3>
                <ListEditor id="pi" label="Preferred institutions" placeholder="Institution name" values={prefs.preferredInstitutions} onChange={(v) => set("preferredInstitutions", v)} />
                <ListEditor id="pd" label="Preferred districts" placeholder="District" suggestions={DISTRICTS} values={prefs.preferredDistricts} onChange={(v) => set("preferredDistricts", v)} />
              </div>
              <div className="space-y-4">
                <h3 className="font-medium text-red-800">Hard exclusions <Badge tone="red">removed from ranking</Badge></h3>
                <ListEditor id="ei" label="Excluded institutions" placeholder="Institution name" values={prefs.excludedInstitutions} onChange={(v) => set("excludedInstitutions", v)} />
                <ListEditor id="ed" label="Excluded districts" placeholder="District" suggestions={DISTRICTS} values={prefs.excludedDistricts} onChange={(v) => set("excludedDistricts", v)} />
                <p className="text-xs text-navy-700">Excluded rows stay visible in an “Excluded” view so you can review them; they are never deleted.</p>
              </div>
            </div>
          )}
          {step === 3 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Temperature preference" htmlFor="temp">
                  <Select id="temp" value={prefs.climate.temperature} onChange={(e) => set("climate", { ...prefs.climate, temperature: e.target.value as Preferences["climate"]["temperature"] })}>
                    <option value="any">No preference</option>
                    <option value="cooler">Cooler (hill country)</option>
                    <option value="moderate">Moderate (22–26 °C average)</option>
                    <option value="warmer">Warmer</option>
                  </Select>
                </Field>
                <Field label="Rainfall preference" htmlFor="rain">
                  <Select id="rain" value={prefs.climate.rainfall} onChange={(e) => set("climate", { ...prefs.climate, rainfall: e.target.value as Preferences["climate"]["rainfall"] })}>
                    <option value="any">No preference</option>
                    <option value="drier">Drier</option>
                    <option value="wetter">Wetter</option>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Importance id="f-s" label={`Schools nearby (target ${FACILITY_TARGETS.schools})`} value={prefs.facilities.schools} onChange={(n) => set("facilities", { ...prefs.facilities, schools: n })} />
                <Importance id="f-h" label={`Shops & supermarkets (target ${FACILITY_TARGETS.shops})`} value={prefs.facilities.shops} onChange={(n) => set("facilities", { ...prefs.facilities, shops: n })} />
                <Importance id="f-p" label={`Pharmacies (target ${FACILITY_TARGETS.pharmacies})`} value={prefs.facilities.pharmacies} onChange={(n) => set("facilities", { ...prefs.facilities, pharmacies: n })} />
                <Importance id="f-b" label={`Banks (target ${FACILITY_TARGETS.banks})`} value={prefs.facilities.banks} onChange={(n) => set("facilities", { ...prefs.facilities, banks: n })} />
                <Field label="Search radius (km)" htmlFor="rad"><Input id="rad" type="number" min={1} max={25} value={prefs.facilities.radiusKm} onChange={(e) => set("facilities", { ...prefs.facilities, radiusKm: Number(e.target.value) })} /></Field>
              </div>
              <p className="text-xs text-navy-700">Facility counts are availability within a radius; they say nothing about school admission eligibility or quality.</p>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Accommodation</legend>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs.accommodation.wantsQuarters} onChange={(e) => set("accommodation", { ...prefs.accommodation, wantsQuarters: e.target.checked })} /> I would like official quarters</label>
                <Textarea aria-label="Accommodation notes" rows={2} maxLength={500} placeholder="Notes for yourself" value={prefs.accommodation.notes} onChange={(e) => set("accommodation", { ...prefs.accommodation, notes: e.target.value })} />
                <p className="text-xs text-navy-700">No reliable data source provides quarters availability, so accommodation is recorded for your reference but not scored.</p>
              </fieldset>
            </>
          )}
          {step === 4 && (
            <div className="space-y-3">
              <p className="text-sm text-navy-700">Mandatory requirements exclude options that clearly fail them. When the data needed to check a requirement is unknown, the option is kept and flagged instead.</p>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={prefs.mandatory.maxTravelTime} onChange={(e) => set("mandatory", { ...prefs.mandatory, maxTravelTime: e.target.checked })} /> Exclude options whose estimated travel time exceeds {prefs.travel.maxMinutes} minutes</label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={prefs.mandatory.preferredPostsOnly} onChange={(e) => set("mandatory", { ...prefs.mandatory, preferredPostsOnly: e.target.checked })} /> Only consider my preferred posts</label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={prefs.mandatory.preferredDistrictsOnly} onChange={(e) => set("mandatory", { ...prefs.mandatory, preferredDistrictsOnly: e.target.checked })} /> Only consider my preferred districts</label>
              <Field label={`Minimum evidence coverage for confident ranking: ${prefs.minConfidentCoverage}%`} htmlFor="cov" hint="Options below this are marked low-evidence and ranked after better-evidenced options.">
                <input id="cov" type="range" min={0} max={100} value={prefs.minConfidentCoverage} onChange={(e) => set("minConfidentCoverage", Number(e.target.value))} className="w-full accent-teal-700" />
              </Field>
              <Field label="Other notes (for yourself)" htmlFor="notes"><Textarea id="notes" rows={3} maxLength={1000} value={prefs.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
            </div>
          )}
          {step === 5 && <WeightsEditor criteria={prefs.criteria} onChange={(c) => set("criteria", c)} />}
          {status && <Alert tone={status.tone}>{status.msg}</Alert>}
          <div className="flex flex-wrap justify-between gap-2 border-t border-navy-100 pt-4">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Button>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={saving} onClick={() => save()}>{saving ? "Saving…" : "Save"}</Button>
              {last ? (
                <Button disabled={saving} onClick={() => save(() => router.push(`/projects/${id}/import`))}>Save and continue to import</Button>
              ) : (
                <Button onClick={() => setStep(step + 1)}>Next</Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
