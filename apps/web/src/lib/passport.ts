/**
 * Skill Passport generator. Builds the PUBLIC projection from private data, including only what
 * the learner selected. Every claim carries its evidence types. No certification or verification
 * badge is produced unless a record genuinely has 'independently_verified' provenance.
 */
import type { Provenance, PublicPassport, PublicProjectEvidence, PublicSkillEvidence } from '@skilltrace/shared';
import { SCHEMA_VERSION } from '@skilltrace/shared';
import type { AppData } from './app-context';
import { projectHours, skillAssessments, skillTimelines } from './analytics';

export const PASSPORT_LIMITATIONS = [
  'Learning hours are automatically recorded activity on supported pages. They show time spent with material, not comprehension or mastery.',
  'Project hours are self-reported by the learner (manual entries or their own timer).',
  'GitHub data shows repository metadata and milestones. It does not prove that every contribution was authored independently.',
  'Assessment results are unproctored self-attempts unless marked otherwise.',
  'AI-assisted work is not treated as dishonest; the assistance policy is shown with each assessment.',
];

const round1 = (ms: number) => Math.round((ms / 3_600_000) * 10) / 10;

export interface PassportOptions {
  skills: string[];
  projectIds: string[];
  showSources: boolean;
  showTimestamps: boolean;
  showAssessments: boolean;
}

export function buildPublicPassport(
  data: AppData,
  ownerUid: string,
  shareId: string,
  profile: { displayName: string; headline: string; githubUrl: string; portfolioUrl: string; summary: string },
  opts: PassportOptions,
  now = new Date(),
): PublicPassport {
  const timelines = skillTimelines(data).filter((t) => opts.skills.includes(t.skill));
  const hours = projectHours(data);
  const publicProjects = data.projects.filter((p) => opts.projectIds.includes(p.id) && p.confirmedByUser && p.status !== 'dismissed');

  const skills: PublicSkillEvidence[] = timelines.map((t) => {
    const evidence = new Set<Provenance>();
    const sessions = data.learning_sessions.filter((s) => s.attributions.some((a) => a.skill === t.skill));
    for (const s of sessions) evidence.add(s.provenance === 'sample_data' ? 'sample_data' : 'auto_recorded');
    const assessments = opts.showAssessments ? skillAssessments(data, t.skill) : [];
    if (assessments.length) evidence.add('assessment_result');
    const linked = publicProjects.filter((p) => p.skillNames.includes(t.skill));
    if (linked.length) evidence.add('self_reported');
    const sources = opts.showSources
      ? t.sourceIds
          .map((id) => data.learning_sources.find((s) => s.id === id))
          .filter((s): s is NonNullable<typeof s> => !!s)
          .map((s) => ({ title: s.title, contentType: s.contentType }))
      : [];
    return {
      name: t.skill,
      learningStart: opts.showTimestamps ? t.firstStudiedAt : null,
      eligibleHours: round1(t.attributedMs),
      revisionHours: round1(t.revisionMs),
      topics: t.topics.slice(0, 20),
      sourceCount: t.sourceIds.length,
      sources,
      assessments: assessments.map((a) => ({
        title: a.title,
        score: a.score,
        maxScore: a.maxScore,
        verificationLevel: a.verificationLevel,
        date: opts.showTimestamps ? a.attemptedAt : null,
      })),
      linkedProjects: linked.map((p) => p.title),
      evidence: [...evidence],
    };
  });

  const projects: PublicProjectEvidence[] = publicProjects.map((p) => {
    const milestones = data.github_milestones.filter((m) => m.projectId === p.id);
    const evidence = new Set<Provenance>();
    const workMs = hours.get(p.id) ?? 0;
    if (workMs > 0) evidence.add('self_reported');
    if (milestones.length || p.githubUrl) evidence.add('github_metadata');
    if (p.provenance === 'sample_data') evidence.add('sample_data');
    return {
      title: p.title,
      description: p.description.slice(0, 500),
      technologies: p.technologies,
      skills: p.skillNames.filter((s) => opts.skills.includes(s)),
      githubUrl: p.githubUrl,
      selfReportedHours: round1(workMs),
      milestones: milestones
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
        .slice(-10)
        .map((m) => ({ title: m.title, kind: m.kind, date: opts.showTimestamps ? m.occurredAt : null })),
      evidenceLinks: p.evidenceLinks.slice(0, 5),
      evidence: [...evidence],
    };
  });

  return {
    shareId,
    ownerUid,
    visibility: 'public',
    schemaVersion: SCHEMA_VERSION,
    publishedAt: now.toISOString(),
    displayName: profile.displayName.slice(0, 80),
    headline: profile.headline.slice(0, 140),
    githubUrl: profile.githubUrl,
    portfolioUrl: profile.portfolioUrl,
    summary: profile.summary.slice(0, 900),
    skills,
    projects,
    limitations: PASSPORT_LIMITATIONS,
  };
}
