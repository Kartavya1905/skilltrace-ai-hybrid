import { describe, expect, it } from 'vitest';
import { applyTimer, newTimer, projectTimeByProject, timerElapsed, validateManualSession } from '../src';

describe('project timer', () => {
  it('accumulates only running time across pause/resume', () => {
    let s = newTimer();
    s = applyTimer(s, { type: 'start', t: 0 });
    s = applyTimer(s, { type: 'pause', t: 30 * 60_000 });
    expect(timerElapsed(s, 90 * 60_000)).toBe(30 * 60_000);
    s = applyTimer(s, { type: 'resume', t: 60 * 60_000 });
    s = applyTimer(s, { type: 'stop', t: 75 * 60_000 });
    expect(s.accumulatedMs).toBe(45 * 60_000);
    expect(applyTimer(s, { type: 'start', t: 80 * 60_000 })).toBe(s); // stopped timers are final
  });

  it('only self-reported or timer-recorded sessions carry project hours', () => {
    const totals = projectTimeByProject([
      { projectId: 'p', durationMs: 2 * 3_600_000, provenance: 'self_reported' },
      { projectId: 'p', durationMs: 3 * 3_600_000, provenance: 'timer_recorded' },
      { projectId: 'p', durationMs: 9 * 3_600_000, provenance: 'github_metadata' },
    ]);
    expect(totals.get('p')).toBe(5 * 3_600_000);
  });

  it('validates manual entries', () => {
    const now = Date.parse('2026-11-22T12:00:00Z');
    expect(validateManualSession('2026-11-22T10:00:00Z', '2026-11-22T09:00:00Z', now)).toMatch(/after/);
    expect(validateManualSession('2026-11-22T10:00:00Z', '2026-11-23T10:00:00Z', now)).toMatch(/future/);
    expect(validateManualSession('2026-11-22T09:00:00Z', '2026-11-22T11:00:00Z', now)).toBeNull();
  });
});
