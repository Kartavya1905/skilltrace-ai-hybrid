/**
 * Reading activity tracker for documents and web pages.
 *
 * Reading progress (which sections were visible long enough) and eligible reading time are
 * tracked separately, and neither is a measure of comprehension. Engagement questions pause
 * crediting while they are open. Incorrect answers carry no penalty. Five consecutive missed
 * questions on the same page reset that page's credited time; the raw event log is kept.
 */
import type { EngagementEvent, Interval, ReadingEvent } from '@skilltrace/shared';
import { mergeIntervals } from '@skilltrace/shared';

/** Configurable starting reference for ordinary English non-fiction (not an individual's speed). */
export const DEFAULT_BASELINE_WPM = 238;

export interface ReadingSection {
  id: string;
  words: number;
}

export interface ReadingConfig {
  wordCount: number;
  sections: ReadingSection[];
  /** Learner's current estimated pace (baseline or personalised). */
  wpm: number;
  /** Credit stops this long after the last sign of activity (scroll, section change, focus, interaction). */
  idleLimitMs: number;
  /** Time to answer an engagement question. */
  responseWindowMs: number;
  /** Consecutive missed questions on one page that reset its credited time. */
  missLimit: number;
  /** Scrolling faster than this multiple of the learner's pace is "rapid". */
  rapidScrollFactor: number;
  /** Random check interval bounds in credited ms; null disables random checks. */
  randomCheck: { minMs: number; maxMs: number; rng: () => number } | null;
  /** Consecutive misses carried over from earlier sessions on the same page. */
  initialConsecutiveMissed: number;
}

export function expectedReadingMs(words: number, wpm: number): number {
  if (words <= 0 || wpm <= 0) return 0;
  return Math.round((words / wpm) * 60_000);
}

export function countWords(text: string): number {
  const matches = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu);
  return matches ? matches.length : 0;
}

export function defaultReadingConfig(
  wordCount: number,
  sections: ReadingSection[],
  wpm = DEFAULT_BASELINE_WPM,
): ReadingConfig {
  // Idle allowance: the longest section's expected time, bounded to 1-5 minutes.
  const longest = sections.reduce((m, s) => Math.max(m, s.words), 0);
  const idleLimitMs = Math.min(300_000, Math.max(60_000, expectedReadingMs(longest, wpm) * 1.5));
  return {
    wordCount,
    sections,
    wpm,
    idleLimitMs,
    responseWindowMs: 60_000,
    missLimit: 5,
    rapidScrollFactor: 3,
    randomCheck: null,
    initialConsecutiveMissed: 0,
  };
}

export type CheckTrigger =
  'rapid_scroll' | 'inactivity' | 'implausible_progress' | 'random' | 'user_requested';

export interface ReadingAuditEntry {
  t: number;
  type: 'check_issued' | 'check_responded' | 'check_missed' | 'page_reset';
  detail: string;
}

export interface ReadingState {
  visible: boolean;
  focused: boolean;
  lastT: number;
  firstT: number;
  lastActivityT: number;
  rawMs: number;
  creditedMs: number;
  forfeitedMs: number;
  creditedIntervals: Interval[];
  sectionsSeen: Set<string>;
  sectionOrder: string[];
  revisits: number;
  maxScrollRatio: number;
  scrollSamples: { t: number; ratio: number }[];
  pendingCheck: { checkId: string; issuedAt: number; trigger: string } | null;
  consecutiveMissed: number;
  checksIssued: number;
  checksResponded: number;
  checksMissed: number;
  answersCorrect: number;
  answersIncorrect: number;
  resets: number;
  lastResetAt: number | null;
  nextRandomAtMs: number;
  audit: ReadingAuditEntry[];
  seenIds: Set<string>;
  closed: boolean;
}

export interface ReadingSummary {
  rawMs: number;
  creditedMs: number;
  forfeitedMs: number;
  expectedMs: number;
  progressRatio: number;
  wordsSeen: number;
  revisits: number;
  observedWpm: number | null;
  credible: boolean;
  resets: number;
  consecutiveMissed: number;
  checksIssued: number;
  checksResponded: number;
  checksMissed: number;
  answersCorrect: number;
  answersIncorrect: number;
  creditedIntervals: Interval[];
}

