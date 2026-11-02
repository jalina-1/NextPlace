"use client";
import { Alert, Button, Input, cx } from "./ui";
import { CRITERIA, normalizeWeights, validateWeights, type CriterionKey, type Preferences } from "@/lib/preferences";

export const CRIT_LABEL: Record<CriterionKey, { label: string; help: string }> = {
  post: { label: "Post preference", help: "How well the post matches your ordered list of preferred posts." },
  travel: { label: "Travel convenience", help: "Estimated travel time for your travel mode (road distance only if time is unknown)." },
  climate: { label: "Climate match", help: "Annual mean temperature and rainfall versus your climate preference." },
  facilities: { label: "Nearby facilities", help: "Schools, shops, pharmacies and banks within your chosen radius." },
  location: { label: "Preferred institutions/districts", help: "100 for a preferred institution, 70 for a preferred district, 0 otherwise." },
};

export function WeightsEditor({ criteria, onChange }: { criteria: Preferences["criteria"]; onChange: (c: Preferences["criteria"]) => void }) {
  const issues = validateWeights(criteria);
  const total = CRITERIA.filter((c) => criteria[c].enabled).reduce((s, c) => s + criteria[c].weight, 0);
  return (
    <div className="space-y-4">
      <p className="text-sm text-navy-700">
        <strong>Weight</strong> = how important a criterion is to you. Each option then gets a <strong>criterion score</strong> (0–100) for how well it satisfies that criterion. Final score = Σ score × weight / 100.
      </p>
      {CRITERIA.map((c) => (
        <div key={c} className={cx("rounded-lg border p-3", criteria[c].enabled ? "border-navy-100 bg-white" : "border-dashed border-navy-100 bg-navy-50")}>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-1 items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={criteria[c].enabled} onChange={(e) => onChange({ ...criteria, [c]: { enabled: e.target.checked, weight: e.target.checked ? criteria[c].weight : 0 } })} />
              {CRIT_LABEL[c].label}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                aria-label={`${CRIT_LABEL[c].label} weight slider`}
                disabled={!criteria[c].enabled}
                value={criteria[c].weight}
                onChange={(e) => onChange({ ...criteria, [c]: { ...criteria[c], weight: Number(e.target.value) } })}
                className="w-32 accent-teal-700 sm:w-48"
              />
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                aria-label={`${CRIT_LABEL[c].label} weight percent`}
                disabled={!criteria[c].enabled}
                value={criteria[c].weight}
                onChange={(e) => onChange({ ...criteria, [c]: { ...criteria[c], weight: Number(e.target.value) } })}
                className="w-20 text-right tabular"
              />
              <span className="text-sm">%</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-navy-700">{CRIT_LABEL[c].help}</p>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={cx("text-sm font-medium tabular", Math.abs(total - 100) > 0.01 ? "text-red-700" : "text-teal-800")}>Enabled total: {Math.round(total * 100) / 100}%</p>
        <Button type="button" variant="secondary" onClick={() => onChange(normalizeWeights(criteria))}>Normalize to 100%</Button>
      </div>
      {issues.length > 0 && <Alert tone="warning">{issues.map((i) => <p key={i.code + i.message}>{i.message}</p>)}</Alert>}
    </div>
  );
}

