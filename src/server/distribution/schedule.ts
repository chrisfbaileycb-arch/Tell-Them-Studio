/**
 * Timezone-correct weekly schedule maths using only `Intl` (no dependencies, DST-safe).
 * Everything is a pure function of its arguments so tests can inject the clock.
 */

export interface SlotRule {
  /** 0 = Sunday ... 6 = Saturday, in `timezone`. */
  dayOfWeek: number;
  /** `HH:MM`, 24h, in `timezone`. */
  timeOfDay: string;
  timezone: string;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return typeof tz === 'string' && tz.length > 0 && tz.length <= 64;
  } catch {
    return false;
  }
}

export const isValidTimeOfDay = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Offset (ms) of `tz` from UTC at the instant `utcMs` (positive east of Greenwich). */
function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Calendar date (as seen in `tz`) of an instant. */
function localDate(utcMs: number, tz: string): { y: number; m: number; d: number } {
  const off = tzOffsetMs(utcMs, tz);
  const dt = new Date(utcMs + off);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** The instant at which the wall clock in `tz` reads y-m-d hh:mm (shifted forward across DST gaps). */
export function zonedTimeToUtcMs(y: number, m: number, d: number, hh: number, mm: number, tz: string): number {
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let guess = naive - tzOffsetMs(naive, tz);
  const corrected = naive - tzOffsetMs(guess, tz);
  if (corrected !== guess) guess = corrected;
  return guess;
}

/** First weekly slot strictly after `afterMs`. */
export function nextSlotAfter(rule: SlotRule, afterMs: number): Date {
  const [hh, mm] = rule.timeOfDay.split(':').map(Number);
  const start = localDate(afterMs, rule.timezone);
  for (let i = 0; i <= 14; i++) {
    const cal = new Date(Date.UTC(start.y, start.m - 1, start.d + i));
    if (cal.getUTCDay() !== rule.dayOfWeek) continue;
    const utc = zonedTimeToUtcMs(cal.getUTCFullYear(), cal.getUTCMonth() + 1, cal.getUTCDate(), hh, mm, rule.timezone);
    if (utc > afterMs) return new Date(utc);
  }
  // Unreachable for valid rules; keeps the type total.
  return new Date(afterMs + 7 * 24 * 60 * 60 * 1000);
}
