import { describe, expect, it } from 'vitest';
import type { AppData } from '../src/lib/app-context';
import { buildPublicPassport } from '../src/lib/passport';
import { LIVE_COLLECTIONS } from '../src/lib/store';

const env = (id: string, provenance = 'auto_recorded') => ({
  id,
  userId: 'u',
  createdAt: '2026-11-20T10:00:00Z',
  updatedAt: '2026-11-20T10:00:00Z',
  provenance,
  schemaVersion: 1,
});

function data(): AppData {
  const d = Object.fromEntries(
    [...LIVE_COLLECTIONS, 'learning_events'].map((c) => [c, []]),
  ) as unknown as AppData;
  d.learning_sources = [
    {
      ...env('src1'),
      pageId: 'p',
      title: 'Private Source Title',
      url: 'https://x.org/a',
      origin: 'https://x.org',
      contentType: 'video',
      wordCount: 0,
      durationSec: 600,
      excerpt: 'secret excerpt',
    },
  ] as never;
  d.learning_sessions = [
    {
      ...env('s1'),
      sourceId: 'src1',
      pageId: 'p',
      contentType: 'video',
      startedAt: '2026-11-20T10:00:00Z',
      endedAt: '2026-11-20T11:00:00Z',
      eligibleIntervals: [{ start: 0, end: 3_600_000 }],
      rawMs: 3_600_000,
      eligibleMs: 3_600_000,
      unverifiedMs: 0,
      revisionMs: 0,
      coverageSec: 600,
      coverageRatio: 1,
      pausedMs: 0,
      classificationStatus: 'classified',
      attributions: [
        { skill: 'Python', weight: 0.6, topics: ['Functions'] },
        { skill: 'SQL', weight: 0.4, topics: [] },
      ],
      summary: '',
      classifiedBy: null,
      device: 'learning_lab',
    },
  ] as never;
  d.projects = [
    {
      ...env('p1', 'github_metadata'),
      title: 'Repo',
      description: '',
      skillNames: ['Python'],
      githubUrl: 'https://github.com/a/b',
      startedAt: '2026-10-01T00:00:00Z',
      status: 'active',
      technologies: ['Python'],
      evidenceLinks: [],
      confirmedByUser: true,
    },
  ] as never;
  d.project_work_sessions = [
    {
      ...env('w1', 'self_reported'),
      projectId: 'p1',
      startedAt: '',
      endedAt: '',
      durationMs: 7_200_000,
      description: '',
      evidenceUrl: '',
      skillNames: [],
      provenance: 'self_reported',
    },
  ] as never;
  d.github_milestones = [
    {
      ...env('m1', 'github_metadata'),
      projectId: 'p1',
      kind: 'commit',
      title: 'c',
      occurredAt: '2026-11-01T00:00:00Z',
      url: '',
      durationMs: 0,
    },
  ] as never;
  return d;
}

const profile = { displayName: 'A', headline: '', githubUrl: '', portfolioUrl: '', summary: '' };

describe('public passport projection', () => {
  it('includes only selected skills and projects, with split (not double-counted) hours', () => {
    const p = buildPublicPassport(data(), 'u', 'pp', profile, {
      skills: ['Python'],
      projectIds: ['p1'],
      showSources: false,
      showTimestamps: false,
      showAssessments: true,
    });
    expect(p.skills.map((s) => s.name)).toEqual(['Python']);
    expect(p.skills[0]!.eligibleHours).toBe(0.6);
    expect(p.projects[0]!.selfReportedHours).toBe(2);
    expect(p.projects[0]!.evidence).toEqual(
      expect.arrayContaining(['self_reported', 'github_metadata']),
    );
  });

  it('hides sources, timestamps and private excerpts unless enabled', () => {
    const p = buildPublicPassport(data(), 'u', 'pp', profile, {
      skills: ['Python'],
      projectIds: ['p1'],
      showSources: false,
      showTimestamps: false,
      showAssessments: true,
    });
    const json = JSON.stringify(p);
    expect(json).not.toContain('Private Source Title');
    expect(json).not.toContain('secret excerpt');
    expect(json).not.toContain('https://x.org');
    expect(p.skills[0]!.learningStart).toBeNull();
    expect(p.projects[0]!.milestones[0]!.date).toBeNull();
    const shown = buildPublicPassport(data(), 'u', 'pp', profile, {
      skills: ['Python'],
      projectIds: [],
      showSources: true,
      showTimestamps: true,
      showAssessments: true,
    });
    expect(shown.skills[0]!.sources[0]!.title).toBe('Private Source Title');
    expect(JSON.stringify(shown)).not.toContain('secret excerpt'); // excerpts are never public
  });

  it('never emits a verification badge that no record supports', () => {
    const p = buildPublicPassport(data(), 'u', 'pp', profile, {
      skills: ['Python', 'SQL'],
      projectIds: ['p1'],
      showSources: true,
      showTimestamps: true,
      showAssessments: true,
    });
    expect(JSON.stringify(p)).not.toContain('independently_verified');
    expect(p.limitations.length).toBeGreaterThan(0);
  });
});
