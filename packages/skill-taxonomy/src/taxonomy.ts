/**
 * Skill taxonomy and name normalisation. Prevents duplicates caused by naming variations
 * ("JS" vs "JavaScript", "Python 3" vs "Python"). Ambiguous abbreviations are only expanded
 * when the surrounding context supports it.
 */

export interface SkillDefinition {
  name: string;
  category: string;
  aliases: string[];
  subskills: string[];
  /** Words that, when present in context, confirm an ambiguous alias. */
  contextHints?: string[];
  /** Aliases that need a context hint before they map to this skill. */
  ambiguousAliases?: string[];
}

export const TAXONOMY: SkillDefinition[] = [
  {
    name: 'Python',
    category: 'Programming Languages',
    aliases: ['python', 'python3', 'python 3', 'py', 'cpython', 'python programming'],
    subskills: ['Fundamentals', 'Data Types', 'Functions', 'Object-Oriented Programming', 'APIs', 'Modules', 'Error Handling'],
  },
  {
    name: 'JavaScript',
    category: 'Programming Languages',
    aliases: ['javascript', 'js', 'ecmascript', 'es6', 'es2015', 'vanilla js'],
    subskills: ['Fundamentals', 'DOM', 'Async', 'Functions', 'Modules'],
  },
  {
    name: 'TypeScript',
    category: 'Programming Languages',
    aliases: ['typescript', 'ts'],
    subskills: ['Types', 'Generics', 'Tooling'],
    ambiguousAliases: ['ts'],
    contextHints: ['type', 'typescript', 'interface', 'javascript', 'tsc', 'generic'],
  },
  {
    name: 'SQL',
    category: 'Data',
    aliases: ['sql', 'structured query language', 'postgresql', 'postgres', 'mysql', 'sqlite', 't-sql', 'tsql'],
    subskills: ['Queries', 'Joins', 'Aggregation', 'Schema Design', 'Indexes'],
  },
  {
    name: 'Machine Learning',
    category: 'AI & Data Science',
    aliases: ['machine learning', 'ml', 'statistical learning'],
    subskills: ['Supervised Learning', 'Unsupervised Learning', 'Model Evaluation', 'Feature Engineering'],
    ambiguousAliases: ['ml'],
    contextHints: ['model', 'training', 'learning', 'dataset', 'regression', 'classification', 'neural', 'scikit', 'predict', 'feature'],
  },
  {
    name: 'Deep Learning',
    category: 'AI & Data Science',
    aliases: ['deep learning', 'dl', 'neural networks', 'neural network'],
    subskills: ['Neural Networks', 'CNNs', 'Transformers', 'Training'],
    ambiguousAliases: ['dl'],
    contextHints: ['neural', 'network', 'layer', 'gradient', 'tensor', 'pytorch', 'tensorflow'],
  },
  {
    name: 'React',
    category: 'Frontend',
    aliases: ['react', 'react.js', 'reactjs', 'react js'],
    subskills: ['Components', 'Hooks', 'State', 'Routing'],
  },
  { name: 'HTML', category: 'Frontend', aliases: ['html', 'html5'], subskills: ['Semantics', 'Forms', 'Accessibility'] },
  { name: 'CSS', category: 'Frontend', aliases: ['css', 'css3', 'tailwind', 'tailwind css'], subskills: ['Layout', 'Responsive Design'] },
  { name: 'Node.js', category: 'Backend', aliases: ['node', 'node.js', 'nodejs', 'node js'], subskills: ['Modules', 'Streams', 'HTTP'] },
  { name: 'FastAPI', category: 'Backend', aliases: ['fastapi', 'fast api'], subskills: ['Routing', 'Validation', 'Dependency Injection'] },
  {
    name: 'REST APIs',
    category: 'Backend',
    aliases: ['rest', 'rest api', 'rest apis', 'restful', 'restful api', 'http api', 'web api', 'apis', 'api'],
    subskills: ['HTTP Methods', 'Status Codes', 'Authentication', 'JSON'],
  },
  {
    name: 'Backend Development',
    category: 'Backend',
    aliases: ['backend', 'back-end', 'backend development', 'server-side', 'server side development'],
    subskills: ['APIs', 'Databases', 'Authentication', 'Deployment'],
  },
  { name: 'Firebase', category: 'Cloud', aliases: ['firebase', 'firestore', 'cloud firestore', 'firebase auth'], subskills: ['Firestore', 'Authentication', 'Hosting', 'AI Logic'] },
  { name: 'Git', category: 'Tools', aliases: ['git', 'github', 'version control'], subskills: ['Branching', 'Merging', 'Collaboration'] },
  { name: 'Docker', category: 'DevOps', aliases: ['docker', 'containers', 'containerization', 'dockerfile'], subskills: ['Images', 'Compose'] },
  { name: 'Java', category: 'Programming Languages', aliases: ['java', 'jdk', 'java se'], subskills: ['OOP', 'Collections', 'Concurrency'] },
  { name: 'C++', category: 'Programming Languages', aliases: ['c++', 'cpp', 'cplusplus'], subskills: ['Memory', 'STL', 'Templates'] },
  {
    name: 'Data Structures & Algorithms',
    category: 'Computer Science',
    aliases: ['data structures', 'algorithms', 'dsa', 'data structures and algorithms'],
    subskills: ['Arrays', 'Trees', 'Graphs', 'Sorting', 'Complexity'],
  },
  { name: 'Statistics', category: 'AI & Data Science', aliases: ['statistics', 'stats', 'probability'], subskills: ['Descriptive', 'Inference', 'Probability'] },
  { name: 'Data Analysis', category: 'AI & Data Science', aliases: ['data analysis', 'pandas', 'data analytics', 'numpy'], subskills: ['Cleaning', 'Visualisation', 'Exploration'] },
];

