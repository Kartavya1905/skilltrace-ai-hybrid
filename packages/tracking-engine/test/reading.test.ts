import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BASELINE_WPM,
  ReadingTracker,
  countWords,
  defaultReadingConfig,
  estimateReadingSpeed,
  expectedReadingMs,
  observedWpm,
  pageCreditedMs,
  replayReading,
} from '../src';
import { EventLog, MIN } from './helpers';

const sections = [
  { id: 'a', words: 500 },
  { id: 'b', words: 500 },
  { id: 'c', words: 500 },
];

describe('word counts and expected duration', () => {
  it('counts words including contractions and numbers', () => {
    expect(countWords("Python's functions return 2 values, don't they?")).toBe(7);
    expect(countWords('   ')).toBe(0);
  });

  it('uses 238 wpm as the default baseline', () => {
    expect(DEFAULT_BASELINE_WPM).toBe(238);
    expect(expectedReadingMs(2380, 238)).toBe(10 * MIN);
  });
});

describe('personalised reading speed', () => {
  it('1,500 words in 10 minutes is 150 wpm', () => {
    expect(observedWpm(1500, 10 * MIN)).toBe(150);
  });

  it('stays on the baseline until several credible sessions exist', () => {
    expect(estimateReadingSpeed([150, 160])).toMatchObject({ wpm: 238, personalised: false });
  });

  it('moves toward the learner pace and excludes outliers', () => {
    const est = estimateReadingSpeed([150, 155, 148, 152, 900]);
    expect(est.personalised).toBe(true);
    expect(est.excludedOutliers).toBe(1);
    expect(est.wpm).toBeGreaterThan(150);
    expect(est.wpm).toBeLessThan(200);
    // more evidence -> closer to the learner's pace
    const more = estimateReadingSpeed([150, 155, 148, 152, 150, 149, 151, 153, 150, 150]);
    expect(Math.abs(more.wpm - 150)).toBeLessThan(Math.abs(est.wpm - 150));
  });
});

function openPage(log: EventLog) {
  log.reading('open', 0);
  log.reading('section_visible', 0, { sectionId: 'a' });
}

