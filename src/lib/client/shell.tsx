"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { StepKey } from "./steps";

export type ShellProject = { id: string; name: string; isDemo: boolean; premium: boolean; previewFrozen: boolean };

type ShellState = {
  project: ShellProject | null;
  setProject: (p: ShellProject | null) => void;
  /** Steps that currently have a problem the user must fix (shown as a red dot in the sidebar). */
  stepErrors: Partial<Record<StepKey, boolean>>;
  setStepError: (k: StepKey, v: boolean) => void;
};

const Ctx = createContext<ShellState>({ project: null, setProject: () => {}, stepErrors: {}, setStepError: () => {} });

export function ShellProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<ShellProject | null>(null);
  const [stepErrors, setErrors] = useState<Partial<Record<StepKey, boolean>>>({});
  const setStepError = useCallback((k: StepKey, v: boolean) => setErrors((e) => (e[k] === v ? e : { ...e, [k]: v })), []);
  return <Ctx.Provider value={{ project, setProject, stepErrors, setStepError }}>{children}</Ctx.Provider>;
}

export const useShell = () => useContext(Ctx);
