import { buildSkillTimelines, uniqueLearningMs, type SkillTimeline } from '@skilltrace/skill-taxonomy';
import { projectTimeByProject } from '@skilltrace/tracking-engine';
import { dayKey, weekKey } from '@skilltrace/shared';
import type { AppData } from './app-context';

export function skillTimelines(data: AppData): SkillTimeline[] {
  const tl = buildSkillTimelines(data.learning_sessions);
  return [...tl.values()].sort((a, b) => b.attributedMs - a.attributedMs);
}

export function learningTotals(data: AppData) {
  const s = data.learning_sessions;
  return {
    uniqueEligibleMs: uniqueLearningMs(s),
    rawMs: s.reduce((m, x) => m + x.rawMs, 0),
    revisionMs: s.reduce((m, x) => m + x.revisionMs, 0),
    unverifiedMs: s.reduce((m, x) => m + x.unverifiedMs, 0),
    sessions: s.length,
    pendingClassification: s.filter((x) => x.classificationStatus === 'pending' || x.classificationStatus === 'queued_offline').length,
  };
}

/** Eligible learning minutes per day for the last `days` days (UTC). Unique time, no double count. */
export function dailyActivity(data: AppData, days = 7, now = Date.now()) {
  const out: { day: string; ms: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() - i);
    const end = start + 86_400_000;
    const clipped = data.learning_sessions.map((s) => ({
      eligibleIntervals: s.eligibleIntervals
        .map((iv) => ({ start: Math.max(iv.start, start), end: Math.min(iv.end, end) }))
        .filter((iv) => iv.end > iv.start),
    }));
    out.push({ day: dayKey(start), ms: uniqueLearningMs(clipped) });
  }
  return out;
}

export function thisWeekMs(data: AppData, now = Date.now()): number {
  const wk = weekKey(now);
  return uniqueLearningMs(
    data.learning_sessions.filter((s) => weekKey(Date.parse(s.startedAt)) === wk),
  );
}

export function projectHours(data: AppData) {
  return projectTimeByProject(data.project_work_sessions);
}

export function skillProjects(data: AppData, skill: string) {
  return data.projects.filter((p) => p.confirmedByUser && p.status !== 'dismissed' && p.skillNames.includes(skill));
}

export function skillAssessments(data: AppData, skill: string) {
  return data.assessments.filter((a) => a.skill === skill);
}
