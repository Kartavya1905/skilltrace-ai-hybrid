import type { EngagementEvent, MediaEvent, ReadingEvent } from '@skilltrace/shared';

/** Build a synthetic media/reading event log with sequential ids. */
export class EventLog {
  seq = 0;
  readonly events: (MediaEvent | ReadingEvent | EngagementEvent)[] = [];
  constructor(readonly sessionId = 's1') {}

  private base(t: number) {
    const seq = this.seq++;
    return { id: `${this.sessionId}_${seq}`, sessionId: this.sessionId, seq, t };
  }

  media(
    type: MediaEvent['type'],
    tSec: number,
    pos: number,
    rate = 1,
    extra: Partial<MediaEvent> = {},
  ): MediaEvent {
    const e: MediaEvent = {
      ...this.base(1_000_000 + tSec * 1000),
      kind: 'media',
      type,
      pos,
      rate,
      duration: 600,
      ...extra,
    };
    this.events.push(e);
    return e;
  }

  /** Continuous play from (tSec, pos) for `seconds` real seconds with checkpoints every `every` s. */
  play(
    tSec: number,
    pos: number,
    seconds: number,
    rate = 1,
    every = 5,
  ): { t: number; pos: number } {
    let t = tSec;
    let p = pos;
    const end = tSec + seconds;
    while (t < end) {
      const step = Math.min(every, end - t);
      t += step;
      p += step * rate;
      this.media('checkpoint', t, p, rate);
    }
    return { t, pos: p };
  }

  reading(
    type: ReadingEvent['type'],
    tSec: number,
    extra: Partial<ReadingEvent> = {},
  ): ReadingEvent {
    const e: ReadingEvent = {
      ...this.base(1_000_000 + tSec * 1000),
      kind: 'reading',
      type,
      ...extra,
    };
    this.events.push(e);
    return e;
  }

  engagement(
    type: EngagementEvent['type'],
    tSec: number,
    checkId: string,
    correct?: boolean,
  ): EngagementEvent {
    const e: EngagementEvent = {
      ...this.base(1_000_000 + tSec * 1000),
      kind: 'engagement',
      type,
      checkId,
    };
    if (correct !== undefined) e.correct = correct;
    this.events.push(e);
    return e;
  }
}

export const MIN = 60_000;
