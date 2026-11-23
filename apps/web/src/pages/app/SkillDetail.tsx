import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatDuration } from '@skilltrace/shared';
import { skillDefinition } from '@skilltrace/skill-taxonomy';
import { useApp } from '../../lib/app-context';
import { skillAssessments, skillProjects, skillTimelines } from '../../lib/analytics';
import {
  Badge,
  Bars,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SourceBadge,
  Stat,
} from '../../components/ui';

type Period = 'daily' | 'weekly' | 'monthly';

export default function SkillDetail() {
  const { name = '' } = useParams();
  const skill = decodeURIComponent(name);
  const { data, ai } = useApp();
  const [period, setPeriod] = useState<Period>('daily');
  const [explanation, setExplanation] = useState<{ text: string; source: string } | null>(null);
  const [explainError, setExplainError] = useState('');
  const tl = skillTimelines(data).find((t) => t.skill === skill);
  if (!tl) return <EmptyState title={`No evidence for ${skill}`} />;

  const def = skillDefinition(skill);
  const topics = data.skill_topics.filter((t) => t.name && tl.topics.includes(t.name));
  const bySubskill = new Map<string, string[]>();
  for (const t of tl.topics) {
    const sub = topics.find((x) => x.name === t)?.subskill ?? 'General';
    bySubskill.set(sub, [...(bySubskill.get(sub) ?? []), t]);
  }
  const series = Object.entries(tl[period])
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([label, value]) => ({ label: period === 'daily' ? label.slice(5) : label, value }));
  const sessions = data.learning_sessions
    .filter((s) => s.attributions.some((a) => a.skill === skill))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const projects = skillProjects(data, skill);
  const assessments = skillAssessments(data, skill);

  async function explain() {
    if (!ai || !tl) return;
    setExplainError('');
    const evidence = [
      `Eligible learning (automatically recorded): ${(tl.attributedMs / 3_600_000).toFixed(1)} h over ${tl.sessionCount} sessions`,
      `Revision: ${(tl.revisionMs / 3_600_000).toFixed(1)} h; topics: ${tl.topics.join(', ')}`,
      `Assessments: ${assessments.map((a) => `${a.title} ${a.score}/${a.maxScore} (${a.verificationLevel})`).join('; ') || 'none'}`,
      `Projects (self-reported time): ${projects.map((p) => p.title).join(', ') || 'none'}`,
    ].join('\n');
    const r = await ai.explainSkillEvidence({ skill, evidence });
    if (r.ok) setExplanation({ text: r.output.explanation, source: r.source });
    else setExplainError(r.error.message);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={skill}
        subtitle={def ? `${def.category} · subskills: ${def.subskills.join(', ')}` : 'Custom skill'}
        actions={
          <Link className="text-sm text-indigo-700 hover:underline" to="/app/skills">
            All skills
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Eligible learning"
          value={formatDuration(tl.attributedMs)}
          hint="Attributed share of each session"
        />
        <Stat
          label="Involved time"
          value={formatDuration(tl.involvedMs)}
          hint={`Incl. ${formatDuration(tl.sharedMs)} shared with other skills`}
        />
        <Stat
          label="Raw recorded"
          value={formatDuration(tl.rawMs)}
          hint={`Unverified: ${formatDuration(tl.unverifiedMs)}`}
        />
        <Stat
          label="Revision"
          value={formatDuration(tl.revisionMs)}
          hint={`${tl.sessionCount} sessions · ${tl.sourceIds.length} sources`}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          title="Learning history"
          className="lg:col-span-2"
          action={
            <div className="flex gap-1" role="tablist" aria-label="Period">
              {(['daily', 'weekly', 'monthly'] as const).map((p) => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={period === p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`rounded px-2 py-1 text-xs ${period === p ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          }
        >
          <Bars data={series} format={(v) => `${Math.round(v / 60000)}m`} />
        </Card>
        <Card title="Source breakdown">
          <ul className="space-y-1 text-sm">
            {Object.entries(tl.byContentType).map(([k, v]) => (
              <li key={k} className="flex justify-between">
                <span className="capitalize">{k}</span>
                <span>{formatDuration(v)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Topic coverage">
        {[...bySubskill.entries()].map(([sub, list]) => (
          <div key={sub} className="mb-2">
            <div className="text-xs font-medium text-slate-500">{sub}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {list.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
          </div>
        ))}
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Assessments">
          {assessments.length ? (
            <ul className="space-y-1 text-sm">
              {assessments.map((a) => (
                <li key={a.id} className="flex justify-between">
                  <span>
                    {a.title}{' '}
                    <span className="text-xs text-slate-500">
                      ({new Date(a.attemptedAt).toLocaleDateString()})
                    </span>
                  </span>
                  <Badge tone="green">
                    {a.score}/{a.maxScore}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              None.{' '}
              <Link className="text-indigo-700 underline" to="/app/assessments">
                Take one
              </Link>
            </p>
          )}
        </Card>
        <Card title="Linked projects">
          {projects.length ? (
            <ul className="space-y-1 text-sm">
              {projects.map((p) => (
                <li key={p.id}>
                  <Link className="text-indigo-700 hover:underline" to={`/app/projects/${p.id}`}>
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">
              No confirmed projects use this skill. Project time never changes this skill's learning
              time.
            </p>
          )}
        </Card>
      </div>
      <Card title="Learning sessions">
        <ul className="divide-y divide-slate-100 text-sm">
          {sessions.slice(0, 20).map((s) => {
            const src = data.learning_sources.find((x) => x.id === s.sourceId);
            const a = s.attributions.find((x) => x.skill === skill)!;
            return (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{src?.title ?? s.sourceId}</span>
                <span className="text-slate-500">
                  {new Date(s.startedAt).toLocaleDateString()} ·{' '}
                  {formatDuration(s.eligibleMs * a.weight)} attributed ({Math.round(a.weight * 100)}
                  % of {formatDuration(s.eligibleMs)})
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
      <Card
        title="Explain this evidence"
        action={
          <Button variant="secondary" disabled={!ai} onClick={explain}>
            Generate explanation
          </Button>
        }
      >
        {explanation ? (
          <div className="space-y-2">
            <SourceBadge source={explanation.source} />
            <p className="text-sm text-slate-700">{explanation.text}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            {explainError ||
              (ai
                ? 'A plain-language explanation of what this evidence does and does not show.'
                : 'Requires Firebase AI Logic.')}
          </p>
        )}
      </Card>
    </div>
  );
}
