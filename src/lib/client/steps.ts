import { Upload, Home, Briefcase, MapPin, CloudSun, SlidersHorizontal, Bot, BarChart3, Columns3, ListOrdered, Download, type LucideIcon } from "lucide-react";

export type StepKey = "import" | "home" | "posts" | "places" | "climate" | "weights" | "analysis" | "results" | "compare" | "final" | "export";

export const SETUP_STEPS: { key: StepKey; label: string; icon: LucideIcon }[] = [
  { key: "import", label: "Upload your list", icon: Upload },
  { key: "home", label: "Home & travel", icon: Home },
  { key: "posts", label: "Posts", icon: Briefcase },
  { key: "places", label: "Places", icon: MapPin },
  { key: "climate", label: "Climate & facilities", icon: CloudSun },
  { key: "weights", label: "What matters most", icon: SlidersHorizontal },
];

export const RESULT_STEPS: { key: StepKey; label: string; icon: LucideIcon }[] = [
  { key: "analysis", label: "Analysis", icon: Bot },
  { key: "results", label: "Results", icon: BarChart3 },
  { key: "compare", label: "Compare", icon: Columns3 },
  { key: "final", label: "Final list", icon: ListOrdered },
  { key: "export", label: "Export", icon: Download },
];

export const ALL_STEPS = [...SETUP_STEPS, ...RESULT_STEPS];

/** Steps where the chat panel is shown beside the page. */
export const CHAT_STEPS: StepKey[] = ["analysis", "results", "compare", "final", "export"];

export function nextStep(k: StepKey): StepKey | null {
  const i = ALL_STEPS.findIndex((s) => s.key === k);
  return ALL_STEPS[i + 1]?.key ?? null;
}
export function prevStep(k: StepKey): StepKey | null {
  const i = ALL_STEPS.findIndex((s) => s.key === k);
  return i > 0 ? ALL_STEPS[i - 1].key : null;
}