export class ReadingTracker {
  readonly config: ReadingConfig;
  private s: ReadingState;

  constructor(config: ReadingConfig) {
    this.config = config;
    this.s = {
      visible: true,
      focused: true,
      lastT: 0,
      firstT: 0,
      lastActivityT: 0,
      rawMs: 0,
      creditedMs: 0,
      forfeitedMs: 0,
      creditedIntervals: [],
      sectionsSeen: new Set(),
      sectionOrder: [],
      revisits: 0,
      maxScrollRatio: 0,
      scrollSamples: [],
      pendingCheck: null,
      consecutiveMissed: config.initialConsecutiveMissed,
      checksIssued: 0,
      checksResponded: 0,
      checksMissed: 0,
      answersCorrect: 0,
      answersIncorrect: 0,
      resets: 0,
      lastResetAt: null,
      nextRandomAtMs: 0,
      audit: [],
      seenIds: new Set(),
      closed: false,
    };
    this.s.nextRandomAtMs = this.drawRandom(0);
  }

  get state(): Readonly<ReadingState> {
    return this.s;
  }

  private drawRandom(fromMs: number): number {
    const r = this.config.randomCheck;
    if (!r) return Number.POSITIVE_INFINITY;
    return fromMs + Math.round(r.minMs + r.rng() * (r.maxMs - r.minMs));
  }

  private get active(): boolean {
    return this.s.visible && this.s.focused && !this.s.pendingCheck && !this.s.closed;
  }

  /** Credit elapsed time up to t, but never more than idleLimitMs past the last activity. */
  private advance(t: number): void {
    if (this.s.lastT === 0 || t <= this.s.lastT) return;
    const from = this.s.lastT;
    if (this.s.visible && !this.s.closed) this.s.rawMs += t - from;
    if (this.active) {
      const cap = this.s.lastActivityT + this.config.idleLimitMs;
      const end = Math.min(t, cap);
      if (end > from) {
        this.s.creditedMs += end - from;
        this.s.creditedIntervals.push({ start: from, end });
      }
    }
  }

  private markActivity(t: number): void {
    this.s.lastActivityT = t;
  }

  private progressWords(): number {
    let words = 0;
    for (const sec of this.config.sections) if (this.s.sectionsSeen.has(sec.id)) words += sec.words;
    if (this.config.sections.length === 0)
      words = Math.round(this.s.maxScrollRatio * this.config.wordCount);
    return Math.min(words, this.config.wordCount);
  }

  apply(e: ReadingEvent | EngagementEvent): void {
    if (this.s.seenIds.has(e.id) || e.t < this.s.lastT) return;
    this.s.seenIds.add(e.id);
    if (this.s.firstT === 0) {
      this.s.firstT = e.t;
      this.s.lastActivityT = e.t;
    }
    this.advance(e.t);
    if (e.kind === 'engagement') this.applyEngagement(e);
    else this.applyReading(e);
    this.s.lastT = e.t;
  }

