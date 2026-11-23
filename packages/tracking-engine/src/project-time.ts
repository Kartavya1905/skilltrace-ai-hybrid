/**
 * Project work time. Only explicit learner actions create project hours:
 *   - a timer the learner starts/pauses/stops ('timer_recorded')
 *   - a manually entered session ('self_reported')
 * GitHub repositories, commits and pull requests are milestones with zero duration.
 * Project time is never added to learning time.
 */

export type TimerAction = { type: 'start' | 'pause' | 'resume' | 'stop'; t: number };

export interface TimerState {
  running: boolean;
  startedAt: number | null;
  lastStart: number | null;
  accumulatedMs: number;
  stopped: boolean;
}

export function newTimer(): TimerState {
  return { running: false, startedAt: null, lastStart: null, accumulatedMs: 0, stopped: false };
}

export function applyTimer(state: TimerState, action: TimerAction): TimerState {
  if (state.stopped) return state;
  switch (action.type) {
    case 'start':
    case 'resume':
      if (state.running) return state;
      return { ...state, running: true, startedAt: state.startedAt ?? action.t, lastStart: action.t };
    case 'pause':
      if (!state.running || state.lastStart === null) return state;
      return { ...state, running: false, lastStart: null, accumulatedMs: state.accumulatedMs + Math.max(0, action.t - state.lastStart) };
    case 'stop': {
      const extra = state.running && state.lastStart !== null ? Math.max(0, action.t - state.lastStart) : 0;
      return { ...state, running: false, lastStart: null, accumulatedMs: state.accumulatedMs + extra, stopped: true };
    }
  }
}

export function timerElapsed(state: TimerState, now: number): number {
  return state.accumulatedMs + (state.running && state.lastStart !== null ? Math.max(0, now - state.lastStart) : 0);
}

export interface WorkSessionLike {
  projectId: string;
  durationMs: number;
  provenance: string;
}

const PROJECT_TIME_PROVENANCE = new Set(['self_reported', 'timer_recorded']);

/** Self-reported project hours per project. Anything without a manual/timer provenance is ignored. */
export function projectTimeByProject(sessions: readonly WorkSessionLike[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of sessions) {
    if (!PROJECT_TIME_PROVENANCE.has(s.provenance)) continue;
    if (!Number.isFinite(s.durationMs) || s.durationMs <= 0) continue;
    out.set(s.projectId, (out.get(s.projectId) ?? 0) + s.durationMs);
  }
  return out;
}

/** Validate a manual session entry; returns an error message or null. */
export function validateManualSession(startIso: string, endIso: string, now = Date.now()): string | null {
  const s = Date.parse(startIso);
  const e = Date.parse(endIso);
  if (Number.isNaN(s) || Number.isNaN(e)) return 'Start and end must be valid dates.';
  if (e <= s) return 'End must be after start.';
  if (e > now + 60_000) return 'Sessions cannot end in the future.';
  if (e - s > 16 * 3_600_000) return 'A single session cannot exceed 16 hours. Split it into several sessions.';
  return null;
}