describe('reading engagement checks', () => {
  it('credits active reading time and progress separately', () => {
    const log = new EventLog();
    openPage(log);
    log.reading('scroll', 60, { scrollRatio: 0.3 });
    log.reading('section_visible', 120, { sectionId: 'b' });
    log.reading('scroll', 240, { scrollRatio: 0.7 });
    log.reading('section_visible', 300, { sectionId: 'c' });
    log.reading('checkpoint', 360);
    const s = replayReading(log.events as never, defaultReadingConfig(1500, sections, 150)).summary();
    expect(s.creditedMs).toBe(6 * MIN);
    expect(s.progressRatio).toBe(1);
  });

  it('stops crediting after the idle limit with no activity', () => {
    const cfg = defaultReadingConfig(1500, sections, 150); // idle limit = 5 min (500 words @150 x1.5 capped)
    const log = new EventLog();
    openPage(log);
    log.reading('checkpoint', 3600); // an hour later, no activity
    const s = replayReading(log.events as never, cfg).summary();
    expect(s.creditedMs).toBe(cfg.idleLimitMs);
  });

  it('fast scrolling triggers a verification question', () => {
    const t = new ReadingTracker(defaultReadingConfig(3000, [], 238));
    const base = 1_000_000;
    t.apply({ id: '1', sessionId: 's', seq: 1, t: base, kind: 'reading', type: 'open' });
    t.apply({ id: '2', sessionId: 's', seq: 2, t: base + 1000, kind: 'reading', type: 'scroll', scrollRatio: 0.05 });
    t.apply({ id: '3', sessionId: 's', seq: 3, t: base + 6000, kind: 'reading', type: 'scroll', scrollRatio: 0.9 });
    expect(t.dueCheck(base + 6000)).toBe('rapid_scroll');
  });

  it('pauses credit while a question is open and resumes after a valid response', () => {
    const log = new EventLog();
    openPage(log);
    log.engagement('check_issued', 60, 'q1');
    log.engagement('check_responded', 90, 'q1', true);
    log.reading('checkpoint', 150);
    const s = replayReading(log.events as never, defaultReadingConfig(1500, sections, 150)).summary();
    expect(s.creditedMs).toBe(2 * MIN); // 0-60 and 90-150; the 30 s question window is not credited
    expect(s.answersCorrect).toBe(1);
  });

  it('an incorrect answer causes no time penalty', () => {
    const run = (correct: boolean) => {
      const log = new EventLog();
      openPage(log);
      log.engagement('check_issued', 60, 'q1');
      log.engagement('check_responded', 70, 'q1', correct);
      log.reading('checkpoint', 130);
      return replayReading(log.events as never, defaultReadingConfig(1500, sections, 150)).summary();
    };
    const right = run(true);
    const wrong = run(false);
    expect(wrong.creditedMs).toBe(right.creditedMs);
    expect(wrong.answersIncorrect).toBe(1);
    expect(wrong.consecutiveMissed).toBe(0);
  });

  it('five consecutive missed checks reset credited page time but keep the raw log', () => {
    const log = new EventLog();
    openPage(log);
    let t = 60;
    for (let i = 0; i < 5; i++) {
      log.reading('interaction', t);
      log.engagement('check_issued', t + 30, `q${i}`);
      log.engagement('check_missed', t + 90, `q${i}`);
      t += 120;
    }
    const tracker = replayReading(log.events as never, defaultReadingConfig(1500, sections, 150));
    const s = tracker.summary();
    expect(s.resets).toBe(1);
    expect(s.creditedMs).toBe(0);
    expect(s.forfeitedMs).toBeGreaterThan(0);
    expect(s.rawMs).toBeGreaterThan(0);
    expect(tracker.state.audit.some((a) => a.type === 'page_reset')).toBe(true);
    expect(log.events.length).toBeGreaterThan(10); // raw events untouched
  });

  it('a valid response resets the consecutive-missed counter', () => {
    const log = new EventLog();
    openPage(log);
    let t = 60;
    for (let i = 0; i < 4; i++) {
      log.engagement('check_issued', t, `m${i}`);
      log.engagement('check_missed', t + 60, `m${i}`);
      t += 70;
    }
    log.engagement('check_issued', t, 'ok');
    log.engagement('check_responded', t + 5, 'ok', false);
    log.engagement('check_issued', t + 10, 'm5');
    log.engagement('check_missed', t + 70, 'm5');
    const s = replayReading(log.events as never, defaultReadingConfig(1500, sections, 150)).summary();
    expect(s.resets).toBe(0);
    expect(s.consecutiveMissed).toBe(1);
  });

  it('a page reset leaves other pages unchanged', () => {
    const credits = pageCreditedMs([
      { sessionId: 'p1-a', pageId: 'p1', creditedMs: 5 * MIN, resets: 0, lastResetAt: null, endedAt: 100 },
      { sessionId: 'p1-b', pageId: 'p1', creditedMs: 0, resets: 1, lastResetAt: 200, endedAt: 250 },
      { sessionId: 'p2-a', pageId: 'p2', creditedMs: 7 * MIN, resets: 0, lastResetAt: null, endedAt: 220 },
    ]);
    expect(credits.get('p1')).toBe(0);
    expect(credits.get('p2')).toBe(7 * MIN);
  });

  it('counts revisits when returning to an earlier section', () => {
    const log = new EventLog();
    openPage(log);
    log.reading('section_visible', 60, { sectionId: 'b' });
    log.reading('section_visible', 120, { sectionId: 'c' });
    log.reading('section_visible', 180, { sectionId: 'a' });
    const s = replayReading(log.events as never, defaultReadingConfig(1500, sections, 150)).summary();
    expect(s.revisits).toBe(1);
  });

  it('a complete, plausible session is credible for personalisation', () => {
    const log = new EventLog();
    openPage(log);
    log.reading('scroll', 100, { scrollRatio: 0.2 });
    log.reading('section_visible', 200, { sectionId: 'b' });
    log.reading('scroll', 300, { scrollRatio: 0.5 });
    log.reading('section_visible', 400, { sectionId: 'c' });
    log.reading('scroll', 500, { scrollRatio: 0.9 });
    log.reading('checkpoint', 600);
    const s = replayReading(log.events as never, defaultReadingConfig(1500, sections, 238)).summary();
    expect(s.credible).toBe(true);
    expect(s.observedWpm).toBe(150);
  });
});
