/**
 * Date handling.
 *
 * Storage: all instants are stored as UTC `timestamptz`.
 * Display: always Asia/Colombo (UTC+05:30, no daylight saving).
 *
 * Access periods use calendar months in Asia/Colombo local time:
 *   end = start + N months at the same local wall-clock time.
 *   If the target month is shorter (e.g. 31 Jan + 1 month), the end is clamped
 *   to the last day of that month at the same local time (28/29 Feb).
 */
export const APP_TIMEZONE = "Asia/Colombo";
const COLOMBO_OFFSET_MIN = 330; // +05:30, fixed

export function addCalendarMonthsColombo(start: Date, months: number): Date {
  const local = new Date(start.getTime() + COLOMBO_OFFSET_MIN * 60_000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const targetMonthIndex = m + months;
  const ty = y + Math.floor(targetMonthIndex / 12);
  const tm = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const td = Math.min(d, lastDay);
  const resultLocal = Date.UTC(ty, tm, td, local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), local.getUTCMilliseconds());
  return new Date(resultLocal - COLOMBO_OFFSET_MIN * 60_000);
}

export function formatColombo(d: Date | string | null | undefined, withTime = true): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-LK", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function colomboDateKey(d: Date = new Date()): string {
  const local = new Date(d.getTime() + COLOMBO_OFFSET_MIN * 60_000);
  return local.toISOString().slice(0, 10);
}
