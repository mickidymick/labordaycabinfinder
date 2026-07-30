// Availability calendars come back from these sites as a run-length string, one
// character per day starting at a known date. Verified against Elk Springs:
//
//   calendar_start_date = "2026-07-30 00:00:00.000"
//   calendar_string     = "UUIAAAAOUUIAAOUUUIAOUUUUIAAAAAOUUUUUU..."
//
// The legend is the vacation-rental convention:
//   A = available   U = unavailable   I = check-in allowed   O = check-out allowed
//
// A bookable window reads as I A A A O — arrive on the I, depart on the O.

import type { DayAvailability, DayState } from './types.ts';

const VALID: Record<string, DayState> = { A: 'A', U: 'U', I: 'I', O: 'O' };

/** Parse "2026-07-30" or "2026-07-30 00:00:00.000" into a UTC date, ignoring TZ. */
export function parseDayString(input: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.trim());
  if (!m) throw new Error(`Unparseable calendar start date: ${input}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function toDayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = parseDayString(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toDayString(d);
}

/** Whole days between two YYYY-MM-DD strings (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = parseDayString(b).getTime() - parseDayString(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** Every night of a stay: [checkIn, checkOut). The checkout day is not a night. */
export function nightsOf(checkIn: string, checkOut: string): string[] {
  const n = daysBetween(checkIn, checkOut);
  if (n <= 0) return [];
  return Array.from({ length: n }, (_, i) => addDays(checkIn, i));
}

/**
 * Expand a run-length calendar string into per-day rows.
 * Unknown characters are treated as unavailable — refusing to guess is safer
 * than showing the group a cabin that turns out to be booked.
 */
export function decodeCalendarString(
  startDate: string,
  calendar: string,
  opts: { maxDays?: number } = {},
): DayAvailability[] {
  if (!calendar) return [];
  const start = parseDayString(startDate);
  const limit = Math.min(calendar.length, opts.maxDays ?? calendar.length);
  const out: DayAvailability[] = [];

  for (let i = 0; i < limit; i++) {
    const ch = calendar[i].toUpperCase();
    const d = new Date(start.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    out.push({ day: toDayString(d), state: VALID[ch] ?? 'U' });
  }
  return out;
}

/** Same, but only the slice covering [from, to] — avoids storing 500 useless days. */
export function decodeCalendarRange(
  startDate: string,
  calendar: string,
  from: string,
  to: string,
): DayAvailability[] {
  const offset = daysBetween(startDate, from);
  const span = daysBetween(from, to);
  if (span <= 0) return [];

  const out: DayAvailability[] = [];
  for (let i = 0; i < span; i++) {
    const idx = offset + i;
    // Before the calendar starts is the past; past it is unknown. Both are 'U'.
    const ch = idx >= 0 && idx < calendar.length ? calendar[idx].toUpperCase() : 'U';
    out.push({ day: addDays(from, i), state: VALID[ch] ?? 'U' });
  }
  return out;
}

/**
 * States you can actually sleep in the cabin on. 'O' is deliberately excluded:
 * in the source calendars a bookable window reads I A A A O, where the O is the
 * departure day. Somebody checks out that morning, so it is not a night you can
 * book. Treating O as available silently shows booked cabins as free.
 */
const BOOKABLE_NIGHT = new Set<DayState>(['A', 'I']);

/**
 * Is the whole stay bookable? Every night in [checkIn, checkOut) must be a
 * bookable state; the checkout day itself is not a night and is unconstrained.
 * Returns null when we lack a row for some night — unknown is not the same as
 * unavailable, and the UI shows the difference.
 */
export function isStayAvailable(
  days: DayAvailability[],
  checkIn: string,
  checkOut: string,
): boolean | null {
  const nights = nightsOf(checkIn, checkOut);
  if (nights.length === 0) return null;

  const byDay = new Map(days.map((d) => [d.day, d]));
  for (const night of nights) {
    const row = byDay.get(night);
    if (!row) return null;
    if (!BOOKABLE_NIGHT.has(row.state)) return false;
  }
  return true;
}

/** Sum of nightly rates across the stay, or null if any night lacks a price. */
export function stayTotal(
  days: DayAvailability[],
  checkIn: string,
  checkOut: string,
): number | null {
  const byDay = new Map(days.map((d) => [d.day, d]));
  let total = 0;
  for (const night of nightsOf(checkIn, checkOut)) {
    const rate = byDay.get(night)?.nightlyRate;
    if (rate == null) return null;
    total += rate;
  }
  return total;
}