const aliasIndex = new Map<string, SkillDefinition>();
for (const def of TAXONOMY) {
  aliasIndex.set(def.name.toLowerCase(), def);
  for (const a of def.aliases) aliasIndex.set(a.toLowerCase(), def);
}

function clean(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[“”"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export interface NormalizedSkill {
  name: string;
  known: boolean;
  category: string;
  /** True when an ambiguous alias was left unexpanded because context did not support it. */
  ambiguous: boolean;
}

/**
 * Map a raw skill name to its canonical form.
 * @param context optional surrounding text (title, topics) used to resolve ambiguous aliases.
 */
export function normalizeSkill(raw: string, context = ''): NormalizedSkill {
  const c = clean(raw);
  if (!c) return { name: '', known: false, category: 'Other', ambiguous: false };
  const candidates = [c, c.replace(/\s*v?\d+(\.\d+)*$/, ''), c.replace(/[.\-_]/g, ' ').trim(), c.replace(/\s+/g, '')];
  for (const cand of candidates) {
    const def = aliasIndex.get(cand);
    if (!def) continue;
    if (def.ambiguousAliases?.includes(cand)) {
      const ctx = context.toLowerCase();
      const supported = def.contextHints?.some((h) => ctx.includes(h)) ?? false;
      if (!supported) return { name: raw.trim().toUpperCase(), known: false, category: 'Other', ambiguous: true };
    }
    return { name: def.name, known: true, category: def.category, ambiguous: false };
  }
  return { name: titleCase(raw), known: false, category: 'Other', ambiguous: false };
}

export function skillDefinition(name: string): SkillDefinition | undefined {
  return aliasIndex.get(name.toLowerCase());
}

export function normalizeTopic(raw: string): string {
  return titleCase(raw.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 80);
}

/** De-duplicate topic lists case-insensitively while preserving first spelling. */
export function uniqueTopics(topics: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const t of topics) {
    const n = normalizeTopic(t);
    if (n && !seen.has(n.toLowerCase())) seen.set(n.toLowerCase(), n);
  }
  return [...seen.values()];
}

/** Map a topic to one of the skill's subskills when it clearly matches, else 'General'. */
export function subskillFor(skill: string, topic: string): string {
  const def = skillDefinition(skill);
  if (!def) return 'General';
  const t = topic.toLowerCase();
  const hit = def.subskills.find((s) => t.includes(s.toLowerCase()) || s.toLowerCase().includes(t));
  return hit ?? 'General';
}
