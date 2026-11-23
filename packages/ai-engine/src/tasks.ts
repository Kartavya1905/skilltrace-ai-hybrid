/**
 * Named AI capabilities used by the app. Each builds a local (full) and cloud (minimised) prompt
 * and runs through HybridAIService.
 */
import { buildAttributions } from '@skilltrace/skill-taxonomy';
import type { SkillAttribution } from '@skilltrace/shared';
import {
  classifyPrompt,
  explainPrompt,
  passportPrompt,
  questionPrompt,
  repoSkillsPrompt,
  summaryPrompt,
  topicsPrompt,
} from './prompts';
import type {
  Classification,
  EngagementQuestion,
  EvidenceExplanation,
  PassportSummary,
  RepoSkills,
  SessionSummary,
  Topics,
} from './schemas';
import type { AIResult, HybridAIService } from './service';

export interface ContentInput {
  title: string;
  excerpt: string;
  contentType: string;
}

export class SkillTraceAI {
  constructor(
    readonly service: HybridAIService,
    private readonly allowCloudExcerpts: () => boolean,
  ) {}

  private cloudExcerpt(excerpt: string): string {
    return this.allowCloudExcerpts() ? excerpt.slice(0, 800) : '';
  }

  private describe(what: string): string {
    return this.allowCloudExcerpts()
      ? `${what}: the title and a short excerpt (up to 800 characters) of the material.`
      : `${what}: the title only (sending excerpts is turned off in Privacy settings).`;
  }

  classifySkills(input: ContentInput): Promise<AIResult<Classification>> {
    return this.service.run<Classification>('classify', {
      local: classifyPrompt(input),
      cloud: classifyPrompt({ ...input, excerpt: this.cloudExcerpt(input.excerpt) }),
      cloudDataDescription: this.describe('Skill classification'),
    });
  }

  extractTopics(input: ContentInput): Promise<AIResult<Topics>> {
    return this.service.run<Topics>('topics', {
      local: topicsPrompt(input),
      cloud: topicsPrompt({ ...input, excerpt: this.cloudExcerpt(input.excerpt) }),
      cloudDataDescription: this.describe('Topic extraction'),
    });
  }

  generateEngagementQuestion(input: { skill: string; sectionHeading: string; sectionText: string }): Promise<AIResult<EngagementQuestion>> {
    const cloudText = this.allowCloudExcerpts() ? input.sectionText.slice(0, 1200) : input.sectionHeading;
    return this.service.run<EngagementQuestion>('question', {
      local: questionPrompt(input),
      cloud: questionPrompt({ ...input, sectionText: cloudText }),
      cloudDataDescription: this.describe('Engagement question'),
    });
  }

  summarizeLearningSession(input: { title: string; topics: string[]; minutes: number; contentType: string }): Promise<AIResult<SessionSummary>> {
    const p = summaryPrompt(input);
    return this.service.run<SessionSummary>('summary', {
      local: p,
      cloud: p,
      cloudDataDescription: 'Session summary: the material title, detected topics and active minutes.',
    });
  }

  explainSkillEvidence(input: { skill: string; evidence: string }): Promise<AIResult<EvidenceExplanation>> {
    const p = explainPrompt(input);
    return this.service.run<EvidenceExplanation>('explain', {
      local: p,
      cloud: p,
      cloudDataDescription: 'Evidence explanation: aggregated hours, topics and assessment scores for one skill.',
    });
  }

  generatePassportSummary(input: { name: string; skills: string; projects: string }): Promise<AIResult<PassportSummary>> {
    const p = passportPrompt(input);
    return this.service.run<PassportSummary>('passport', {
      local: p,
      cloud: p,
      cloudDataDescription: 'Passport summary: your display name, skill totals and project titles.',
    });
  }

  suggestRepoSkills(input: { name: string; description: string; languages: string; readme: string }): Promise<AIResult<RepoSkills>> {
    return this.service.run<RepoSkills>('repoSkills', {
      local: repoSkillsPrompt(input),
      // Public repository metadata only; the README is already public on GitHub.
      cloud: repoSkillsPrompt(input),
      cloudDataDescription: 'Project skill suggestions: public repository name, description, languages and README excerpt.',
    });
  }
}

/** Turn a validated classification into weighted skill attributions. */
export function attributionsFromClassification(c: Classification, context: string): SkillAttribution[] {
  if (!c.isLearningContent) return [];
  return buildAttributions(c, context);
}
