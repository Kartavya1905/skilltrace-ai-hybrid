/**
 * Clearly labelled sample data for demonstrations. Every record has provenance 'sample_data',
 * the UI shows a "Sample data" badge, and one click removes all of it.
 */
import type { LearningSession, LearningSource, Project, ProjectWorkSession, AssessmentRecord, GithubMilestone } from '@skilltrace/shared';
import { PRIVATE_COLLECTIONS, envelope, hash53, pageIdFromUrl } from '@skilltrace/shared';
import type { DataStore } from './store';
import type { AppData } from './app-context';

const H = 3_600_000;

export async function loadSampleData(store: DataStore, now = Date.now()) {
  const uid = store.uid;
  const day = (n: number, hour = 18) => Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() - n, hour);
  const sources: [string, string, LearningSource['contentType'], string, string[]][] = [
    ['https://example.org/sample/python-classes', 'Sample: Python Classes and Objects', 'reading', 'Python', ['Classes', 'Object-Oriented Programming']],
    ['https://example.org/sample/sql-joins', 'Sample: SQL Joins Explained', 'video', 'SQL', ['Joins', 'Inner Join', 'Left Join']],
    ['https://example.org/sample/ml-intro', 'Sample: Intro to Supervised Learning', 'video', 'Machine Learning', ['Supervised Learning', 'Regression']],
  ];
  for (const [i, [url, title, type, skill, topics]] of sources.entries()) {
    const sid = `sample_src_${i}`;
    await store.put('learning_sources', {
      ...envelope(sid, uid, 'sample_data'),
      pageId: pageIdFromUrl(url),
      title,
      url,
      origin: 'https://example.org',
      contentType: type,
      wordCount: type === 'reading' ? 1800 : 0,
      durationSec: type === 'reading' ? 0 : 1200,
      excerpt: '',
    });
    for (let d = 0; d < 3; d++) {
      const start = day(i * 2 + d * 3, 17 + i);
      const ms = (0.6 + 0.2 * d) * H;
      const session: LearningSession = {
        ...envelope(`sample_sess_${i}_${d}`, uid, 'sample_data'),
        sourceId: sid,
        pageId: pageIdFromUrl(url),
        contentType: type,
        startedAt: new Date(start).toISOString(),
        endedAt: new Date(start + ms * 1.1).toISOString(),
        eligibleIntervals: [{ start, end: start + ms }],
        rawMs: ms * 1.1,
        eligibleMs: ms,
        unverifiedMs: 0,
        revisionMs: d > 0 ? ms * 0.25 : 0,
        coverageSec: type === 'reading' ? 0 : 1200 * Math.min(1, 0.5 + 0.25 * d),
        coverageRatio: Math.min(1, 0.5 + 0.25 * d),
        pausedMs: 0,
        classificationStatus: 'classified',
        attributions: [{ skill, weight: 1, topics }],
        summary: 'Sample session (demonstration data).',
        classifiedBy: null,
        device: 'extension',
      };
      await store.put('learning_sessions', session);
    }
    await store.put('skills', {
      ...envelope(`skill_${hash53(skill.toLowerCase())}`, uid, 'sample_data'),
      name: skill,
      aliases: [],
      category: 'Sample',
      firstDetectedAt: new Date(day(8)).toISOString(),
      lastStudiedAt: new Date(day(0)).toISOString(),
      userLocked: false,
    });
  }
  const project: Project = {
    ...envelope('sample_proj_1', uid, 'sample_data'),
    title: 'Sample: Student Grades API',
    description: 'Demonstration project: a small REST API over a SQL database.',
    skillNames: ['Python', 'SQL', 'REST APIs'],
    githubUrl: '',
    startedAt: new Date(day(10)).toISOString(),
    status: 'active',
    technologies: ['Python', 'FastAPI', 'SQLite'],
    evidenceLinks: [],
    confirmedByUser: true,
  };
  await store.put('projects', project);
  const work: ProjectWorkSession[] = [2, 3].map((h, i) => ({
    ...envelope(`sample_work_${i}`, uid, 'sample_data'),
    projectId: project.id,
    startedAt: new Date(day(4 - i * 2, 14)).toISOString(),
    endedAt: new Date(day(4 - i * 2, 14) + h * H).toISOString(),
    durationMs: h * H,
    description: i ? 'Sample: database schema' : 'Sample: backend endpoints',
    evidenceUrl: '',
    skillNames: project.skillNames,
    provenance: 'self_reported',
  }));
  await store.putMany('project_work_sessions', work);
  const milestone: GithubMilestone = {
    ...envelope('sample_ms_1', uid, 'sample_data'),
    projectId: project.id,
    kind: 'release',
    title: 'Sample: first working version',
    occurredAt: new Date(day(1)).toISOString(),
    url: '',
    durationMs: 0,
  };
  await store.put('github_milestones', milestone);
  const assessment: AssessmentRecord = {
    ...envelope('sample_asmt_1', uid, 'sample_data'),
    skill: 'SQL',
    title: 'Sample: SQL SELECT basics',
    attemptedAt: new Date(day(2)).toISOString(),
    questions: [],
    score: 2,
    maxScore: 3,
    assistancePolicy: 'closed_book',
    verificationLevel: 'self_attempted_unproctored',
    gradedBy: 'deterministic',
  };
  await store.put('assessments', assessment);
}

export async function removeSampleData(store: DataStore, data: AppData) {
  for (const c of PRIVATE_COLLECTIONS) {
    if (c === 'learning_events') continue;
    for (const row of data[c] as { id: string; provenance: string }[]) {
      if (row.provenance === 'sample_data') await store.remove(c, row.id);
    }
  }
}
