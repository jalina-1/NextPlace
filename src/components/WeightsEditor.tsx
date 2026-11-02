"use client";
import { Alert, Button, NumberInput, cx } from "./ui";
import { CRITERIA, normalizeWeights, validateWeights, type CriterionKey, type Preferences } from "@/lib/preferences";

export const CRIT_LABEL: Record<CriterionKey, { label: string; help: string }> = {
  post: { label: "Getting the post I want", help: "Your favourite post gets the most points." },
  travel: { label: "Short journey", help: "Closer places get more points." },
  climate: { label: "Weather I like", help: "Places with the weather you chose get more points." },
  facilities: { label: "Schools and shops nearby", help: "Places with more of what you need nearby get more points." },
  location: { label: "Places I like", help: "Hospitals and districts you said you like get extra points. Off unless you turn it on." },
};

export function WeightsEditor({ criteria, onChange }: { criteria: Preferences["criteria"]; onChange: (c: Preferences["criteria"]) => void }) {
  const total = CRITERIA.filter((c) => criteria[c].enabled).reduce((s, c) => s + criteria[c].weight, 0);
  return (
    <div className="space-y-4">
      <p className="text-sm text-navy-700">
        Share 100% between the things below. A bigger percentage means it matters more to you.
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
              <NumberInput
                min={0}
                max={100}
                step={0.01}
                aria-label={`${CRIT_LABEL[c].label} weight percent`}
                disabled={!criteria[c].enabled}
                value={criteria[c].weight}
                onValue={(n) => onChange({ ...criteria, [c]: { ...criteria[c], weight: n } })}
                className="w-20 text-right tabular"
              />
              <span className="text-sm">%</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-navy-700">{CRIT_LABEL[c].help}</p>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={cx("text-sm font-medium tabular", Math.abs(total - 100) > 0.01 ? "text-red-700" : "text-teal-800")}>Total: {Math.round(total * 100) / 100}%</p>
        <Button type="button" variant="secondary" onClick={() => onChange(normalizeWeights(criteria))}>Make it 100%</Button>
      </div>
    </div>
  );
}

