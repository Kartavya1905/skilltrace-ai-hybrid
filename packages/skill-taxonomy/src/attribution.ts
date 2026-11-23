/**
 * Skill time attribution.
 *
 * A single learning session may relate to several skills. We never count its full duration
 * toward every skill and then add those numbers up. Instead each session's eligible time is split
 * by explicit weights that sum to 1 ("attributed" time, which sums to unique time), and the
 * overlap is exposed separately ("involved" time includes the full duration of every session that
 * touched the skill; "shared" time is the part of that which was shared with other skills).
 */
import type { Interval, SkillAttribution } from '@skilltrace/shared';
import { dayKey, monthKey, unionLength, weekKey } from '@skilltrace/shared';
import { normalizeSkill, uniqueTopics } from './taxonomy';

export interface ClassificationLike {
  primarySkill: string;
  secondarySkills?: string[];
  topics: string[];
  confidence: number;
}

/**
 * Rule: primary skill gets 0.6 when there are secondary skills (split equally among them for the
 * remaining 0.4); a single-skill classification gets 1.0. Max 3 secondary skills.
 */
export function buildAttributions(c: ClassificationLike, context = ''): SkillAttribution[] {
  const primary = normalizeSkill(c.primarySkill, `${context} ${c.topics.join(' ')}`).name;
  if (!primary) return [];
  const secondary = [
    ...new Set((c.secondarySkills ?? []).map((s) => normalizeSkill(s, context).name)),
  ]
    .filter((s) => s && s !== primary)
    .slice(0, 3);
  const topics = uniqueTopics(c.topics);
  if (secondary.length === 0) return [{ skill: primary, weight: 1, topics }];
  const each = 0.4 / secondary.length;
  return [
    { skill: primary, weight: 0.6, topics },
    ...secondary.map((skill) => ({ skill, weight: Number(each.toFixed(4)), topics: [] })),
  ];
}

export interface SessionForTimeline {
  id: string;
  startedAt: string;
  eligibleMs: number;
  rawMs: number;
  revisionMs: number;
  unverifiedMs: number;
  contentType: string;
  sourceId: string;
  eligibleIntervals: Interval[];
  attributions: SkillAttribution[];
}

export interface SkillTimeline {
  skill: string;
  firstStudiedAt: string | null;
  lastStudiedAt: string | null;
  attributedMs: number;
  involvedMs: number;
  sharedMs: number;
  rawMs: number;
  revisionMs: number;
  unverifiedMs: number;
  sessionCount: number;
  topics: string[];
  sourceIds: string[];
  byContentType: Record<string, number>;
  daily: Record<string, number>;
  weekly: Record<string, number>;
  monthly: Record<string, number>;
}

function emptyTimeline(skill: string): SkillTimeline {
  return {
    skill,
    firstStudiedAt: null,
    lastStudiedAt: null,
    attributedMs: 0,
    involvedMs: 0,
    sharedMs: 0,
    rawMs: 0,
    revisionMs: 0,
    unverifiedMs: 0,
    sessionCount: 0,
    topics: [],
    sourceIds: [],
    byContentType: {},
    daily: {},
    weekly: {},
    monthly: {},
  };
}

const add = (rec: Record<string, number>, k: string, v: number) => {
  rec[k] = (rec[k] ?? 0) + v;
};

export function buildSkillTimelines(
  sessions: readonly SessionForTimeline[],
): Map<string, SkillTimeline> {
  const out = new Map<string, SkillTimeline>();
  for (const s of sessions) {
    if (s.attributions.length === 0) continue;
    const totalWeight = s.attributions.reduce((m, a) => m + a.weight, 0) || 1;
    const shared = s.attributions.length > 1;
    const t = Date.parse(s.startedAt);
    for (const a of s.attributions) {
      const tl = out.get(a.skill) ?? emptyTimeline(a.skill);
      const w = a.weight / totalWeight;
      const attributed = s.eligibleMs * w;
      tl.attributedMs += attributed;
      tl.involvedMs += s.eligibleMs;
      if (shared) tl.sharedMs += s.eligibleMs;
      tl.rawMs += s.rawMs * w;
      tl.revisionMs += s.revisionMs * w;
      tl.unverifiedMs += s.unverifiedMs * w;
      tl.sessionCount += 1;
      tl.topics = uniqueTopics([...tl.topics, ...a.topics]);
      if (!tl.sourceIds.includes(s.sourceId)) tl.sourceIds.push(s.sourceId);
      add(tl.byContentType, s.contentType, attributed);
      if (!Number.isNaN(t)) {
        add(tl.daily, dayKey(t), attributed);
        add(tl.weekly, weekKey(t), attributed);
        add(tl.monthly, monthKey(t), attributed);
        if (!tl.firstStudiedAt || s.startedAt < tl.firstStudiedAt) tl.firstStudiedAt = s.startedAt;
        if (!tl.lastStudiedAt || s.startedAt > tl.lastStudiedAt) tl.lastStudiedAt = s.startedAt;
      }
      out.set(a.skill, tl);
    }
  }
  for (const tl of out.values()) {
    tl.attributedMs = Math.round(tl.attributedMs);
    tl.rawMs = Math.round(tl.rawMs);
    tl.revisionMs = Math.round(tl.revisionMs);
    tl.unverifiedMs = Math.round(tl.unverifiedMs);
  }
  return out;
}

/**
 * The learner's unique eligible learning time: the union of credited wall-clock intervals across
 * every session, so two tabs playing at once are counted once.
 */
export function uniqueLearningMs(sessions: readonly { eligibleIntervals: Interval[] }[]): number {
  return unionLength(sessions.flatMap((s) => s.eligibleIntervals));
}
