/**
 * Personalised reading-pace estimate. Starts from a configurable baseline (238 wpm) and, after
 * several credible sessions, moves toward the learner's robust median observed pace.
 * Pace is a planning aid for expected durations; it is never used to judge honesty.
 */
import { DEFAULT_BASELINE_WPM } from './reading';

export interface ReadingSpeedOptions {
  baselineWpm: number;
  /** Credible sessions required before personalisation starts. */
  minSessions: number;
  /** Most recent sessions considered. */
  window: number;
  /** Shrinkage toward the baseline: weight = n / (n + priorStrength). */
  priorStrength: number;
}

export const DEFAULT_SPEED_OPTIONS: ReadingSpeedOptions = {
  baselineWpm: DEFAULT_BASELINE_WPM,
  minSessions: 3,
  window: 10,
  priorStrength: 3,
};

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

/** Drop points more than 3 scaled MADs from the median (robust outlier rule). */
export function removeOutliers(values: number[]): number[] {
  if (values.length < 3) return values;
  const m = median(values);
  const mad = median(values.map((x) => Math.abs(x - m))) * 1.4826;
  if (mad === 0) return values.filter((x) => Math.abs(x - m) / Math.max(m, 1) < 0.5);
  return values.filter((x) => Math.abs(x - m) / mad <= 3);
}

export interface SpeedEstimate {
  wpm: number;
  personalised: boolean;
  sessionsUsed: number;
  excludedOutliers: number;
}

export function estimateReadingSpeed(
  observedCredibleWpm: readonly number[],
  options: ReadingSpeedOptions = DEFAULT_SPEED_OPTIONS,
): SpeedEstimate {
  const recent = observedCredibleWpm.filter((x) => Number.isFinite(x) && x > 0).slice(-options.window);
  if (recent.length < options.minSessions) {
    return { wpm: options.baselineWpm, personalised: false, sessionsUsed: 0, excludedOutliers: 0 };
  }
  const kept = removeOutliers(recent);
  const personal = median(kept);
  const w = kept.length / (kept.length + options.priorStrength);
  return {
    wpm: Math.round(w * personal + (1 - w) * options.baselineWpm),
    personalised: true,
    sessionsUsed: kept.length,
    excludedOutliers: recent.length - kept.length,
  };
}

export function observedWpm(words: number, activeMs: number): number {
  return activeMs > 0 ? words / (activeMs / 60_000) : 0;
}
