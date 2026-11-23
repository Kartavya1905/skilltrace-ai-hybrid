/**
 * Structured-output contracts. Each task has:
 *  - a JSON Schema passed to BOTH the cloud model (responseSchema) and the on-device Prompt API
 *    (responseConstraint), per the Firebase AI Logic hybrid structured-output docs;
 *  - a zod validator, because model output is untrusted and may be malformed.
 */
import { z } from 'zod';

export const ClassificationZ = z.object({
  isLearningContent: z.boolean(),
  primarySkill: z.string().max(60),
  secondarySkills: z.array(z.string().max(60)).max(5),
  topics: z.array(z.string().max(80)).max(12),
  contentKind: z.enum(['tutorial', 'reference', 'lecture', 'exercise', 'other']),
  confidence: z.number().min(0).max(1),
});
export type Classification = z.infer<typeof ClassificationZ>;

export const TopicsZ = z.object({ topics: z.array(z.string().max(80)).max(15) });
export type Topics = z.infer<typeof TopicsZ>;

export const QuestionZ = z.object({
  question: z.string().min(5).max(300),
  options: z.array(z.string().min(1).max(160)).min(2).max(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().max(400),
});
export type EngagementQuestion = z.infer<typeof QuestionZ>;

export const SummaryZ = z.object({ summary: z.string().max(800), keyPoints: z.array(z.string().max(200)).max(6) });
export type SessionSummary = z.infer<typeof SummaryZ>;

export const ExplanationZ = z.object({ explanation: z.string().max(900) });
export type EvidenceExplanation = z.infer<typeof ExplanationZ>;

export const PassportSummaryZ = z.object({ headline: z.string().max(140), summary: z.string().max(900) });
export type PassportSummary = z.infer<typeof PassportSummaryZ>;

export const RepoSkillsZ = z.object({
  skills: z.array(z.object({ skill: z.string().max(60), reason: z.string().max(200) })).max(8),
});
export type RepoSkills = z.infer<typeof RepoSkillsZ>;

const str = { type: 'string' } as const;
const strArr = (maxItems: number) => ({ type: 'array', items: str, maxItems }) as const;

/** Plain JSON Schema objects (accepted by both responseSchema and responseConstraint). */
export const JSON_SCHEMAS = {
  classify: {
    type: 'object',
    properties: {
      isLearningContent: { type: 'boolean' },
      primarySkill: str,
      secondarySkills: strArr(5),
      topics: strArr(12),
      contentKind: { type: 'string', enum: ['tutorial', 'reference', 'lecture', 'exercise', 'other'] },
      confidence: { type: 'number' },
    },
    required: ['isLearningContent', 'primarySkill', 'secondarySkills', 'topics', 'contentKind', 'confidence'],
  },
  topics: { type: 'object', properties: { topics: strArr(15) }, required: ['topics'] },
  question: {
    type: 'object',
    properties: {
      question: str,
      options: { type: 'array', items: str, minItems: 2, maxItems: 4 },
      correctIndex: { type: 'integer' },
      explanation: str,
    },
    required: ['question', 'options', 'correctIndex', 'explanation'],
  },
  summary: { type: 'object', properties: { summary: str, keyPoints: strArr(6) }, required: ['summary', 'keyPoints'] },
  explain: { type: 'object', properties: { explanation: str }, required: ['explanation'] },
  passport: { type: 'object', properties: { headline: str, summary: str }, required: ['headline', 'summary'] },
  repoSkills: {
    type: 'object',
    properties: {
      skills: {
        type: 'array',
        maxItems: 8,
        items: { type: 'object', properties: { skill: str, reason: str }, required: ['skill', 'reason'] },
      },
    },
    required: ['skills'],
  },
} as const;

export type TaskName = keyof typeof JSON_SCHEMAS;

export const VALIDATORS: Record<TaskName, z.ZodType> = {
  classify: ClassificationZ,
  topics: TopicsZ,
  question: QuestionZ,
  summary: SummaryZ,
  explain: ExplanationZ,
  passport: PassportSummaryZ,
  repoSkills: RepoSkillsZ,
};

/** Extract JSON from model text (tolerates ```json fences some models add). */
export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const body = fenced ? fenced[1]! : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));
    throw new Error('Model output was not valid JSON');
  }
}
