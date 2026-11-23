import { useState } from 'react';
import { formatDuration } from '@skilltrace/shared';
import { estimateReadingSpeed } from '@skilltrace/tracking-engine';
import { useApp } from '../../lib/app-context';
import { Badge, Card, EmptyState, PageHeader, Stat } from '../../components/ui';

export default function Analytics() {
  const { data, prefs } = useApp();
  const [tab, setTab] = useState<'reading' | 'media'>('reading');
  const reading = data.reading_metrics;
  const credible = reading.filter((m) => m.credible && m.observedWpm).map((m) => m.observedWpm!);
  const speed = estimateReadingSpeed(credible, {
    baselineWpm: prefs.readingBaselineWpm,
    minSessions: 3,
    window: 10,
    priorStrength: 3,
  });
  const media = data.learning_sessions.filter(
    (s) => s.contentType === 'video' || s.contentType === 'audio',
  );
  const sourceTitle = (id: string) => data.learning_sources.find((s) => s.id === id)?.title ?? id;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        subtitle="Reading progress and pace are not comprehension measures, and are never used to judge honesty."
      />
      <div role="tablist" className="flex gap-2">
        {(['reading', 'media'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm ${tab === t ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-300'}`}
          >
            {t === 'reading' ? 'Reading' : 'Video & audio'}
          </button>
        ))}
      </div>
      {tab === 'reading' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Estimated reading pace"
              value={`${speed.wpm} wpm`}
              hint={
                speed.personalised
                  ? `Personalised from ${speed.sessionsUsed} credible sessions (${speed.excludedOutliers} outliers excluded)`
                  : `Baseline reference (${prefs.readingBaselineWpm} wpm) until 3 credible sessions`
              }
            />
            <Stat label="Reading sessions" value={reading.length} />
            <Stat
              label="Page resets"
              value={reading.reduce((a, m) => a + m.resets, 0)}
              hint="After 5 consecutive missed questions"
            />
          </div>
          <Card title="Documents">
            {reading.length === 0 ? (
              <EmptyState title="No reading sessions yet" />
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="py-2">Page</th>
                    <th>Words</th>
                    <th>Progress</th>
                    <th>Credited</th>
                    <th>Expected</th>
                    <th>Observed pace</th>
                    <th>Revisits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reading.map((m) => {
                    const session = data.learning_sessions.find((s) => `rm_${s.id}` === m.id);
                    return (
                      <tr key={m.id}>
                        <td className="py-2">
                          {session ? sourceTitle(session.sourceId) : m.pageId}
                        </td>
                        <td>{m.wordCount}</td>
                        <td>{Math.round(m.progressRatio * 100)}%</td>
                        <td>{formatDuration(m.creditedMs)}</td>
                        <td>{formatDuration(m.expectedMs)}</td>
                        <td>
                          {m.observedWpm ?? '—'}{' '}
                          {m.credible ? (
                            <Badge tone="green">credible</Badge>
                          ) : (
                            <Badge>not used</Badge>
                          )}
                        </td>
                        <td>{m.revisits}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </>
      ) : (
        <Card title="Media sessions">
          {media.length === 0 ? (
            <EmptyState title="No video or audio sessions yet" />
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="py-2">Source</th>
                  <th>Type</th>
                  <th>Eligible</th>
                  <th>Coverage</th>
                  <th>Revision</th>
                  <th>Unverified</th>
                  <th>Paused</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {media.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2">{sourceTitle(s.sourceId)}</td>
                    <td>{s.contentType}</td>
                    <td>{formatDuration(s.eligibleMs)}</td>
                    <td>
                      {formatDuration(s.coverageSec * 1000)} ({Math.round(s.coverageRatio * 100)}%)
                    </td>
                    <td>{formatDuration(s.revisionMs)}</td>
                    <td>{formatDuration(s.unverifiedMs)}</td>
                    <td>{formatDuration(s.pausedMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