  private applyReading(e: ReadingEvent): void {
    switch (e.type) {
      case 'open':
        this.s.visible = true;
        this.s.focused = true;
        this.markActivity(e.t);
        break;
      case 'scroll':
        if (typeof e.scrollRatio === 'number') {
          this.s.maxScrollRatio = Math.max(this.s.maxScrollRatio, e.scrollRatio);
          this.s.scrollSamples.push({ t: e.t, ratio: e.scrollRatio });
          if (this.s.scrollSamples.length > 50) this.s.scrollSamples.shift();
        }
        this.markActivity(e.t);
        break;
      case 'section_visible':
        if (e.sectionId) {
          const idx = this.config.sections.findIndex((s) => s.id === e.sectionId);
          if (this.s.sectionsSeen.has(e.sectionId)) {
            // Returning to an earlier section after reading further counts as a revisit.
            const furthest = Math.max(
              ...this.s.sectionOrder.map((id) =>
                this.config.sections.findIndex((s) => s.id === id),
              ),
            );
            if (idx >= 0 && idx < furthest && this.s.sectionOrder.at(-1) !== e.sectionId)
              this.s.revisits += 1;
          } else {
            this.s.sectionsSeen.add(e.sectionId);
          }
          this.s.sectionOrder.push(e.sectionId);
        }
        this.markActivity(e.t);
        break;
      case 'interaction':
      case 'focus':
        this.s.focused = true;
        this.markActivity(e.t);
        break;
      case 'blur':
        this.s.focused = false;
        break;
      case 'hidden':
        this.s.visible = false;
        break;
      case 'visible':
        this.s.visible = true;
        this.markActivity(e.t);
        break;
      case 'checkpoint':
        // Persists elapsed time without counting as a sign of activity.
        break;
      case 'close':
        this.s.closed = true;
        break;
    }
  }

  private applyEngagement(e: EngagementEvent): void {
    switch (e.type) {
      case 'check_issued':
        if (!this.s.pendingCheck) {
          this.s.pendingCheck = { checkId: e.checkId, issuedAt: e.t, trigger: 'issued' };
          this.s.checksIssued += 1;
          this.s.audit.push({ t: e.t, type: 'check_issued', detail: e.checkId });
        }
        break;
      case 'check_responded':
        if (this.s.pendingCheck?.checkId !== e.checkId) break;
        this.s.pendingCheck = null;
        this.s.checksResponded += 1;
        this.s.consecutiveMissed = 0;
        // Correctness is recorded separately and never reduces credited time.
        if (e.correct === true) this.s.answersCorrect += 1;
        if (e.correct === false) this.s.answersIncorrect += 1;
        this.markActivity(e.t);
        this.s.nextRandomAtMs = this.drawRandom(this.s.creditedMs);
        this.s.audit.push({
          t: e.t,
          type: 'check_responded',
          detail: `${e.checkId}:${String(e.correct)}`,
        });
        break;
      case 'check_missed':
        if (this.s.pendingCheck?.checkId !== e.checkId) break;
        this.s.pendingCheck = null;
        this.s.checksMissed += 1;
        this.s.consecutiveMissed += 1;
        this.s.audit.push({
          t: e.t,
          type: 'check_missed',
          detail: `${e.checkId}:${this.s.consecutiveMissed}`,
        });
        if (this.s.consecutiveMissed >= this.config.missLimit) this.resetPage(e.t);
        this.s.nextRandomAtMs = this.drawRandom(this.s.creditedMs);
        break;
      case 'check_dispute':
        break;
    }
  }

  private resetPage(t: number): void {
    this.s.forfeitedMs += this.s.creditedMs;
    this.s.audit.push({ t, type: 'page_reset', detail: `forfeited ${this.s.creditedMs} ms` });
    this.s.creditedMs = 0;
    this.s.creditedIntervals = [];
    this.s.resets += 1;
    this.s.lastResetAt = t;
    this.s.consecutiveMissed = 0;
  }

  /** Live mode: returns the reason a question should be shown now, or null. */
  dueCheck(t: number): CheckTrigger | null {
    if (this.s.pendingCheck || this.s.closed || !this.s.visible) return null;
    // Long inactivity while the page is open and visible.
    if (this.s.focused && t - this.s.lastActivityT >= this.config.idleLimitMs) return 'inactivity';
    // Rapid scrolling over the last 20 s compared with the learner's pace.
    const recent = this.s.scrollSamples.filter((p) => t - p.t <= 20_000);
    if (recent.length >= 2) {
      const first = recent[0]!;
      const last = recent[recent.length - 1]!;
      const minutes = Math.max((last.t - first.t) / 60_000, 1 / 60);
      const words = Math.abs(last.ratio - first.ratio) * this.config.wordCount;
      if (words >= 150 && words / minutes > this.config.wpm * this.config.rapidScrollFactor)
        return 'rapid_scroll';
    }
    // Implausible progress: far more words "seen" than the credited time allows.
    const seen = this.progressWords();
    const creditedMin = this.s.creditedMs / 60_000;
    if (seen >= this.config.wordCount * 0.3 && this.s.creditedMs >= 30_000) {
      if (seen / creditedMin > this.config.wpm * (this.config.rapidScrollFactor + 1))
        return 'implausible_progress';
    }
    if (this.s.focused && this.s.creditedMs >= this.s.nextRandomAtMs) return 'random';
    return null;
  }

