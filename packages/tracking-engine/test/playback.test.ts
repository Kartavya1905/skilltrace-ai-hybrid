import { describe, expect, it } from 'vitest';
import {
  PlaybackTracker,
  defaultPlaybackConfig,
  replayPlayback,
  type VerificationConfig,
} from '../src';
import { EventLog, MIN } from './helpers';

const video = () => defaultPlaybackConfig('video');

function run(log: EventLog, config = video()) {
  return replayPlayback(log.events as never, config, 600).summary();
}

describe('video playback accounting', () => {
  it('10-minute video watched once at 1x = 10 minutes active, 10 minutes coverage', () => {
    const log = new EventLog();
    log.media('play', 0, 0);
    const end = log.play(0, 0, 600);
    log.media('ended', end.t, 600);
    const s = run(log);
    expect(s.eligibleMs).toBe(10 * MIN);
    expect(s.coverageSec).toBe(600);
    expect(s.revisionMs).toBe(0);
    expect(s.coverageRatio).toBe(1);
  });

  it('rewinding 5 minutes and rewatching = 15 min active, 10 min coverage, 5 min revision', () => {
    const log = new EventLog();
    log.media('play', 0, 0);
    log.play(0, 0, 600);
    // seek from 10:00 back to 5:00 while playing
    log.media('seeking', 600, 300, 1, { fromPos: 600, fromT: 1_000_000 + 600_000 });
    log.media('seeked', 600.5, 300);
    const end = log.play(600.5, 300, 300);
    log.media('pause', end.t, 600);
    const s = run(log);
    expect(s.eligibleMs).toBe(15 * MIN);
    expect(s.coverageSec).toBe(600);
    expect(s.revisionMs).toBe(5 * MIN);
  });

  it('paused time is never counted', () => {
    const log = new EventLog();
    log.media('play', 0, 0);
    log.play(0, 0, 60);
    log.media('pause', 60, 60);
    log.media('play', 60 + 3600, 60); // paused for an hour
    log.play(3660, 60, 60);
    log.media('pause', 3720, 120);
    const s = run(log);
    expect(s.eligibleMs).toBe(2 * MIN);
    expect(s.pausedMs).toBe(60 * MIN);
  });

  it('skipped sections are not counted as watched', () => {
    const log = new EventLog();
    log.media('play', 0, 0);
    log.play(0, 0, 60);
    log.media('seeking', 60, 400, 1, { fromPos: 60, fromT: 1_000_000 + 60_000 });
    log.media('seeked', 60.2, 400);
    log.play(60.2, 400, 60);
    log.media('ended', 120.2, 460);
    const s = run(log);
    expect(s.eligibleMs).toBe(2 * MIN);
    expect(s.coverageSec).toBeCloseTo(120, 5);
    expect(s.coveredRanges).toEqual([
      { start: 0, end: 60 },
      { start: 400, end: 460 },
    ]);
  });

  it('an unannounced jump ahead (no seek event) is a discontinuity, not credit', () => {
    const log = new EventLog();
    log.media('play', 0, 0);
    log.media('checkpoint', 5, 5);
    log.media('checkpoint', 10, 300); // position leapt 295 s in 5 s
    log.media('checkpoint', 15, 305);
    const s = run(log);
    expect(s.eligibleMs).toBe(10_000);
    expect(s.coverageSec).toBe(10);
  });

  it('2x playback credits real elapsed time, not content duration', () => {
    const log = new EventLog();
    log.media('play', 0, 0, 2);
    const end = log.play(0, 0, 300, 2); // 5 real minutes covers 10 content minutes
    log.media('ended', end.t, 600, 2);
    const s = run(log);
    expect(s.eligibleMs).toBe(5 * MIN);
    expect(s.coverageSec).toBe(600);
  });

  it('rate changes mid-video use the rate in effect for each span', () => {
    const log = new EventLog();
    log.media('play', 0, 0, 1);
    log.play(0, 0, 60, 1);
    log.media('ratechange', 60, 60, 1.5);
    log.play(60, 60, 60, 1.5);
    log.media('pause', 120, 150, 1.5);
    const s = run(log);
    expect(s.eligibleMs).toBe(2 * MIN);
    expect(s.coverageSec).toBe(150);
  });

  it('buffering (position not advancing) earns no time', () => {
    const log = new EventLog();
    log.media('play', 0, 0);
    log.media('checkpoint', 10, 10);
    log.media('waiting', 10, 10);
    log.media('checkpoint', 40, 10); // stalled for 30 s
    log.media('playing', 40, 10);
    log.media('checkpoint', 50, 20);
    const s = run(log);
    expect(s.eligibleMs).toBe(20_000);
    expect(s.rawMs).toBe(50_000);
  });

  it('duplicate events do not increase totals', () => {
    const log = new EventLog();
    log.media('play', 0, 0);
    log.play(0, 0, 120);
    log.media('pause', 120, 120);
    const doubled = [...log.events, ...log.events, ...log.events.slice(3, 9)];
    const s = replayPlayback(doubled as never, video(), 600).summary();
    expect(s.eligibleMs).toBe(2 * MIN);
  });

  it('out-of-order delivery reconstructs the same totals', () => {
    const log = new EventLog();
    log.media('play', 0, 0);
    log.play(0, 0, 120);
    log.media('pause', 120, 120);
    const shuffled = [...log.events].reverse();
    expect(replayPlayback(shuffled as never, video(), 600).summary().eligibleMs).toBe(2 * MIN);
  });

  it('a browser crash credits only up to the last persisted checkpoint', () => {
    const log = new EventLog();
    log.media('play', 0, 0);
    log.play(0, 0, 90); // last checkpoint at 90 s, then the browser dies (no pause event)
    const s = run(log);
    expect(s.eligibleMs).toBe(90_000);
  });

  it('a refresh splits into two sessions that reconstruct independently', () => {
    const a = new EventLog('a');
    a.media('play', 0, 0);
    a.play(0, 0, 60);
    a.media('interrupt', 60, 60);
    const b = new EventLog('b');
    b.media('play', 65, 60);
    b.play(65, 60, 60);
    b.media('pause', 125, 120);
    expect(run(a).eligibleMs + run(b).eligibleMs).toBe(2 * MIN);
  });

  it('hidden-tab video playback is recorded raw but not credited by default', () => {
    const log = new EventLog();
    log.media('play', 0, 0);
    log.play(0, 0, 30);
    log.media('hidden', 30, 30);
    log.play(30, 30, 60);
    log.media('visible', 90, 90);
    log.play(90, 90, 30);
    const s = run(log);
    expect(s.eligibleMs).toBe(60_000);
    expect(s.rawMs).toBe(120_000);
  });

  it('hidden-tab audio playback is credited (background listening)', () => {
    const log = new EventLog();
    log.media('play', 0, 0);
    log.media('hidden', 0, 0);
    log.play(0, 0, 60);
    const s = replayPlayback(log.events as never, defaultPlaybackConfig('audio'), 600).summary();
    expect(s.eligibleMs).toBe(60_000);
  });
});

