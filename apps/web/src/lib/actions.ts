/**
 * Domain operations used by the UI. Each one writes records with explicit provenance.
 * Learning time comes only from the tracking engine; project time only from manual entries or
 * the learner's own timer; GitHub data only creates zero-duration milestones.
 */
import type {
  AssessmentRecord,
  GithubMilestone,
  InferenceLog,
  LearningEvent,
  LearningEventRecord,
  LearningSession,
  LearningSource,
  Preferences,
  Project,
  ProjectSkillLink,
  ProjectWorkSession,
  ReadingMetrics,
  SessionMeta,
  Skill,
  SkillAttribution,
  SkillTopic,
} from '@skilltrace/shared';
import { envelope, hash53, randomId, sanitizeUrl, toIso, touch } from '@skilltrace/shared';
import type { AIResult, SkillTraceAI } from '@skilltrace/ai-engine';
import { attributionsFromClassification } from '@skilltrace/ai-engine';
import type { SessionResult, TrackingOptions } from '@skilltrace/tracking-engine';
import {
  DEMO_VIDEO_VERIFICATION,
  PRODUCTION_VIDEO_VERIFICATION,
  estimateReadingSpeed,
} from '@skilltrace/tracking-engine';
import {
  applyCorrection,
  mergeInference,
  normalizeSkill,
  subskillFor,
} from '@skilltrace/skill-taxonomy';
import type { AppData } from './app-context';
import type { DataStore } from './store';

export async function recordInference(store: DataStore, r: AIResult<unknown>): Promise<string> {
  const id = randomId('inf');
  const log: InferenceLog = {
    ...envelope(id, store.uid, 'ai_suggestion'),
    task: r.task,
    source: r.ok ? r.source : 'unknown',
    mode: r.mode ?? '',
    model: r.ok ? r.model : '',
    durationMs: r.durationMs,
    ok: r.ok,
    errorCode: r.ok ? '' : `${r.error.kind}:${r.error.code}`,
    at: r.timestamp,
  };
  await store.put('inference_logs', log);
  return id;
}

/** Tracking options derived from preferences (+ DEMO mode shortening, never changing defaults). */
export function trackingOptions(
  prefs: Preferences,
  data: AppData,
  pageId?: string,
): TrackingOptions {
  const credible = data.reading_metrics
    .filter((m) => m.credible && m.observedWpm)
    .map((m) => m.observedWpm!);
  const speed = estimateReadingSpeed(credible, {
    baselineWpm: prefs.readingBaselineWpm,
    minSessions: 3,
    window: 10,
    priorStrength: 3,
  });
  const missed = pageId
    ? (data.reading_metrics.find((m) => m.pageId === pageId) as
        (ReadingMetrics & { consecutiveMissed?: number }) | undefined)
    : undefined;
  return {
    videoVerification: {
      ...(prefs.demoMode ? DEMO_VIDEO_VERIFICATION : PRODUCTION_VIDEO_VERIFICATION),
      rng: Math.random,
    },
    creditHiddenVideo: prefs.creditHiddenVideo,
    readingWpm: speed.wpm,
    readingRandomCheck: prefs.demoMode
      ? { minMs: 45_000, maxMs: 90_000, rng: Math.random }
      : { minMs: 4 * 60_000, maxMs: 12 * 60_000, rng: Math.random },
    responseWindowMultiplier: prefs.responseWindowMultiplier,
    initialConsecutiveMissed: missed?.consecutiveMissed ?? 0,
  };
}

export function sourceIdFor(meta: SessionMeta): string {
  return `src_${hash53(meta.pageId)}`;
}

/**
 * Persist one session (idempotent: ids derive from the session id). Events are stored first, so
 * the summary can always be reconstructed from them.
 */
/**
 * Puts what was said in the video first: it is the strongest skill signal. The transcript is
 * untrusted content like any page text (prompts fence it as data).
 */
export function withSpokenText(excerpt: string, transcript: string): string {
  const spoken = transcript.replace(/\s+/g, ' ').trim().slice(0, 900);
  if (!spoken) return excerpt.slice(0, 1500);
  return `Spoken in the video: ${spoken}\n\n${excerpt}`.trim().slice(0, 1500);
}

