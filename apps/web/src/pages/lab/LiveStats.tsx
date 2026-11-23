import { formatDuration } from '@skilltrace/shared';
import type { SessionResult } from '@skilltrace/tracking-engine';
import { Progress } from '../../components/ui';

export function LiveStats({ summary, kind }: { summary: SessionResult | null; kind: 'video' | 'audio' | 'reading' }) {
  const s = summary;
  const rows: [string, string, string][] = s
    ? kind === 'reading'
      ? [
          ['Eligible reading time', formatDuration(s.eligibleMs), 'Visible, focused, and within the idle allowance; paused during questions'],
          ['Recorded time on page', formatDuration(s.rawMs), 'Raw time the page was visible'],
          ['Reading progress', `${Math.round(s.coverageRatio * 100)}%`, 'Sections visible long enough. Not a comprehension measure'],
          ['Expected duration', formatDuration(s.reading?.expectedMs ?? 0), 'At your current estimated pace'],
          ['Questions answered / missed', `${s.reading?.checksResponded ?? 0} / ${s.reading?.checksMissed ?? 0}`, 'Wrong answers have no penalty'],
          ['Forfeited (page reset)', formatDuration(s.unverifiedMs), 'After 5 consecutive missed questions'],
        ]
      : [
          ['Eligible active time', formatDuration(s.eligibleMs), 'Real elapsed playback time that earned credit'],
          ['Unique coverage', `${formatDuration(s.coverageSec * 1000)} (${Math.round(s.coverageRatio * 100)}%)`, 'Distinct positions played; rewatching does not add'],
          ['Revision time', formatDuration(s.revisionMs), 'Active time spent re-playing covered parts'],
          ['Unverified time', formatDuration(s.unverifiedMs), 'Missed verification; kept in the audit log, not credited'],
          ['Raw playback time', formatDuration(s.rawMs), 'Everything while playing, incl. buffering and hidden tab'],
          ['Paused time', formatDuration(s.pausedMs), 'Never counted'],
        ]
    : [];
  return (
    <div className="space-y-3">
      {kind !== 'reading' && s && <Progress value={s.coverageRatio} label="Unique coverage" />}
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map(([k, v, hint]) => (
          <div key={k} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
            <dt className="text-xs text-slate-500">{k}</dt>
            <dd className="text-lg font-semibold text-slate-900" aria-live="off">
              {v}
            </dd>
            <dd className="text-[11px] text-slate-500">{hint}</dd>
          </div>
        ))}
      </dl>
      {!s && <p className="text-sm text-slate-500">Waiting for tracking to start…</p>}
    </div>
  );
}

/** Visual strip of covered media ranges (0..duration). */
export function CoverageStrip({ ranges, duration }: { ranges: { start: number; end: number }[]; duration: number }) {
  if (!duration) return null;
  return (
    <div className="relative h-3 w-full overflow-hidden rounded bg-slate-200" role="img" aria-label={`Covered ranges: ${ranges.map((r) => `${Math.round(r.start)}s to ${Math.round(r.end)}s`).join(', ') || 'none'}`}>
      {ranges.map((r) => (
        <div key={`${r.start}-${r.end}`} className="absolute top-0 h-full bg-emerald-500" style={{ left: `${(r.start / duration) * 100}%`, width: `${((r.end - r.start) / duration) * 100}%` }} />
      ))}
    </div>
  );
}
