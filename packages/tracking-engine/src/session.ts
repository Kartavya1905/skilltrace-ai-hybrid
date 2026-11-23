/**
 * TrackedSession: the host-side glue used by both the Chrome extension content script and the
 * first-party Learning Lab. It numbers events, persists every event before applying it, drives
 * engagement checks, and exposes a live summary. Reconstruction from the persisted log uses the
 * same reducers, so live and reconstructed totals agree.
 */
import type { EngagementEvent, LearningEvent, MediaEvent, ReadingEvent, SessionMeta } from '@skilltrace/shared';
import { eventId, type Clock, systemClock, type Interval } from '@skilltrace/shared';
import {
  PlaybackTracker,
  defaultPlaybackConfig,
  replayPlayback,
  type PlaybackConfig,
  type PlaybackSummary,
  type VerificationConfig,
} from './playback';
import {
  ReadingTracker,
  defaultReadingConfig,
  replayReading,
  type CheckTrigger,
  type ReadingConfig,
  type ReadingSummary,
} from './reading';

export interface SessionResult {
  sessionId: string;
  contentType: SessionMeta['contentType'];
  startedAt: number;
  endedAt: number;
  rawMs: number;
  eligibleMs: number;
  unverifiedMs: number;
  revisionMs: number;
  pausedMs: number;
  coverageSec: number;
  coverageRatio: number;
  eligibleIntervals: Interval[];
  playback: PlaybackSummary | null;
  reading: ReadingSummary | null;
}

export interface TrackingOptions {
  videoVerification: VerificationConfig | null;
  creditHiddenVideo: boolean;
  readingWpm: number;
  readingRandomCheck: ReadingConfig['randomCheck'];
  responseWindowMultiplier: number;
  initialConsecutiveMissed: number;
}

export function playbackConfigFor(meta: SessionMeta, opts: TrackingOptions): PlaybackConfig {
  const kind = meta.contentType === 'audio' ? 'audio' : 'video';
  const base = defaultPlaybackConfig(kind);
  const v = kind === 'video' ? opts.videoVerification : null;
  return {
    ...base,
    creditHidden: kind === 'audio' ? true : opts.creditHiddenVideo,
    verification: v ? { ...v, responseWindowMs: Math.round(v.responseWindowMs * opts.responseWindowMultiplier) } : null,
  };
}

export function readingConfigFor(meta: SessionMeta, opts: TrackingOptions): ReadingConfig {
  const cfg = defaultReadingConfig(
    meta.wordCount,
    meta.sections.map((s) => ({ id: s.id, words: s.words })),
    opts.readingWpm,
  );
  return {
    ...cfg,
    responseWindowMs: Math.round(cfg.responseWindowMs * opts.responseWindowMultiplier),
    randomCheck: opts.readingRandomCheck,
    initialConsecutiveMissed: opts.initialConsecutiveMissed,
  };
}

const isMediaType = (t: SessionMeta['contentType']) => t === 'video' || t === 'audio';

export function summarize(
  meta: SessionMeta,
  playback: PlaybackTracker | null,
  reading: ReadingTracker | null,
  endedAt: number,
): SessionResult {
  if (playback) {
    const p = playback.summary();
    return {
      sessionId: meta.sessionId,
      contentType: meta.contentType,
      startedAt: meta.startedAt,
      endedAt,
      rawMs: p.rawMs,
      eligibleMs: p.eligibleMs,
      unverifiedMs: p.unverifiedMs,
      revisionMs: p.revisionMs,
      pausedMs: p.pausedMs,
      coverageSec: p.coverageSec,
      coverageRatio: p.coverageRatio,
      eligibleIntervals: p.eligibleIntervals,
      playback: p,
      reading: null,
    };
  }
  const r = reading!.summary();
  return {
    sessionId: meta.sessionId,
    contentType: meta.contentType,
    startedAt: meta.startedAt,
    endedAt,
    rawMs: r.rawMs,
    eligibleMs: r.creditedMs,
    unverifiedMs: r.forfeitedMs,
    revisionMs: 0,
    pausedMs: 0,
    coverageSec: (r.wordsSeen / Math.max(1, reading!.config.wpm)) * 60,
    coverageRatio: r.progressRatio,
    eligibleIntervals: r.creditedIntervals,
    playback: null,
    reading: r,
  };
}

/** Rebuild a session's totals from its persisted events. */
export function reconstructSession(meta: SessionMeta, events: readonly LearningEvent[], opts: TrackingOptions): SessionResult {
  const own = events.filter((e) => e.sessionId === meta.sessionId);
  const endedAt = own.reduce((m, e) => Math.max(m, e.t), meta.startedAt);
  if (isMediaType(meta.contentType)) {
    const media = own.filter((e): e is MediaEvent | EngagementEvent => e.kind === 'media' || e.kind === 'engagement');
    const tracker = replayPlayback(media, { ...playbackConfigFor(meta, opts) }, meta.durationSec);
    return summarize(meta, tracker, null, endedAt);
  }
  const reading = own.filter((e): e is ReadingEvent | EngagementEvent => e.kind === 'reading' || e.kind === 'engagement');
  const tracker = replayReading(reading, readingConfigFor(meta, opts));
  return summarize(meta, null, tracker, endedAt);
}

export interface CheckRequest {
  checkId: string;
  kind: 'video_presence' | 'reading_question';
  trigger: CheckTrigger | 'scheduled';
  issuedAt: number;
  expiresAt: number;
}

export interface TrackedSessionHooks {
  persist: (event: LearningEvent) => void | Promise<void>;
  onCheck?: (check: CheckRequest) => void;
  onCheckResolved?: (checkId: string, outcome: 'responded' | 'missed') => void;
  onPageReset?: () => void;
}