export async function saveSession(
  store: DataStore,
  meta: SessionMeta,
  result: SessionResult,
  events: LearningEvent[],
  provenance: 'auto_recorded' | 'sample_data' = 'auto_recorded',
  extras: { speech?: LearningSource['speech'] } = {},
): Promise<void> {
  const uid = store.uid;
  if (events.length) {
    const recs: LearningEventRecord[] = events.map((e) => {
      const { id, sessionId, seq, t, kind, type, ...rest } = e as LearningEvent &
        Record<string, unknown>;
      return {
        ...envelope(id, uid, provenance),
        sessionId,
        seq,
        t,
        type: `${kind}:${type}`,
        payload: { kind, ...rest },
      };
    });
    await store.putMany('learning_events', recs);
  }
  const sourceId = sourceIdFor(meta);
  const source: LearningSource = {
    ...envelope(sourceId, uid, provenance),
    pageId: meta.pageId,
    title: meta.title,
    url: sanitizeUrl(meta.url),
    origin: meta.origin,
    contentType: meta.contentType,
    wordCount: meta.wordCount,
    durationSec: meta.durationSec,
    excerpt: meta.excerpt.slice(0, 1500),
    ...(meta.description ? { description: meta.description.slice(0, 2000) } : {}),
    ...(extras.speech ? { speech: extras.speech } : {}),
  };
  await store.put('learning_sources', source);
  const session: LearningSession = {
    ...envelope(meta.sessionId, uid, provenance),
    sourceId,
    pageId: meta.pageId,
    contentType: meta.contentType,
    startedAt: toIso(result.startedAt),
    endedAt: toIso(Math.max(result.endedAt, result.startedAt)),
    eligibleIntervals: result.eligibleIntervals,
    rawMs: result.rawMs,
    eligibleMs: result.eligibleMs,
    unverifiedMs: result.unverifiedMs,
    revisionMs: result.revisionMs,
    coverageSec: result.coverageSec,
    coverageRatio: result.coverageRatio,
    pausedMs: result.pausedMs,
    classificationStatus: 'pending',
    attributions: [],
    summary: '',
    classifiedBy: null,
    device: meta.device,
  };
  await store.put('learning_sessions', session);
  if (result.reading) {
    const r = result.reading;
    const metrics: ReadingMetrics & {
      consecutiveMissed: number;
      answersCorrect: number;
      answersIncorrect: number;
      checksMissed: number;
    } = {
      ...envelope(`rm_${meta.sessionId}`, uid, provenance),
      pageId: meta.pageId,
      wordCount: meta.wordCount,
      expectedMs: r.expectedMs,
      progressRatio: r.progressRatio,
      creditedMs: r.creditedMs,
      rawMs: r.rawMs,
      observedWpm: r.observedWpm,
      credible: r.credible,
      resets: r.resets,
      revisits: r.revisits,
      consecutiveMissed: r.consecutiveMissed,
      answersCorrect: r.answersCorrect,
      answersIncorrect: r.answersIncorrect,
      checksMissed: r.checksMissed,
    };
    await store.put('reading_metrics', metrics);
  }
}

/** Upsert skill and topic records from attributions (never overwrites a user-locked skill). */
async function upsertSkills(
  store: DataStore,
  data: AppData,
  attributions: SkillAttribution[],
  sourceId: string,
  at: string,
) {
  for (const a of attributions) {
    const id = `skill_${hash53(a.skill.toLowerCase())}`;
    const existing = data.skills.find((s) => s.id === id);
    const def = normalizeSkill(a.skill);
    const skill: Skill = existing
      ? touch({
          ...existing,
          lastStudiedAt: at > existing.lastStudiedAt ? at : existing.lastStudiedAt,
        })
      : {
          ...envelope(id, store.uid, 'ai_suggestion'),
          name: a.skill,
          aliases: [],
          category: def.category,
          firstDetectedAt: at,
          lastStudiedAt: at,
          userLocked: false,
        };
    await store.put('skills', skill);
    for (const topic of a.topics) {
      const tid = `topic_${hash53(`${a.skill}:${topic.toLowerCase()}`)}`;
      const t = data.skill_topics.find((x) => x.id === tid);
      const rec: SkillTopic = t
        ? touch({ ...t, lastSeenAt: at, sourceIds: [...new Set([...t.sourceIds, sourceId])] })
        : {
            ...envelope(tid, store.uid, 'ai_suggestion'),
            skillId: id,
            name: topic,
            subskill: subskillFor(a.skill, topic),
            firstSeenAt: at,
            lastSeenAt: at,
            sourceIds: [sourceId],
          };
      await store.put('skill_topics', rec);
    }
  }
}

