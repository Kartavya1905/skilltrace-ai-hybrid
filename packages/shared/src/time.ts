/**
 * Time helpers. Every persisted timestamp is an ISO-8601 UTC string (`2026-11-22T10:00:00.000Z`);
 * in-memory event times are epoch milliseconds (UTC by definition).
 */

/** Injectable clock so tracking logic is deterministic under test. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function fromIso(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Invalid ISO timestamp: ${iso}`);
  return ms;
}

export function nowIso(clock: Clock = systemClock): string {
  return toIso(clock.now());
}

/** A closed-open wall-clock interval in epoch ms. */
export interface Interval {
  start: number;
  end: number;
}

/**
 * Merge overlapping intervals and return the total covered length.
 * Used so that two tabs playing at once are not double-counted in the user's total.
 */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .map((i) => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push(cur);
    }
  }
  return out;
}

export function unionLength(intervals: readonly Interval[]): number {
  return mergeIntervals(intervals).reduce((sum, i) => sum + (i.end - i.start), 0);
}

/** Length of `interval` that overlaps the (already merged or not) set `others`. */
export function overlapLength(interval: Interval, others: readonly Interval[]): number {
  let total = 0;
  for (const o of mergeIntervals(others)) {
    const s = Math.max(interval.start, o.start);
    const e = Math.min(interval.end, o.end);
    if (e > s) total += e - s;
  }
  return total;
}

/** UTC calendar-day key, e.g. `2026-11-22`. */
export function dayKey(ms: number): string {
  return toIso(ms).slice(0, 10);
}

/** ISO week key (UTC), e.g. `2026-W47`. */
export function weekKey(ms: number): string {
  const d = new Date(ms);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function monthKey(ms: number): string {
  return toIso(ms).slice(0, 7);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function msToHours(ms: number, digits = 1): string {
  return (ms / 3_600_000).toFixed(digits);
}