describe('video engagement verification', () => {
  const verification = (minMs: number, maxMs: number): VerificationConfig => ({
    minMs,
    maxMs,
    responseWindowMs: 30_000,
    rng: () => 0,
  });

  it('production defaults are 5 to 90 minutes with a 30 s response window', async () => {
    const { PRODUCTION_VIDEO_VERIFICATION } = await import('../src');
    expect(PRODUCTION_VIDEO_VERIFICATION).toEqual({
      minMs: 5 * MIN,
      maxMs: 90 * MIN,
      responseWindowMs: 30_000,
    });
  });

  it('a missed verification invalidates only the interval since the last verified point', () => {
    const cfg = { ...video(), verification: verification(60_000, 60_000) };
    const log = new EventLog();
    log.media('play', 0, 0);
    log.play(0, 0, 60);
    log.engagement('check_issued', 60, 'c1');
    log.play(60, 60, 10);
    log.engagement('check_responded', 70, 'c1');
    log.play(70, 70, 60); // window 2
    log.engagement('check_issued', 130, 'c2');
    log.play(130, 130, 30);
    log.engagement('check_missed', 160, 'c2');
    log.play(160, 160, 20); // keeps playing while suspended
    const s = replayPlayback(log.events as never, cfg, 600).summary();
    expect(s.eligibleMs).toBe(70_000); // first window (incl. the 10 s before responding) is preserved
    expect(s.unverifiedMs).toBe(110_000); // 60 + 30 from the failed window + 20 while suspended
    expect(s.checksMissed).toBe(1);
    expect(s.checksPassed).toBe(1);
  });

  it('a learner control action (play after pause) counts as resuming within the window', () => {
    const cfg = { ...video(), verification: verification(30_000, 30_000) };
    const log = new EventLog();
    log.media('play', 0, 0);
    log.play(0, 0, 30);
    log.engagement('check_issued', 30, 'c1');
    log.media('pause', 35, 35);
    log.media('play', 40, 35);
    log.play(40, 35, 20);
    const s = replayPlayback(log.events as never, cfg, 600).summary();
    expect(s.unverifiedMs).toBe(0);
    expect(s.eligibleMs).toBe(55_000);
  });

  it('live mode schedules a check once credited time reaches the randomised threshold', () => {
    let now = 1_000_000;
    const tracker = new PlaybackTracker(
      { ...video(), verification: { ...verification(5 * MIN, 90 * MIN), rng: () => 0.5 } },
      6000,
    );
    tracker.apply({
      id: 'p',
      sessionId: 's',
      seq: 0,
      t: now,
      kind: 'media',
      type: 'play',
      pos: 0,
      rate: 1,
      duration: 6000,
    });
    const threshold = 5 * MIN + 0.5 * 85 * MIN;
    expect(tracker.isCheckDue(now + threshold - 1000)).toBe(false);
    now += threshold;
    expect(tracker.isCheckDue(now)).toBe(true);
  });

  it('a check pending when the browser crashes is treated as missed', () => {
    const cfg = { ...video(), verification: verification(30_000, 30_000) };
    const log = new EventLog();
    log.media('play', 0, 0);
    log.play(0, 0, 30);
    log.engagement('check_issued', 30, 'c1');
    log.play(30, 30, 10);
    const s = replayPlayback(log.events as never, cfg, 600).summary();
    expect(s.eligibleMs).toBe(0);
    expect(s.unverifiedMs).toBe(40_000);
  });
});
