"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, errMsg } from "@/lib/client/api";
import { Alert, Badge, Button, Card, Field, Input, NumberInput, Select, Spinner, Textarea, cx } from "@/components/ui";
import { CRITERIA, normalizeWeights, TRAVEL_DEFAULTS, validateWeights, type CriterionKey, type Preferences, type Place } from "@/lib/preferences";
import { DISTRICT_TOWNS, DISTRICTS } from "@/lib/places";
import { FACILITY_TARGETS } from "@/lib/scoring";
import { WeightsEditor } from "@/components/WeightsEditor";
import { validateThresholds } from "@/lib/preferences";

const STEPS = ["Home & travel", "Posts", "Places", "Climate & facilities", "Strict rules (optional)", "Weights"] as const;


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
                <Field label="Ideal travel time (minutes) — scores 100" htmlFor="im"><NumberInput id="im" min={0} max={1440} integer value={prefs.travel.idealMinutes} onValue={(n) => set("travel", { ...prefs.travel, idealMinutes: n })} /></Field>
                <Field label="Maximum travel time (minutes) — scores 0" htmlFor="mm"><NumberInput id="mm" min={1} max={1440} integer value={prefs.travel.maxMinutes} onValue={(n) => set("travel", { ...prefs.travel, maxMinutes: n })} /></Field>
                <Field label="Ideal road distance (km)" htmlFor="ik" hint="Used only when travel time is unknown."><NumberInput id="ik" min={0} max={1000} value={prefs.travel.idealKm} onValue={(n) => set("travel", { ...prefs.travel, idealKm: n })} /></Field>
                <Field label="Maximum road distance (km)" htmlFor="mk"><NumberInput id="mk" min={1} max={1000} value={prefs.travel.maxKm} onValue={(n) => set("travel", { ...prefs.travel, maxKm: n })} /></Field>
              </fieldset>
              {validateThresholds(prefs).filter((i) => i.code.startsWith("travel")).length > 0 && (
                <Alert tone="warning">{validateThresholds(prefs).filter((i) => i.code.startsWith("travel")).map((i) => <p key={i.code}>{i.message}</p>)}</Alert>
              )}
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
                Add the posts you want, best first. A vacancy matches a post when its designation contains the words you typed (for example “OPD” matches “Medical Officer - OPD”).
              </p>
              {prefs.posts.length > 0 && (
                <div className="rounded-lg border border-teal-100 bg-teal-50 p-3">
                  <p className="mb-2 text-sm font-medium text-navy-900">Points each post gets (out of 100)</p>
                  <ul className="space-y-1 text-sm">
                    {prefs.posts.map((p, i) => (
                      <li key={p} className="flex justify-between gap-3">
                        <span>{i + 1}. {p}</span>
                        <span className="tabular font-semibold text-teal-800">{Math.max(prefs.postScoring.floor, prefs.postScoring.firstChoice - prefs.postScoring.stepDown * i)}</span>
                      </li>
                    ))}
                    <li className="flex justify-between gap-3 border-t border-teal-100 pt-1 text-navy-700">
                      <span>Any other post</span>
                      <span className="tabular font-semibold">{prefs.postScoring.unmatched}</span>
                    </li>
                  </ul>
                  <p className="mt-2 text-xs text-navy-700">These points are then multiplied by the “Post preference” weight in step 6. NextPlace never decides whether you are eligible for a post; you choose which vacancies to consider in the import review.</p>
                </div>
              )}
              <details className="rounded-lg border border-navy-100 p-3">
                <summary className="cursor-pointer text-sm font-medium text-navy-900">Advanced: change how many points each choice gets</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Points for your 1st choice" htmlFor="ps1"><NumberInput id="ps1" min={0} max={100} value={prefs.postScoring.firstChoice} onValue={(n) => set("postScoring", { ...prefs.postScoring, firstChoice: n })} /></Field>
                  <Field label="Points lost per lower choice" htmlFor="ps2" hint="e.g. 15: 1st 100, 2nd 85, 3rd 70"><NumberInput id="ps2" min={0} max={50} value={prefs.postScoring.stepDown} onValue={(n) => set("postScoring", { ...prefs.postScoring, stepDown: n })} /></Field>
                  <Field label="Minimum points for a listed post" htmlFor="ps3"><NumberInput id="ps3" min={0} max={100} value={prefs.postScoring.floor} onValue={(n) => set("postScoring", { ...prefs.postScoring, floor: n })} /></Field>
                  <Field label="Points for any other post" htmlFor="ps4"><NumberInput id="ps4" min={0} max={100} value={prefs.postScoring.unmatched} onValue={(n) => set("postScoring", { ...prefs.postScoring, unmatched: n })} /></Field>
                </div>
                {validateThresholds(prefs).filter((i) => i.code === "post_floor").map((i) => <p key={i.code} className="mt-2 text-xs text-red-700">{i.message}</p>)}
              </details>
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
                <Field label="Search radius (km)" htmlFor="rad"><NumberInput id="rad" min={1} max={25} value={prefs.facilities.radiusKm} onValue={(n) => set("facilities", { ...prefs.facilities, radiusKm: n })} /></Field>
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
            <div className="space-y-5">
              <div className="rounded-lg bg-navy-50 p-3 text-sm text-navy-800">
                <p className="font-medium text-navy-900">These are optional. Leave them all unticked if you are not sure.</p>
                <p className="mt-1">Tick a rule only if you never want an option that breaks it. Those options are not deleted: they move to an “Excluded” list on the results page, where you can still see them. If we don’t have the information to check a rule (for example, the travel time is unknown), the option stays in your list with a warning.</p>
              </div>

              <fieldset className="space-y-3">
                <legend className="mb-1 text-sm font-semibold text-navy-900">Strict rules</legend>
                <label className="flex items-start gap-3 rounded-lg border border-navy-100 p-3 text-sm">
                  <input type="checkbox" className="mt-1" disabled={!(prefs.travel.maxMinutes > prefs.travel.idealMinutes)} checked={prefs.mandatory.maxTravelTime} onChange={(e) => set("mandatory", { ...prefs.mandatory, maxTravelTime: e.target.checked })} />
                  <span>
                    <span className="block font-medium text-navy-900">Hide places that are too far to travel</span>
                    <span className="block text-navy-700">
                      {prefs.travel.maxMinutes > prefs.travel.idealMinutes
                        ? `Options whose estimated travel time from your home is more than ${prefs.travel.maxMinutes} minutes are excluded. You set this limit in step 1 (Home & travel).`
                        : "First set a valid maximum travel time in step 1 (Home & travel)."}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-navy-100 p-3 text-sm">
                  <input type="checkbox" className="mt-1" disabled={prefs.posts.length === 0} checked={prefs.mandatory.preferredPostsOnly} onChange={(e) => set("mandatory", { ...prefs.mandatory, preferredPostsOnly: e.target.checked })} />
                  <span>
                    <span className="block font-medium text-navy-900">Show only the posts I listed</span>
                    <span className="block text-navy-700">
                      {prefs.posts.length
                        ? `Vacancies that don’t match any of your ${prefs.posts.length} listed post(s) in step 2 are excluded.`
                        : "Add your preferred posts in step 2 first."}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-navy-100 p-3 text-sm">
                  <input type="checkbox" className="mt-1" disabled={prefs.preferredDistricts.length === 0} checked={prefs.mandatory.preferredDistrictsOnly} onChange={(e) => set("mandatory", { ...prefs.mandatory, preferredDistrictsOnly: e.target.checked })} />
                  <span>
                    <span className="block font-medium text-navy-900">Show only the districts I prefer</span>
                    <span className="block text-navy-700">
                      {prefs.preferredDistricts.length
                        ? `Only vacancies in ${prefs.preferredDistricts.join(", ")} are kept.`
                        : "Add preferred districts in step 3 (Places) first."}
                    </span>
                  </span>
                </label>
              </fieldset>

              <div className="space-y-2">
                <label htmlFor="cov" className="block text-sm font-semibold text-navy-900">How much information is needed to trust a score? <span className="tabular text-teal-800">{prefs.minConfidentCoverage}%</span></label>
                <input id="cov" type="range" min={0} max={100} step={5} value={prefs.minConfidentCoverage} onChange={(e) => set("minConfidentCoverage", Number(e.target.value))} className="w-full accent-teal-700" />
                <p className="text-sm text-navy-700">
                  Sometimes we can’t find every piece of information for a place (for example, climate data is missing). If we found information for less than {prefs.minConfidentCoverage}% of what matters to you, that option is labelled “Low evidence” and placed below options we know more about, so a guess never beats a well-researched option. Most people can leave this at 60%.
                </p>
              </div>

              <Field label="Notes for yourself (optional)" htmlFor="notes" hint="Only you can see this. It does not change any scores.">
                <Textarea id="notes" rows={3} maxLength={1000} value={prefs.notes} onChange={(e) => set("notes", e.target.value)} />
              </Field>
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
