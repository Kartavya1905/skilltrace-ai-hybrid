/**
 * Deterministic, event-driven playback tracker for HTML5 video and audio.
 *
 * Core rule:  active learning time = eligible REAL elapsed playback time
 *             content coverage     = unique media positions covered
 * These are stored separately. Re-watching adds active time and revision time but never coverage.
 *
 * The tracker is a pure reducer over an append-only event log, so persisting the events is enough
 * to reconstruct a session after a refresh, crash or service-worker suspension. Time after the last
 * persisted event is never credited.
 */
import type { EngagementEvent, Interval, MediaEvent } from '@skilltrace/shared';
import { mergeIntervals, unionLength } from '@skilltrace/shared';

export type SegmentStatus =
  'eligible' | 'pending_verification' | 'unverified' | 'hidden' | 'discontinuity';

export interface PlaybackSegment {
  /** Wall-clock span (epoch ms) during which the media was playing. */
  start: number;
  end: number;
  fromPos: number;
  toPos: number;
  rate: number;
  /** Real elapsed ms credited for this span (before status filtering). */
  creditedMs: number;
  status: SegmentStatus;
  windowId: number;
}

export interface VerificationConfig {
  /** Credited time between checks is drawn uniformly from [minMs, maxMs]. */
  minMs: number;
  maxMs: number;
  /** Time the learner has to respond (or resume activity) once a check is shown. */
  responseWindowMs: number;
  /** Injectable RNG in [0, 1) for deterministic tests. */
  rng: () => number;
}

/** Production bounds: 5 to 90 minutes, 30 s to respond. */
export const PRODUCTION_VIDEO_VERIFICATION: Omit<VerificationConfig, 'rng'> = {
  minMs: 5 * 60_000,
  maxMs: 90 * 60_000,
  responseWindowMs: 30_000,
};

/** DEMO mode only: shortened intervals so a judge can see a check within a minute. */
export const DEMO_VIDEO_VERIFICATION: Omit<VerificationConfig, 'rng'> = {
  minMs: 20_000,
  maxMs: 45_000,
  responseWindowMs: 30_000,
};

export interface PlaybackConfig {
  /** Credit playback while the tab is hidden. Default false for video, true for audio. */
  creditHidden: boolean;
  /** Allowed drift (s) between media advance and real time x rate before a span is a discontinuity. */
  toleranceSec: number;
  verification: VerificationConfig | null;
}

export function defaultPlaybackConfig(kind: 'video' | 'audio'): PlaybackConfig {
  return { creditHidden: kind === 'audio', toleranceSec: 1.5, verification: null };
}

interface Anchor {
  t: number;
  pos: number;
  rate: number;
}

export interface PendingCheck {
  checkId: string;
  issuedAt: number;
}

export interface PlaybackState {
  duration: number;
  rate: number;
  playing: boolean;
  hidden: boolean;
  anchor: Anchor | null;
  lastT: number;
  firstT: number;
  pausedSince: number | null;
  pausedMs: number;
  rawMs: number;
  segments: PlaybackSegment[];
  seenIds: Set<string>;
  ignoredOutOfOrder: number;
  // verification
  windowId: number;
  windowThresholdMs: number;
  pendingCheck: PendingCheck | null;
  suspended: boolean;
  checksIssued: number;
  checksPassed: number;
  checksMissed: number;
}

export interface PlaybackSummary {
  rawMs: number;
  eligibleMs: number;
  pendingMs: number;
  unverifiedMs: number;
  hiddenMs: number;
  revisionMs: number;
  pausedMs: number;
  coverageSec: number;
  coverageRatio: number;
  coveredRanges: Interval[];
  eligibleIntervals: Interval[];
  checksIssued: number;
  checksPassed: number;
  checksMissed: number;
}

export class PlaybackTracker {
  readonly config: PlaybackConfig;
  private s: PlaybackState;

  constructor(config: PlaybackConfig, duration = 0) {
    this.config = config;
    this.s = {
      duration,
      rate: 1,
      playing: false,
      hidden: false,
      anchor: null,
      lastT: 0,
      firstT: 0,
      pausedSince: null,
      pausedMs: 0,
      rawMs: 0,
      segments: [],
      seenIds: new Set(),
      ignoredOutOfOrder: 0,
      windowId: 0,
      windowThresholdMs: 0,
      pendingCheck: null,
      suspended: false,
      checksIssued: 0,
      checksPassed: 0,
      checksMissed: 0,
    };
    this.s.windowThresholdMs = this.drawThreshold();
  }

  get state(): Readonly<PlaybackState> {
    return this.s;
  }

  private drawThreshold(): number {
    const v = this.config.verification;
    if (!v) return Number.POSITIVE_INFINITY;
    return Math.round(v.minMs + v.rng() * (v.maxMs - v.minMs));
  }

  private currentStatus(): SegmentStatus {
    if (this.s.hidden && !this.config.creditHidden) return 'hidden';
    if (this.s.suspended) return 'unverified';
    if (this.config.verification) return 'pending_verification';
    return 'eligible';
  }

