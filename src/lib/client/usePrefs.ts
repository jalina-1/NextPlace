"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import { useShell } from "./shell";
import type { StepKey } from "./steps";
import { validateThresholds, validateWeights, type Preferences } from "@/lib/preferences";

export type FieldErrors = Record<string, string>;

/** Which setup step owns a preference field path. */
export function stepForField(path: string): StepKey {
  if (/^(home|travel|secondLocation|travelMode|travelFrequency)/.test(path)) return "home";
  if (/^(posts|postScoring)/.test(path)) return "posts";
  if (/^(preferred|excluded)/.test(path)) return "places";
  if (/^(climate|facilities|rental|accommodation)/.test(path)) return "climate";
  return "weights";
}

/** Client-side checks per step, phrased as plain instructions. Keys are field paths. */
export function validateStep(step: StepKey, p: Preferences): FieldErrors {
  const e: FieldErrors = {};
  if (step === "home") {
    if (!p.home) e.home = "Choose the town you live in.";
    for (const i of validateThresholds(p)) if (i.field?.startsWith("travel")) e[i.field] = i.message;
  }
  if (step === "posts" && p.criteria.post.enabled && p.posts.length === 0) e.posts = "Choose at least one post you would like.";
  if (step === "climate" && p.rental.looking && p.rental.maxMonthlyLkr == null) e["rental.maxMonthlyLkr"] = "Choose the most you can pay each month.";
  if (step === "weights") for (const i of validateWeights(p.criteria)) e[i.field ?? "criteria"] = i.message;
  return e;
}

export function scrollToFirstError() {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>("[data-field-error='true']");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.querySelector<HTMLElement>("input, select, textarea, button")?.focus({ preventScroll: true });
  });
}

export function usePrefs(projectId: string, step: StepKey) {
  const { setStepError } = useShell();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [revision, setRevision] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [otherStepProblem, setOtherStepProblem] = useState<{ step: StepKey; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api<{ preferences: Preferences; revision: number }>(`/api/projects/${projectId}/preferences`)
      .then((r) => {
        setPrefs(r.preferences);
        setRevision(r.revision);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load your answers."));
  }, [projectId]);

  /** Updates answers and clears the error of the field that changed. */
  const update = useCallback((patch: Partial<Preferences>, clear?: string[]) => {
    setPrefs((p) => (p ? { ...p, ...patch } : p));
    setErrors((e) => {
      const keys = clear ?? Object.keys(patch);
      const next = { ...e };
      for (const k of Object.keys(next)) if (keys.some((c) => k === c || k.startsWith(c + "."))) delete next[k];
      return next;
    });
  }, []);

  /** Validates this step, saves, and returns true when everything is fine. */
  const save = useCallback(async (): Promise<boolean> => {
    if (!prefs) return false;
    setOtherStepProblem(null);
    const local = validateStep(step, prefs);
    setErrors(local);
    if (Object.keys(local).length) {
      setStepError(step, true);
      scrollToFirstError();
      return false;
    }
    setSaving(true);
    try {
      const r = await api<{ revision: number }>(`/api/projects/${projectId}/preferences`, { method: "PUT", json: { preferences: prefs, revision } });
      setRevision(r.revision);
      setStepError(step, false);
      return true;
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.body.issues)) {
        const issues = e.body.issues as { path: string; message: string }[];
        const mine: FieldErrors = {};
        for (const i of issues) {
          const s = stepForField(i.path);
          setStepError(s, true);
          if (s === step) mine[i.path || "form"] = i.message;
          else setOtherStepProblem((cur) => cur ?? { step: s, message: i.message });
        }
        setErrors(mine);
        scrollToFirstError();
      } else if (e instanceof ApiError && e.status === 409) {
        setOtherStepProblem({ step, message: "Your answers were changed in another tab. Reload the page to see the latest version." });
      } else {
        setOtherStepProblem({ step, message: e instanceof Error ? e.message : "Could not save. Please try again." });
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [prefs, projectId, revision, setStepError, step]);

  return { prefs, update, errors, save, saving, otherStepProblem, loadError };
}
