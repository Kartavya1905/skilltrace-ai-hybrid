/**
 * User corrections win. A later AI inference must never silently overwrite a classification the
 * learner corrected.
 */
import type { ClassificationStatus, SkillAttribution } from '@skilltrace/shared';

export interface ClassifiedSessionLike {
  classificationStatus: ClassificationStatus;
  attributions: SkillAttribution[];
}

export interface MergeResult {
  attributions: SkillAttribution[];
  status: ClassificationStatus;
  overwritten: boolean;
}

export function mergeInference(current: ClassifiedSessionLike, inferred: SkillAttribution[]): MergeResult {
  if (current.classificationStatus === 'corrected') {
    return { attributions: current.attributions, status: 'corrected', overwritten: false };
  }
  if (inferred.length === 0) {
    return { attributions: current.attributions, status: current.classificationStatus, overwritten: false };
  }
  return { attributions: inferred, status: 'classified', overwritten: true };
}

/** Apply a learner correction: renames/reweights skills and locks the session against inference. */
export function applyCorrection(skills: { skill: string; topics: string[] }[]): MergeResult {
  const unique = skills.filter((s, i, arr) => s.skill && arr.findIndex((x) => x.skill === s.skill) === i);
  const w = unique.length ? 1 / unique.length : 0;
  return {
    attributions: unique.map((s) => ({ skill: s.skill, topics: s.topics, weight: Number(w.toFixed(4)) })),
    status: 'corrected',
    overwritten: true,
  };
}
