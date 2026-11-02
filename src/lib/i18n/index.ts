import { en, type MessageKey } from "./en";

/** Placeholders for future translations; untranslated keys fall back to English. */
const si: Partial<Record<MessageKey, string>> = {};
const ta: Partial<Record<MessageKey, string>> = {};

export type Locale = "en" | "si" | "ta";
const dictionaries: Record<Locale, Partial<Record<MessageKey, string>>> = { en, si, ta };

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  let s = dictionaries[locale][key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export const t = (key: MessageKey, vars?: Record<string, string | number>) => translate("en", key, vars);
export type { MessageKey };
