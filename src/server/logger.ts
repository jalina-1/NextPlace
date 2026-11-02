/**
 * Structured JSON logs. Callers must pass identifiers only — never file contents,
 * receipt data, passwords, tokens, coordinates or other personal data.
 */
type Level = "debug" | "info" | "warn" | "error";
const REDACT = /(password|token|secret|key|authorization|cookie|lat|lng|email)/i;

function clean(fields?: Record<string, unknown>) {
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = REDACT.test(k) ? "[redacted]" : v;
  return out;
}

function log(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && level === "debug") return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...clean(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (process.env.LOG_LEVEL !== "silent") console.log(line);
}

export const logger = {
  debug: (m: string, f?: Record<string, unknown>) => log("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => log("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => log("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => log("error", m, f),
};