  isCheckExpired(t: number): boolean {
    const p = this.s.pendingCheck;
    return !!p && t - p.issuedAt >= this.config.responseWindowMs;
  }

  /** Close the session at t (call with the last persisted event time). */
  finalize(t?: number): void {
    if (t !== undefined) this.advance(t);
    this.s.closed = true;
  }

  summary(): ReadingSummary {
    const expectedMs = expectedReadingMs(this.config.wordCount, this.config.wpm);
    const wordsSeen = this.progressWords();
    const progressRatio = this.config.wordCount > 0 ? wordsSeen / this.config.wordCount : 0;
    const minutes = this.s.creditedMs / 60_000;
    // A session is credible for pace personalisation only if it is substantially complete,
    // long enough, uninterrupted by missed checks, and within plausible human bounds.
    const observedWpm = minutes > 0 ? wordsSeen / minutes : null;
    const credible =
      progressRatio >= 0.9 &&
      this.s.creditedMs >= 60_000 &&
      this.s.checksMissed === 0 &&
      this.s.resets === 0 &&
      observedWpm !== null &&
      observedWpm >= 50 &&
      observedWpm <= 800;
    return {
      rawMs: this.s.rawMs,
      creditedMs: this.s.creditedMs,
      forfeitedMs: this.s.forfeitedMs,
      expectedMs,
      progressRatio,
      wordsSeen,
      revisits: this.s.revisits,
      observedWpm: observedWpm === null ? null : Math.round(observedWpm),
      credible,
      resets: this.s.resets,
      consecutiveMissed: this.s.consecutiveMissed,
      checksIssued: this.s.checksIssued,
      checksResponded: this.s.checksResponded,
      checksMissed: this.s.checksMissed,
      answersCorrect: this.s.answersCorrect,
      answersIncorrect: this.s.answersIncorrect,
      creditedIntervals: mergeIntervals(this.s.creditedIntervals),
    };
  }
}

export function replayReading(
  events: readonly (ReadingEvent | EngagementEvent)[],
  config: ReadingConfig,
): ReadingTracker {
  const tracker = new ReadingTracker(config);
  const unique = new Map<string, ReadingEvent | EngagementEvent>();
  for (const e of events) if (!unique.has(e.id)) unique.set(e.id, e);
  for (const e of [...unique.values()].sort((a, b) => a.t - b.t || a.seq - b.seq)) tracker.apply(e);
  tracker.finalize();
  return tracker;
}

/**
 * Page-level ledger: five consecutive misses reset credit for that page only, across its
 * sessions. Sessions are given in chronological order with their summaries.
 */
export interface PageSessionCredit {
  sessionId: string;
  pageId: string;
  creditedMs: number;
  resets: number;
  lastResetAt: number | null;
  endedAt: number;
}

export function pageCreditedMs(sessions: readonly PageSessionCredit[]): Map<string, number> {
  const byPage = new Map<string, PageSessionCredit[]>();
  for (const s of sessions) byPage.set(s.pageId, [...(byPage.get(s.pageId) ?? []), s]);
  const out = new Map<string, number>();
  for (const [pageId, list] of byPage) {
    const lastReset = Math.max(...list.map((s) => s.lastResetAt ?? -1));
    let total = 0;
    for (const s of list) {
      // Sessions that ended before the page's most recent reset no longer earn credit.
      if (lastReset >= 0 && s.endedAt <= lastReset && s.lastResetAt !== lastReset) continue;
      total += s.creditedMs;
    }
    out.set(pageId, total);
  }
  return out;
}
