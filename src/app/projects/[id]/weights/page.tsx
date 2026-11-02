"use client";
import { useParams } from "next/navigation";
import { Info } from "lucide-react";
import { usePrefs } from "@/lib/client/usePrefs";
import { StepPage, Question } from "@/components/StepPage";
import { WeightsEditor } from "@/components/WeightsEditor";
import { Alert, Button, Spinner } from "@/components/ui";
import { normalizeWeights } from "@/lib/preferences";

export default function WeightsStep() {
  const { id } = useParams<{ id: string }>();
  const { prefs, update, errors, save, saving, otherStepProblem, loadError } = usePrefs(id, "weights");
  if (loadError) return <Alert tone="error">{loadError}</Alert>;
  if (!prefs) return <Spinner />;
  const likedCount = prefs.preferredDistricts.length + prefs.preferredInstitutions.length;
  const error = errors.criteria ?? Object.entries(errors).find(([k]) => k.startsWith("criteria"))?.[1];
  return (
    <StepPage projectId={id} step="weights" title="What matters most to you?" intro="You can change this any time; scores update straight away without new searches." onNext={save} busy={saving} problem={otherStepProblem} nextLabel="Save and start analysis" nextQuery="start=1">
      {likedCount > 0 && !prefs.criteria.location.enabled && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2">
            <Info size={18} className="mt-0.5 shrink-0" />
            You chose {likedCount} place{likedCount === 1 ? "" : "s"} you like, but they don&apos;t add points yet.
          </span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              // Shrink the other items to 90% in total, then give "Places I like" exactly 10%.
              const others = normalizeWeights({ ...prefs.criteria, location: { enabled: false, weight: 0 } });
              const scaled = Object.fromEntries(Object.entries(others).map(([k, v]) => [k, { ...v, weight: Math.round(v.weight * 0.9 * 100) / 100 }])) as typeof others;
              const c = { ...scaled, location: { enabled: true, weight: 10 } };
              update({ criteria: normalizeWeights(c) }, ["criteria"]);
            }}
          >
            Give them 10%
          </Button>
        </div>
      )}
      <Question field="criteria" title="Share 100% between these" error={error}>
        <WeightsEditor criteria={prefs.criteria} onChange={(c) => update({ criteria: c }, ["criteria"])} />
      </Question>
    </StepPage>
  );
}
