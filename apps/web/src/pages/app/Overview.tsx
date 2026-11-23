import { Link } from 'react-router-dom';
import { formatDuration, msToHours } from '@skilltrace/shared';
import { useApp } from '../../lib/app-context';
import {
  dailyActivity,
  learningTotals,
  projectHours,
  skillTimelines,
  thisWeekMs,
} from '../../lib/analytics';
import { Badge, Bars, Card, EmptyState, PageHeader, SampleBanner, Stat } from '../../components/ui';

export default function Overview() {
  const { data, profile } = useApp();
  const totals = learningTotals(data);
  const timelines = skillTimelines(data);
  const week = dailyActivity(data, 7);
  const hours = projectHours(data);
  const suggested = data.projects.filter((p) => p.status === 'suggested' && !p.confirmedByUser);
  const hasSample = data.learning_sessions.some((s) => s.provenance === 'sample_data');
  const totalProjectMs = [...hours.values()].reduce((a, b) => a + b, 0);
  const recentAssessments = [...data.assessments]
    .sort((a, b) => b.attemptedAt.localeCompare(a.attemptedAt))
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome${profile.displayName ? `, ${profile.displayName}` : ''}`}
        subtitle="Learning activity, project work and assessment results are tracked separately and never added together."
      />
      {hasSample && <SampleBanner />}
      {suggested.length > 0 && (
        <div className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-900 ring-1 ring-indigo-200">
          New relevant project detected: <strong>{suggested[0]!.title}</strong>. Would you like to
          add it to your Skill Passport?{' '}
          <Link to="/app/projects" className="font-medium underline">
            Review
          </Link>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Eligible learning (all time)"
          value={`${msToHours(totals.uniqueEligibleMs)} h`}
          hint="Unique time, overlapping tabs counted once"
        />
        <Stat
          label="This week"
          value={formatDuration(thisWeekMs(data))}
          hint="Automatically recorded activity"
        />
        <Stat
          label="Project work"
          value={`${msToHours(totalProjectMs)} h`}
          hint="Self-reported, kept separate"
        />
        <Stat
          label="Assessments"
          value={data.assessments.length}
          hint="Objectively graded attempts"
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Learning activity, last 7 days" className="lg:col-span-2">
          <Bars
            data={week.map((d) => ({ label: d.day.slice(5), value: d.ms }))}
            format={(v) => `${Math.round(v / 60000)}m`}
          />
          <p className="mt-2 text-xs text-slate-500">
            All-time revision: {formatDuration(totals.revisionMs)} · Unverified (not credited):{' '}
            {formatDuration(totals.unverifiedMs)}
            {totals.pendingClassification > 0 &&
              ` · ${totals.pendingClassification} session(s) awaiting skill detection`}
          </p>
        </Card>
        <Card title="Recent assessments">
          {recentAssessments.length ? (
            <ul className="space-y-2 text-sm">
              {recentAssessments.map((a) => (
                <li key={a.id} className="flex justify-between">
                  <span>{a.title}</span>
                  <Badge tone="green">
                    {a.score}/{a.maxScore}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">None yet.</p>
          )}
        </Card>
      </div>
      <Card
        title="Skills you are studying"
        action={
          <Link className="text-sm text-indigo-700 hover:underline" to="/app/skills">
            All skills
          </Link>
        }
      >
        {timelines.length === 0 ? (
          <EmptyState
            title="No learning recorded yet"
            action={
              <Link className="text-sm font-medium text-indigo-700 underline" to="/app/lab">
                Start a lesson in the Learning Lab
              </Link>
            }
          >
            Skills appear here once a session is recorded and classified. Nothing is shown that was
            not actually recorded.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {timelines.slice(0, 6).map((t) => {
              const projects = data.projects.filter(
                (p) => p.confirmedByUser && p.skillNames.includes(t.skill),
              ).length;
              return (
                <li
                  key={t.skill}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <Link
                    to={`/app/skills/${encodeURIComponent(t.skill)}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {t.skill}
                  </Link>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge tone="indigo">{formatDuration(t.attributedMs)} learning</Badge>
                    <Badge>{t.topics.length} topics</Badge>
                    <Badge>{formatDuration(t.revisionMs)} revision</Badge>
                    <Badge tone="amber">{projects} project(s)</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