export type ClassifyOutcome = 'classified' | 'not_learning' | 'queued' | 'failed' | 'skipped';

/** Classify one session with Firebase AI Logic. Never invents a result when AI is unavailable. */
export async function classifySession(
  store: DataStore,
  data: AppData,
  ai: SkillTraceAI | null,
  session: LearningSession,
): Promise<ClassifyOutcome> {
  if (session.classificationStatus === 'corrected' || session.classificationStatus === 'classified')
    return 'skipped';
  const source = data.learning_sources.find((s) => s.id === session.sourceId);
  if (!source) return 'skipped';
  if (!ai) {
    await store.put(
      'learning_sessions',
      touch({ ...session, classificationStatus: 'queued_offline' }),
    );
    return 'queued';
  }
  const r = await ai.classifySkills({
    title: source.title,
    excerpt: source.excerpt,
    contentType: source.contentType,
  });
  if (!r.ok) {
    await store.put(
      'learning_sessions',
      touch({ ...session, classificationStatus: r.retryLater ? 'queued_offline' : 'failed' }),
    );
    return r.retryLater ? 'queued' : 'failed';
  }
  const inferred = attributionsFromClassification(
    r.output,
    `${source.title} ${source.excerpt.slice(0, 300)}`,
  );
  const merged = mergeInference(session, inferred);
  const updated: LearningSession = touch({
    ...session,
    attributions: merged.attributions,
    classificationStatus: inferred.length ? merged.status : 'classified',
    summary: inferred.length
      ? session.summary
      : 'Classified as not learning content; no skill credit assigned.',
    classifiedBy:
      merged.overwritten || !inferred.length
        ? {
            source: r.source,
            durationMs: r.durationMs,
            model: r.model,
            mode: r.mode ?? '',
            at: r.timestamp,
          }
        : session.classifiedBy,
  });
  await store.put('learning_sessions', updated);
  if (inferred.length)
    await upsertSkills(store, data, merged.attributions, source.id, session.startedAt);
  return inferred.length ? 'classified' : 'not_learning';
}

export async function correctSession(
  store: DataStore,
  data: AppData,
  session: LearningSession,
  skills: { skill: string; topics: string[] }[],
) {
  const normalized = skills
    .map((s) => ({ skill: normalizeSkill(s.skill, s.topics.join(' ')).name, topics: s.topics }))
    .filter((s) => s.skill);
  const c = applyCorrection(normalized);
  await store.put(
    'learning_sessions',
    touch({
      ...session,
      attributions: c.attributions,
      classificationStatus: 'corrected',
      provenance: session.provenance,
    }),
  );
  await upsertSkills(store, data, c.attributions, session.sourceId, session.startedAt);
}

// ---------------------------------------------------------------- projects

export function newProject(
  uid: string,
  input: Partial<Project> & { title: string },
  provenance: Project['provenance'] = 'self_reported',
): Project {
  return {
    ...envelope(input.id ?? randomId('proj'), uid, provenance),
    title: input.title,
    description: input.description ?? '',
    skillNames: input.skillNames ?? [],
    githubUrl: input.githubUrl ?? '',
    startedAt: input.startedAt ?? new Date().toISOString(),
    status: input.status ?? 'active',
    technologies: input.technologies ?? [],
    evidenceLinks: input.evidenceLinks ?? [],
    confirmedByUser: input.confirmedByUser ?? true,
  };
}

export async function setProjectSkills(
  store: DataStore,
  project: Project,
  skills: string[],
  suggestedBy: ProjectSkillLink['suggestedBy'],
  confirmed: boolean,
) {
  for (const skill of skills) {
    const link: ProjectSkillLink = {
      ...envelope(
        `psl_${hash53(`${project.id}:${skill}`)}`,
        store.uid,
        suggestedBy === 'user'
          ? 'self_reported'
          : suggestedBy === 'github_languages'
            ? 'github_metadata'
            : 'ai_suggestion',
      ),
      projectId: project.id,
      skill,
      suggestedBy,
      confirmed,
    };
    await store.put('project_skill_links', link);
  }
}