export class TrackedSession {
  readonly meta: SessionMeta;
  private seq = 0;
  private playback: PlaybackTracker | null = null;
  private reading: ReadingTracker | null = null;
  private lastMedia = { pos: 0, rate: 1, duration: 0 };
  private checkCounter = 0;
  private activeCheck: CheckRequest | null = null;
  private lastReadingCheckpoint = 0;

  constructor(
    meta: SessionMeta,
    opts: TrackingOptions,
    private readonly hooks: TrackedSessionHooks,
    private readonly clock: Clock = systemClock,
  ) {
    this.meta = meta;
    if (isMediaType(meta.contentType)) this.playback = new PlaybackTracker(playbackConfigFor(meta, opts), meta.durationSec);
    else this.reading = new ReadingTracker(readingConfigFor(meta, opts));
  }

  get pendingCheck(): CheckRequest | null {
    return this.activeCheck;
  }

  private next(): { id: string; sessionId: string; seq: number; t: number } {
    const seq = this.seq++;
    return { id: eventId(this.meta.sessionId, seq), sessionId: this.meta.sessionId, seq, t: Math.round(this.clock.now()) };
  }

  private record(e: LearningEvent): void {
    void this.hooks.persist(e);
    if (e.kind === 'reading') this.reading?.apply(e);
    else if (e.kind === 'media') this.playback?.apply(e);
    else {
      this.playback?.apply(e);
      this.reading?.apply(e);
    }
  }

  media(type: MediaEvent['type'], m: { pos: number; rate: number; duration: number; fromPos?: number; fromT?: number }): void {
    if (!this.playback) return;
    this.lastMedia = { pos: m.pos, rate: m.rate, duration: m.duration };
    const e: MediaEvent = { ...this.next(), kind: 'media', type, pos: m.pos, rate: m.rate, duration: m.duration };
    if (m.fromPos !== undefined) e.fromPos = m.fromPos;
    if (m.fromT !== undefined) e.fromT = Math.round(m.fromT);
    this.record(e);
  }

  readingEvent(type: ReadingEvent['type'], extra: { scrollRatio?: number; sectionId?: string } = {}): void {
    if (!this.reading) return;
    const e: ReadingEvent = { ...this.next(), kind: 'reading', type, ...extra };
    this.record(e);
  }

  private engagement(type: EngagementEvent['type'], checkId: string, correct?: boolean): void {
    const e: EngagementEvent = { ...this.next(), kind: 'engagement', type, checkId };
    if (correct !== undefined) e.correct = correct;
    this.record(e);
  }

  /** Issue a check now (scheduled by tick() or requested by the learner). */
  issueCheck(trigger: CheckRequest['trigger']): CheckRequest | null {
    if (this.activeCheck) return null;
    if (this.playback) this.media('checkpoint', this.lastMedia); // precise boundary for the window
    const checkId = `${this.meta.sessionId}_chk${this.checkCounter++}`;
    this.engagement('check_issued', checkId);
    const now = Math.round(this.clock.now());
    const windowMs = this.playback
      ? (this.playback.config.verification?.responseWindowMs ?? 30_000)
      : this.reading!.config.responseWindowMs;
    this.activeCheck = {
      checkId,
      kind: this.playback ? 'video_presence' : 'reading_question',
      trigger,
      issuedAt: now,
      expiresAt: now + windowMs,
    };
    this.hooks.onCheck?.(this.activeCheck);
    return this.activeCheck;
  }

  respond(checkId: string, correct?: boolean): void {
    if (this.activeCheck?.checkId !== checkId) return;
    this.engagement('check_responded', checkId, correct);
    this.activeCheck = null;
    this.hooks.onCheckResolved?.(checkId, 'responded');
  }

  private miss(checkId: string): void {
    const resetsBefore = this.reading?.state.resets ?? 0;
    this.engagement('check_missed', checkId);
    this.activeCheck = null;
    this.hooks.onCheckResolved?.(checkId, 'missed');
    if (this.reading && this.reading.state.resets > resetsBefore) this.hooks.onPageReset?.();
  }

  dispute(checkId: string): void {
    this.engagement('check_dispute', checkId);
  }

  /** Call about once per second while the page is open. */
  tick(): void {
    const now = this.clock.now();
    if (this.reading && now - this.lastReadingCheckpoint >= 5_000) {
      this.lastReadingCheckpoint = now;
      this.readingEvent('checkpoint');
    }
    if (this.activeCheck) {
      if (now >= this.activeCheck.expiresAt) this.miss(this.activeCheck.checkId);
      return;
    }
    if (this.playback?.isCheckDue(now)) this.issueCheck('scheduled');
    else if (this.reading) {
      const reason = this.reading.dueCheck(now);
      if (reason) this.issueCheck(reason);
    }
  }

  /** Learner pressed "check my understanding". */
  requestCheck(): CheckRequest | null {
    return this.issueCheck('user_requested');
  }

  isMediaSuspended(): boolean {
    return this.playback?.state.suspended ?? false;
  }

  summary(): SessionResult {
    const now = Math.round(this.clock.now());
    return summarize(this.meta, this.playback, this.reading, now);
  }

  /** Most recently visible reading section (for context-relevant questions). */
  get currentSectionId(): string | null {
    return this.reading?.state.sectionOrder.at(-1) ?? null;
  }

  get coveredRanges(): { start: number; end: number }[] {
    return this.playback?.summary().coveredRanges ?? [];
  }

  get consecutiveMissed(): number {
    return this.reading?.state.consecutiveMissed ?? 0;
  }
}