  /** Close the open span at (t, pos) using the state that held during the span. */
  private close(t: number, pos: number): void {
    const a = this.s.anchor;
    if (!this.s.playing || !a) return;
    const dtMs = t - a.t;
    if (dtMs <= 0) return;
    this.s.rawMs += dtMs;
    const dp = pos - a.pos;
    const expected = (dtMs / 1000) * a.rate;
    const tol = Math.max(this.config.toleranceSec, expected * 0.1);
    let status = this.currentStatus();
    let creditedMs = 0;
    let toPos = a.pos;
    if (dp > 0 && dp <= expected + tol) {
      creditedMs = Math.min(dtMs, (dp / a.rate) * 1000);
      toPos = pos;
    } else if (dp > expected + tol) {
      // Media advanced faster than real time allows without a seek event: skipped content.
      status = 'discontinuity';
    }
    // dp <= 0: stalled/buffering (0 credit) or an unannounced rewind; nothing credited.
    if (creditedMs > 0 || status === 'discontinuity') {
      this.s.segments.push({
        start: a.t,
        end: a.t + creditedMs,
        fromPos: a.pos,
        toPos,
        rate: a.rate,
        creditedMs,
        status,
        windowId: this.s.windowId,
      });
    }
  }

  private reanchor(t: number, pos: number): void {
    this.s.anchor = this.s.playing ? { t, pos, rate: this.s.rate } : null;
  }

  private estimatePos(t: number): number {
    const a = this.s.anchor;
    if (!a) return 0;
    const est = a.pos + ((t - a.t) / 1000) * a.rate;
    return this.s.duration > 0 ? Math.min(est, this.s.duration) : est;
  }

  /** Credited ms in the current verification window, including the open span estimate. */
  windowCreditedMs(t: number): number {
    let ms = 0;
    for (const seg of this.s.segments)
      if (seg.windowId === this.s.windowId && seg.status === 'pending_verification')
        ms += seg.creditedMs;
    if (this.s.playing && this.s.anchor && this.currentStatus() === 'pending_verification')
      ms += Math.max(0, t - this.s.anchor.t);
    return ms;
  }

  /** Live mode: should the host show a verification prompt now? */
  isCheckDue(t: number): boolean {
    if (!this.config.verification || this.s.pendingCheck || this.s.suspended || !this.s.playing)
      return false;
    return this.windowCreditedMs(t) >= this.s.windowThresholdMs;
  }

  /** Live mode: has the pending check's response window expired? */
  isCheckExpired(t: number): boolean {
    const p = this.s.pendingCheck;
    const v = this.config.verification;
    return !!p && !!v && t - p.issuedAt >= v.responseWindowMs;
  }

  private passWindow(): void {
    for (const seg of this.s.segments)
      if (seg.windowId === this.s.windowId && seg.status === 'pending_verification')
        seg.status = 'eligible';
    this.s.checksPassed += this.s.pendingCheck ? 1 : 0;
    this.s.pendingCheck = null;
    this.s.suspended = false;
    this.s.windowId += 1;
    this.s.windowThresholdMs = this.drawThreshold();
  }

  private failWindow(): void {
    for (const seg of this.s.segments)
      if (seg.windowId === this.s.windowId && seg.status === 'pending_verification')
        seg.status = 'unverified';
    this.s.checksMissed += 1;
    this.s.pendingCheck = null;
    this.s.suspended = true;
    this.s.windowId += 1;
  }

  /** Apply one event. Duplicates (same id) and out-of-order events are ignored. */
  apply(e: MediaEvent | EngagementEvent): void {
    if (this.s.seenIds.has(e.id)) return;
    if (e.t < this.s.lastT) {
      this.s.ignoredOutOfOrder += 1;
      return;
    }
    this.s.seenIds.add(e.id);
    if (this.s.firstT === 0) this.s.firstT = e.t;
    if (e.kind === 'engagement') {
      this.applyEngagement(e);
      this.s.lastT = e.t;
      return;
    }
    if (e.duration > 0) this.s.duration = e.duration;
    const wasPlaying = this.s.playing;
    // A learner-initiated control action during a pending check counts as resuming activity.
    const userAction = e.type === 'play' || e.type === 'seeked' || e.type === 'ratechange';

    switch (e.type) {
      case 'play':
      case 'playing':
        if (wasPlaying) this.close(e.t, e.pos);
        if (!wasPlaying && this.s.pausedSince !== null) {
          this.s.pausedMs += e.t - this.s.pausedSince;
          this.s.pausedSince = null;
        }
        this.s.playing = true;
        this.s.rate = e.rate;
        if (e.type === 'play' && this.s.suspended) {
          // Resuming after a failed check starts a fresh verification window.
          this.s.suspended = false;
          this.s.windowThresholdMs = this.drawThreshold();
        }
        this.reanchor(e.t, e.pos);
        break;
      case 'pause':
      case 'ended':
      case 'interrupt':
        this.close(e.t, e.pos);
        this.s.playing = false;
        this.s.anchor = null;
        if (e.type === 'pause') this.s.pausedSince = e.t;
        break;
      case 'seeking': {
        const fromT = e.fromT ?? this.s.anchor?.t ?? e.t;
        const fromPos = e.fromPos ?? this.s.anchor?.pos ?? e.pos;
        if (fromT >= (this.s.anchor?.t ?? 0)) this.close(fromT, fromPos);
        this.reanchor(e.t, e.pos);
        break;
      }
      case 'seeked':
      case 'waiting':
      case 'checkpoint':
        this.close(e.t, e.pos);
        this.reanchor(e.t, e.pos);
        break;
      case 'ratechange':
        this.close(e.t, e.pos);
        this.s.rate = e.rate;
        this.reanchor(e.t, e.pos);
        break;
      case 'hidden':
      case 'visible':
        this.close(e.t, e.pos);
        this.s.hidden = e.type === 'hidden';
        this.reanchor(e.t, e.pos);
        break;
    }
    if (userAction && this.s.pendingCheck) this.passWindow();
    this.s.lastT = e.t;
  }

