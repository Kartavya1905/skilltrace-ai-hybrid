import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaSessionSwitch, cleanTitle, mediaAllowedOn, type SessionHandle } from '../src/page';

describe('cleanTitle', () => {
  it('drops the notification count and the YouTube suffix', () => {
    expect(cleanTitle('(1) Python Tutorial 2026 - YouTube', 'www.youtube.com')).toBe(
      'Python Tutorial 2026',
    );
    expect(
      cleanTitle('(99+) SQL Course for Beginners [Full Course] - YouTube', 'youtube.com'),
    ).toBe('SQL Course for Beginners [Full Course]');
  });

  it('keeps other sites’ titles, and numbers that are part of the title', () => {
    expect(cleanTitle('(3) Inbox - Mail', 'mail.example.com')).toBe('Inbox - Mail');
    expect(cleanTitle('Lecture (2) - Docs - YouTube', 'docs.example.com')).toBe(
      'Lecture (2) - Docs - YouTube',
    );
    expect(cleanTitle('Top 10 (2026) picks', 'www.youtube.com')).toBe('Top 10 (2026) picks');
  });

  it('never returns an empty title', () => {
    expect(cleanTitle('(1) YouTube', 'www.youtube.com')).toBe('YouTube');
    expect(cleanTitle('(2)', 'example.com')).toBe('(2)');
  });
});

describe('mediaAllowedOn', () => {
  it('allows YouTube watch, live, embed and Shorts pages only', () => {
    expect(mediaAllowedOn('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(mediaAllowedOn('https://m.youtube.com/watch?v=abc')).toBe(true);
    expect(mediaAllowedOn('https://www.youtube.com/live/abc')).toBe(true);
    expect(mediaAllowedOn('https://www.youtube-nocookie.com/embed/abc')).toBe(true);
    expect(mediaAllowedOn('https://www.youtube.com/shorts/abc')).toBe(true);
  });

  it('skips home-feed, search and channel previews', () => {
    expect(mediaAllowedOn('https://www.youtube.com/')).toBe(false);
    expect(mediaAllowedOn('https://www.youtube.com/results?search_query=python')).toBe(false);
    expect(mediaAllowedOn('https://www.youtube.com/@somechannel')).toBe(false);
    expect(mediaAllowedOn('https://www.youtube.com/feed/subscriptions')).toBe(false);
  });

  it('leaves other sites alone', () => {
    expect(mediaAllowedOn('https://learn.example.com/')).toBe(true);
    expect(mediaAllowedOn('http://localhost:5310/lab/extension-demo.html')).toBe(true);
    expect(mediaAllowedOn('not a url')).toBe(false);
  });
});

describe('MediaSessionSwitch', () => {
  let now: string | null;
  let started: { key: string; log: string[] }[];
  const start = (key: string): SessionHandle => {
    const s = { key, log: [] as string[] };
    started.push(s);
    return {
      stop: () => s.log.push('stop'),
      suspend: () => s.log.push('suspend'),
      resume: () => s.log.push('resume'),
    };
  };
  const make = () =>
    new MediaSessionSwitch(start, () => now, { startDelayMs: 1_000, parkMs: 60_000 });

  beforeEach(() => {
    vi.useFakeTimers();
    now = null;
    started = [];
  });
  afterEach(() => vi.useRealTimers());

  it('starts a session after the delay, once per key', () => {
    const sw = make();
    now = 'pageA|600';
    sw.observe(now);
    sw.observe(now);
    expect(started).toHaveLength(0);
    vi.advanceTimersByTime(1_000);
    expect(started.map((s) => s.key)).toEqual(['pageA|600']);
    sw.observe(now);
    expect(started).toHaveLength(1);
    expect(sw.activeKey).toBe('pageA|600');
  });

  it('keeps one session across an ad break', () => {
    const sw = make();
    now = 'pageA|11419';
    sw.observe(now);
    vi.advanceTimersByTime(1_000);
    // emptied + ad playing
    now = null;
    sw.interrupt();
    expect(sw.activeKey).toBeNull();
    vi.advanceTimersByTime(15_000);
    // the video comes back in the same element
    now = 'pageA|11419';
    sw.observe(now);
    expect(started).toHaveLength(1);
    expect(started[0]?.log).toEqual(['suspend', 'resume']);
    expect(sw.activeKey).toBe('pageA|11419');
  });

  it('keeps one session when an untagged ad with its own duration plays in between', () => {
    const sw = make();
    now = 'pageA|11419';
    sw.observe(now);
    vi.advanceTimersByTime(1_000);
    now = 'pageA|45';
    sw.observe(now);
    vi.advanceTimersByTime(1_000); // the 45 s ad gets its own short session
    now = 'pageA|11419';
    sw.observe(now);
    expect(started.map((s) => s.key)).toEqual(['pageA|11419', 'pageA|45']);
    expect(started[0]?.log).toEqual(['suspend', 'resume']);
    expect(started[1]?.log).toEqual(['suspend']);
  });

  it('ends the parked session when the learner moves to another video', () => {
    const sw = make();
    now = 'pageA|600';
    sw.observe(now);
    vi.advanceTimersByTime(1_000);
    sw.interrupt(); // emptied: leaving for the next video
    now = 'pageB|900';
    sw.observe(now);
    expect(started[0]?.log).toEqual(['suspend', 'stop']);
    vi.advanceTimersByTime(1_000);
    expect(started.map((s) => s.key)).toEqual(['pageA|600', 'pageB|900']);
  });

  it('ends a parked session that never comes back', () => {
    const sw = make();
    now = 'pageA|600';
    sw.observe(now);
    vi.advanceTimersByTime(1_000);
    now = null;
    sw.interrupt();
    vi.advanceTimersByTime(60_000);
    expect(started[0]?.log).toEqual(['suspend', 'stop']);
  });

  it('does not start when the content changed during the delay', () => {
    const sw = make();
    now = 'pageA|600';
    sw.observe('pageA|600');
    now = null; // an ad started
    vi.advanceTimersByTime(1_000);
    expect(started).toHaveLength(0);
  });

  it('stopAll ends current and parked sessions', () => {
    const sw = make();
    now = 'pageA|600';
    sw.observe(now);
    vi.advanceTimersByTime(1_000);
    now = 'pageA|700';
    sw.observe(now);
    vi.advanceTimersByTime(1_000);
    sw.stopAll();
    expect(started[0]?.log).toEqual(['suspend', 'stop']);
    expect(started[1]?.log).toEqual(['stop']);
  });
});
