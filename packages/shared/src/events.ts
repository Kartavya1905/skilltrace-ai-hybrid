import { z } from 'zod';

/**
 * Raw learning events as produced by the extension content script or the first-party
 * Learning Lab. Validated with zod before they are accepted by the dashboard, because
 * extension messages cross a trust boundary.
 */

export const mediaEventTypes = [
  'play',
  'pause',
  'seeking',
  'seeked',
  'checkpoint',
  'ratechange',
  'ended',
  'waiting',
  'playing',
  'hidden',
  'visible',
  'interrupt',
] as const;

export const readingEventTypes = [
  'open',
  'checkpoint',
  'scroll',
  'section_visible',
  'interaction',
  'hidden',
  'visible',
  'blur',
  'focus',
  'close',
] as const;

export const engagementEventTypes = [
  'check_issued',
  'check_responded',
  'check_missed',
  'check_dispute',
] as const;

const base = {
  id: z.string().min(1).max(120),
  sessionId: z.string().min(1).max(100),
  seq: z.number().int().nonnegative(),
  t: z.number().int().positive(), // epoch ms
};

export const MediaEventSchema = z.object({
  ...base,
  kind: z.literal('media'),
  type: z.enum(mediaEventTypes),
  pos: z.number().nonnegative(), // media position (s)
  rate: z.number().positive().max(16),
  duration: z.number().nonnegative(),
  fromPos: z.number().nonnegative().optional(),
  fromT: z.number().int().positive().optional(),
});

export const ReadingEventSchema = z.object({
  ...base,
  kind: z.literal('reading'),
  type: z.enum(readingEventTypes),
  scrollRatio: z.number().min(0).max(1).optional(),
  sectionId: z.string().max(100).optional(),
});

export const EngagementEventSchema = z.object({
  ...base,
  kind: z.literal('engagement'),
  type: z.enum(engagementEventTypes),
  checkId: z.string().max(100),
  correct: z.boolean().optional(),
});

export const LearningEventSchema = z.discriminatedUnion('kind', [
  MediaEventSchema,
  ReadingEventSchema,
  EngagementEventSchema,
]);

export type MediaEvent = z.infer<typeof MediaEventSchema>;
export type ReadingEvent = z.infer<typeof ReadingEventSchema>;
export type EngagementEvent = z.infer<typeof EngagementEventSchema>;
export type LearningEvent = z.infer<typeof LearningEventSchema>;

/** Source metadata sent once per session. Never contains form fields or keystrokes. */
export const SessionMetaSchema = z.object({
  sessionId: z.string().min(1).max(100),
  pageId: z.string().min(1).max(100),
  origin: z.string().max(200),
  url: z.string().max(500),
  title: z.string().max(300),
  contentType: z.enum(['video', 'audio', 'reading', 'practical', 'unknown']),
  wordCount: z.number().int().nonnegative(),
  durationSec: z.number().nonnegative(),
  excerpt: z.string().max(2000),
  sections: z
    .array(z.object({ id: z.string().max(100), heading: z.string().max(200), words: z.number().int().nonnegative() }))
    .max(200),
  startedAt: z.number().int().positive(),
  device: z.enum(['extension', 'learning_lab']),
});

export type SessionMeta = z.infer<typeof SessionMetaSchema>;

/** Deduplicate by id and order by (t, seq). Safe to call on any merged batch. */
export function dedupeAndSort<T extends { id: string; t: number; seq: number }>(events: readonly T[]): T[] {
  const seen = new Map<string, T>();
  for (const e of events) if (!seen.has(e.id)) seen.set(e.id, e);
  return [...seen.values()].sort((a, b) => a.t - b.t || a.seq - b.seq);
}

/** Validate an untrusted batch; returns accepted events and a count of rejected ones. */
export function validateEvents(input: unknown[]): { accepted: LearningEvent[]; rejected: number } {
  const accepted: LearningEvent[] = [];
  let rejected = 0;
  for (const raw of input) {
    const parsed = LearningEventSchema.safeParse(raw);
    if (parsed.success) accepted.push(parsed.data);
    else rejected++;
  }
  return { accepted, rejected };
}