export async function confirmProject(
  store: DataStore,
  data: AppData,
  project: Project,
  skills: string[],
  startedAt: string,
) {
  // One canonical project record with skill references - never duplicated per skill.
  const updated = touch({
    ...project,
    skillNames: skills,
    status: 'active' as const,
    confirmedByUser: true,
    startedAt,
  });
  await store.put('projects', updated);
  for (const link of data.project_skill_links.filter((l) => l.projectId === project.id)) {
    await store.put(
      'project_skill_links',
      touch({ ...link, confirmed: skills.includes(link.skill) }),
    );
  }
  await setProjectSkills(
    store,
    updated,
    skills.filter(
      (s) => !data.project_skill_links.some((l) => l.projectId === project.id && l.skill === s),
    ),
    'user',
    true,
  );
}

export async function addWorkSession(
  store: DataStore,
  input: {
    projectId: string;
    startedAt: string;
    endedAt: string;
    description: string;
    evidenceUrl: string;
    skillNames: string[];
    provenance: 'self_reported' | 'timer_recorded';
    durationMs?: number;
  },
): Promise<ProjectWorkSession> {
  const durationMs = input.durationMs ?? Date.parse(input.endedAt) - Date.parse(input.startedAt);
  const rec: ProjectWorkSession = {
    ...envelope(randomId('work'), store.uid, input.provenance),
    projectId: input.projectId,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationMs: Math.max(0, Math.round(durationMs)),
    description: input.description.slice(0, 500),
    evidenceUrl: input.evidenceUrl.slice(0, 300),
    skillNames: input.skillNames,
    provenance: input.provenance,
  };
  await store.put('project_work_sessions', rec);
  return rec;
}

export async function addMilestone(
  store: DataStore,
  m: Omit<GithubMilestone, keyof ReturnType<typeof envelope> | 'durationMs'>,
  provenance: GithubMilestone['provenance'] = 'github_metadata',
) {
  const rec: GithubMilestone = {
    ...envelope(
      `ms_${hash53(`${m.projectId}:${m.kind}:${m.url}:${m.occurredAt}`)}`,
      store.uid,
      provenance,
    ),
    ...m,
    durationMs: 0,
  };
  await store.put('github_milestones', rec);
}

export async function saveEngagementCheck(
  store: DataStore,
  c: {
    checkId: string;
    sessionId: string;
    pageId: string;
    kind: 'video_presence' | 'reading_question';
    trigger: string;
    issuedAt: number;
    outcome: 'responded' | 'missed';
    answerCorrect: boolean | null;
    question: string;
  },
) {
  await store.put('engagement_checks', {
    ...envelope(c.checkId, store.uid, 'auto_recorded'),
    sessionId: c.sessionId,
    pageId: c.pageId,
    kind: c.kind,
    trigger: c.trigger,
    issuedAt: c.issuedAt,
    respondedAt: c.outcome === 'responded' ? Date.now() : null,
    outcome: c.outcome,
    answerCorrect: c.answerCorrect,
    question: c.question.slice(0, 300),
    disputed: false,
    disputeNote: '',
  });
}

export async function saveAssessment(
  store: DataStore,
  a: Omit<AssessmentRecord, keyof ReturnType<typeof envelope>>,
) {
  await store.put('assessments', {
    ...envelope(randomId('asmt'), store.uid, 'assessment_result'),
    ...a,
  });
}

// ---------------------------------------------------------------- privacy

export async function exportAllData(store: DataStore, data: AppData): Promise<Blob> {
  const events = await store.listEvents();
  const payload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    ...data,
    learning_events: events,
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

export async function deleteLearningHistory(store: DataStore) {
  for (const c of [
    'learning_events',
    'learning_sessions',
    'learning_sources',
    'reading_metrics',
    'playback_segments',
    'engagement_checks',
    'skills',
    'skill_topics',
    'inference_logs',
  ] as const) {
    await store.clear(c);
  }
}
