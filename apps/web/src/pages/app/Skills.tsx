import { Link } from 'react-router-dom';
import { formatDuration } from '@skilltrace/shared';
import { useApp } from '../../lib/app-context';
import { skillTimelines } from '../../lib/analytics';
import { Badge, Card, EmptyState, PageHeader } from '../../components/ui';

export default function Skills() {
  const { data } = useApp();
  const timelines = skillTimelines(data);
  return (
    <div>
      <PageHeader
        title="Skill explorer"
        subtitle="Attributed time splits each session between the skills it covers, so totals across skills add up to unique time. Shared time shows the overlap explicitly."
      />
      {timelines.length === 0 ? (
        <EmptyState title="No skills detected yet">Skills appear after a recorded session is classified by Firebase AI Logic or corrected by you.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {timelines.map((t) => {
            const projects = data.projects.filter((p) => p.confirmedByUser && p.skillNames.includes(t.skill));
            const assessments = data.assessments.filter((a) => a.skill === t.skill);
            return (
              <Card key={t.skill}>
                <div className="flex items-start justify-between">
                  <Link to={`/app/skills/${encodeURIComponent(t.skill)}`} className="text-lg font-semibold text-slate-900 hover:underline">
                    {t.skill}
                  </Link>
                  <Badge tone="indigo">{formatDuration(t.attributedMs)}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  First studied {t.firstStudiedAt ? new Date(t.firstStudiedAt).toLocaleDateString() : '—'} · last {t.lastStudiedAt ? new Date(t.lastStudiedAt).toLocaleDateString() : '—'}
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {t.topics.slice(0, 8).map((x) => (
                    <Badge key={x}>{x}</Badge>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                  <div>Shared: {formatDuration(t.sharedMs)}</div>
                  <div>{projects.length} project(s)</div>
                  <div>{assessments.length} assessment(s)</div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
