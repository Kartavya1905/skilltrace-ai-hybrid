import { describe, expect, it } from 'vitest';
import {
  applyCorrection,
  buildAttributions,
  buildSkillTimelines,
  mergeInference,
  normalizeSkill,
  parseRepoUrl,
  skillHintsFromRepo,
  uniqueLearningMs,
  type SessionForTimeline,
} from '../src';

describe('skill normalisation', () => {
  it('maps naming variations to one canonical skill', () => {
    expect(normalizeSkill('JS').name).toBe('JavaScript');
    expect(normalizeSkill('Python 3').name).toBe('Python');
    expect(normalizeSkill('python3').name).toBe('Python');
    expect(normalizeSkill('Node JS').name).toBe('Node.js');
    expect(normalizeSkill('PostgreSQL').name).toBe('SQL');
  });

  it('expands ML only when the context supports it', () => {
    expect(normalizeSkill('ML', 'training a regression model').name).toBe('Machine Learning');
    const bare = normalizeSkill('ML', 'markup language basics');
    expect(bare.name).toBe('ML');
    expect(bare.ambiguous).toBe(true);
  });

  it('keeps unknown skills as title-cased custom skills', () => {
    expect(normalizeSkill('quantum annealing')).toMatchObject({ name: 'Quantum Annealing', known: false });
  });
});

describe('attribution', () => {
  const session = (id: string, start: number, ms: number, attributions = buildAttributions({ primarySkill: 'Python', topics: ['Functions'], confidence: 0.9 })): SessionForTimeline => ({
    id,
    startedAt: new Date(start).toISOString(),
    eligibleMs: ms,
    rawMs: ms,
    revisionMs: 0,
    unverifiedMs: 0,
    contentType: 'video',
    sourceId: `src-${id}`,
    eligibleIntervals: [{ start, end: start + ms }],
    attributions,
  });

  it('splits a multi-skill session instead of counting it fully for every skill', () => {
    const attributions = buildAttributions({ primarySkill: 'Python', secondarySkills: ['SQL'], topics: ['sqlite3'], confidence: 0.8 });
    const tl = buildSkillTimelines([session('x', Date.UTC(2026, 10, 20), 60 * 60_000, attributions)]);
    const py = tl.get('Python')!;
    const sql = tl.get('SQL')!;
    expect(py.attributedMs + sql.attributedMs).toBe(60 * 60_000);
    expect(py.involvedMs).toBe(60 * 60_000);
    expect(sql.sharedMs).toBe(60 * 60_000);
  });

  it('unique learning time de-duplicates overlapping tabs', () => {
    const t = Date.UTC(2026, 10, 20);
    expect(uniqueLearningMs([session('a', t, 60_000), session('b', t + 30_000, 60_000)])).toBe(90_000);
  });

  it('buckets time by day, week and month', () => {
    const tl = buildSkillTimelines([session('a', Date.UTC(2026, 10, 20, 10), 30 * 60_000)]).get('Python')!;
    expect(tl.daily['2026-11-20']).toBe(30 * 60_000);
    expect(tl.monthly['2026-11']).toBe(30 * 60_000);
    expect(Object.keys(tl.weekly)).toEqual(['2026-W47']);
  });
});

describe('user corrections', () => {
  it('later inference never overwrites a corrected classification', () => {
    const corrected = applyCorrection([{ skill: 'SQL', topics: ['Joins'] }]);
    const merged = mergeInference({ classificationStatus: corrected.status, attributions: corrected.attributions }, [
      { skill: 'Python', weight: 1, topics: [] },
    ]);
    expect(merged.overwritten).toBe(false);
    expect(merged.attributions[0]!.skill).toBe('SQL');
  });
});

describe('GitHub repository hints', () => {
  it('suggests skills from languages, topics and README', () => {
    const hints = skillHintsFromRepo({
      fullName: 'me/ai-learning-assistant',
      name: 'ai-learning-assistant',
      description: 'AI study helper',
      htmlUrl: 'https://github.com/me/ai-learning-assistant',
      languages: { Python: 9000, Dockerfile: 100, Shell: 50 },
      topics: ['firebase'],
      readme: 'Built with FastAPI and Firebase. Exposes a REST API.',
      createdAt: '2026-10-01T00:00:00Z',
      pushedAt: '2026-11-01T00:00:00Z',
      fork: false,
    }).map((h) => h.skill);
    expect(hints).toEqual(expect.arrayContaining(['Python', 'Firebase', 'FastAPI', 'REST APIs', 'Backend Development', 'Docker']));
  });

  it('parses repository URLs', () => {
    expect(parseRepoUrl('https://github.com/octocat/Hello-World')).toEqual({ owner: 'octocat', repo: 'Hello-World' });
    expect(parseRepoUrl('github.com/a/b.git')).toEqual({ owner: 'a', repo: 'b' });
    expect(parseRepoUrl('https://gitlab.com/a/b')).toBeNull();
  });
});
