/**
 * Deterministic skill hints from GitHub repository metadata (languages, topics, README keywords).
 * These are suggestions only: the learner must confirm before a project enters the passport, and
 * no GitHub data ever creates learning or project time.
 */
import { normalizeSkill } from './taxonomy';

export interface RepoMetadata {
  fullName: string;
  name: string;
  description: string;
  htmlUrl: string;
  languages: Record<string, number>; // bytes per language (GitHub /languages)
  topics: string[];
  readme: string;
  createdAt: string;
  pushedAt: string;
  fork: boolean;
}

const README_KEYWORDS: [RegExp, string][] = [
  [/\bfastapi\b/i, 'FastAPI'],
  [/\bfirebase|firestore\b/i, 'Firebase'],
  [/\breact\b/i, 'React'],
  [/\bnode(\.js)?\b/i, 'Node.js'],
  [/\b(scikit-learn|sklearn|xgboost|machine learning)\b/i, 'Machine Learning'],
  [/\b(pytorch|tensorflow|keras|neural network)\b/i, 'Deep Learning'],
  [/\b(rest(ful)? api|endpoints?)\b/i, 'REST APIs'],
  [/\b(postgres(ql)?|mysql|sqlite|sql)\b/i, 'SQL'],
  [/\bdocker(file)?\b/i, 'Docker'],
  [/\bpandas|numpy\b/i, 'Data Analysis'],
];

const LANGUAGE_IGNORE = new Set(['Shell', 'Makefile', 'Dockerfile', 'Batchfile', 'PowerShell', 'Procfile', 'Jinja']);

export interface SkillHint {
  skill: string;
  reason: string;
}

export function skillHintsFromRepo(repo: RepoMetadata): SkillHint[] {
  const hints = new Map<string, string>();
  const totalBytes = Object.values(repo.languages).reduce((a, b) => a + b, 0) || 1;
  for (const [lang, bytes] of Object.entries(repo.languages)) {
    if (LANGUAGE_IGNORE.has(lang) || bytes / totalBytes < 0.05) continue;
    const n = normalizeSkill(lang);
    if (n.name) hints.set(n.name, `${Math.round((bytes / totalBytes) * 100)}% of code is ${lang}`);
  }
  if (repo.languages['Dockerfile']) hints.set('Docker', 'Repository contains a Dockerfile');
  for (const topic of repo.topics) {
    const n = normalizeSkill(topic, repo.description);
    if (n.known && !hints.has(n.name)) hints.set(n.name, `Repository topic "${topic}"`);
  }
  const text = `${repo.description}\n${repo.readme.slice(0, 20_000)}`;
  for (const [re, skill] of README_KEYWORDS) {
    if (!hints.has(skill) && re.test(text)) hints.set(skill, 'Mentioned in description or README');
  }
  if ((hints.has('FastAPI') || hints.has('REST APIs') || hints.has('Node.js')) && !hints.has('Backend Development')) {
    hints.set('Backend Development', 'Uses a backend framework or API');
  }
  return [...hints.entries()].map(([skill, reason]) => ({ skill, reason }));
}

/** Rank discovered repos by relevance to skills the learner is studying. */
export function repoRelevance(hints: readonly SkillHint[], learnerSkills: readonly string[]): number {
  const set = new Set(learnerSkills);
  return hints.reduce((score, h) => score + (set.has(h.skill) ? 1 : 0), 0);
}

/** Parse a public GitHub repository URL into owner/name; null when not a repo URL. */
export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const m = url.trim().match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?(?:[#?].*)?$/);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]! };
}