  private applyEngagement(e: EngagementEvent): void {
    // Split the open span so it lands in the right verification window.
    if (this.s.playing && this.s.anchor) {
      const pos = this.estimatePos(e.t);
      this.close(e.t, pos);
      this.reanchor(e.t, pos);
    }
    switch (e.type) {
      case 'check_issued':
        if (!this.s.pendingCheck) {
          this.s.pendingCheck = { checkId: e.checkId, issuedAt: e.t };
          this.s.checksIssued += 1;
        }
        break;
      case 'check_responded':
        if (this.s.pendingCheck?.checkId === e.checkId || this.s.suspended) this.passWindow();
        break;
      case 'check_missed':
        if (this.s.pendingCheck?.checkId === e.checkId) this.failWindow();
        break;
      case 'check_dispute':
        // Disputes are recorded in the audit trail by the host; credit is not restored automatically.
        break;
    }
  }

  /**
   * Finalize at the last known event. Open spans after the last persisted event are never credited.
   * A check that was still pending (e.g. crash during the prompt) is treated as missed.
   */
  finalize(): void {
    if (this.s.pendingCheck) this.failWindow();
    // Pending segments from a window with no check yet (threshold not reached) stay creditable.
    for (const seg of this.s.segments)
      if (seg.status === 'pending_verification') seg.status = 'eligible';
    this.s.playing = false;
    this.s.anchor = null;
  }

  summary(): PlaybackSummary {
    const counted = (st: SegmentStatus) => st === 'eligible' || st === 'pending_verification';
    let eligibleMs = 0;
    let pendingMs = 0;
    let unverifiedMs = 0;
    let hiddenMs = 0;
    let revisionMs = 0;
    const covered: Interval[] = [];
    const eligibleIntervals: Interval[] = [];
    for (const seg of this.s.segments) {
      if (seg.status === 'unverified') unverifiedMs += seg.creditedMs;
      if (seg.status === 'hidden') hiddenMs += seg.creditedMs;
      if (!counted(seg.status) || seg.creditedMs <= 0) continue;
      eligibleMs += seg.creditedMs;
      if (seg.status === 'pending_verification') pendingMs += seg.creditedMs;
      const span = { start: seg.fromPos, end: seg.toPos };
      const len = span.end - span.start;
      if (len > 0) {
        const before = unionLength(covered);
        covered.push(span);
        const added = unionLength(covered) - before;
        const overlap = Math.max(0, len - added);
        revisionMs += seg.creditedMs * (overlap / len);
      }
      eligibleIntervals.push({ start: seg.start, end: seg.end });
    }
    const coveredRanges = mergeIntervals(covered);
    const coverageSec = unionLength(coveredRanges);
    return {
      rawMs: this.s.rawMs,
      eligibleMs: Math.round(eligibleMs),
      pendingMs: Math.round(pendingMs),
      unverifiedMs: Math.round(unverifiedMs),
      hiddenMs: Math.round(hiddenMs),
      revisionMs: Math.round(revisionMs),
      pausedMs:
        this.s.pausedMs + (this.s.pausedSince !== null ? this.s.lastT - this.s.pausedSince : 0),
      coverageSec,
      coverageRatio: this.s.duration > 0 ? Math.min(1, coverageSec / this.s.duration) : 0,
      coveredRanges,
      eligibleIntervals: mergeIntervals(eligibleIntervals),
      checksIssued: this.s.checksIssued,
      checksPassed: this.s.checksPassed,
      checksMissed: this.s.checksMissed,
    };
  }
}

/** Rebuild a playback session from its persisted event log (any order, duplicates allowed). */
export function replayPlayback(
  events: readonly (MediaEvent | EngagementEvent)[],
  config: PlaybackConfig,
  duration = 0,
): PlaybackTracker {
  const tracker = new PlaybackTracker({ ...config, verification: config.verification }, duration);
  const unique = new Map<string, MediaEvent | EngagementEvent>();
  for (const e of events) if (!unique.has(e.id)) unique.set(e.id, e);
  const ordered = [...unique.values()].sort((a, b) => a.t - b.t || a.seq - b.seq);
  for (const e of ordered) tracker.apply(e);
  tracker.finalize();
  return tracker;
}
