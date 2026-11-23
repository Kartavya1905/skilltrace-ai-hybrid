import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { formatDuration, msToHours, touch } from '@skilltrace/shared';
import { applyTimer, newTimer, timerElapsed, validateManualSession, type TimerState } from '@skilltrace/tracking-engine';
import { useApp } from '../../lib/app-context';
import { addMilestone, addWorkSession } from '../../lib/actions';
import { projectHours } from '../../lib/analytics';
import { Badge, Button, Card, EmptyState, EvidenceBadge, Field, PageHeader, Stat, inputCls } from '../../components/ui';

const timerKey = (id: string) => `skilltrace:timer:${id}`;

function loadTimer(id: string): TimerState {
  try {
    return (JSON.parse(localStorage.getItem(timerKey(id)) ?? 'null') as TimerState | null) ?? newTimer();
  } catch {
    return newTimer();
  }
}

export default function ProjectDetail() {
  const { id = '' } = useParams();
  const { data, store } = useApp();
  const project = data.projects.find((p) => p.id === id);
  const [timer, setTimer] = useState<TimerState>(() => loadTimer(id));
  const [now, setNow] = useState(Date.now());
  const [desc, setDesc] = useState('');
  const [manual, setManual] = useState({ start: '', end: '', description: '', evidence: '' });
  const [error, setError] = useState('');
  const [milestone, setMilestone] = useState('');

  useEffect(() => {
    localStorage.setItem(timerKey(id), JSON.stringify(timer));
  }, [id, timer]);
  useEffect(() => {
    if (!timer.running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [timer.running]);

  if (!project) return <EmptyState title="Project not found" />;
  const sessions = data.project_work_sessions.filter((s) => s.projectId === id).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const milestones = data.github_milestones.filter((m) => m.projectId === id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const total = projectHours(data).get(id) ?? 0;
  const act = (type: 'start' | 'pause' | 'resume' | 'stop') => setTimer((t) => applyTimer(t, { type, t: Date.now() }));

  async function stopTimer() {
    if (!store || !project) return;
    const stopped = applyTimer(timer, { type: 'stop', t: Date.now() });
    if (stopped.accumulatedMs >= 1000 && stopped.startedAt) {
      await addWorkSession(store, {
        projectId: id,
        startedAt: new Date(stopped.startedAt).toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: stopped.accumulatedMs, // running time only; pauses excluded
        description: desc,
        evidenceUrl: '',
        skillNames: project.skillNames,
        provenance: 'timer_recorded',
      });
    }
    setTimer(newTimer());
    setDesc('');
  }

  return (
    <div className="space-y-6">
      <PageHeader title={project.title} subtitle={project.description} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Self-reported project time" value={`${msToHours(total)} h`} hint="Manual entries + your timer only" />
        <Stat label="GitHub milestones" value={milestones.length} hint="0 hours each, by design" />
        <Stat label="Linked skills" value={project.skillNames.length} hint={project.skillNames.join(', ') || '—'} />
      </div>
      <div className="flex flex-wrap gap-2">
        {project.githubUrl && (
          <a className="text-sm text-indigo-700 underline" href={project.githubUrl} target="_blank" rel="noreferrer noopener">
            {project.githubUrl}
          </a>
        )}
        <select
          aria-label="Project status"
          className="rounded-lg px-2 py-1 text-sm ring-1 ring-slate-300"
          value={project.status}
          onChange={(e) => store?.put('projects', touch({ ...project, status: e.target.value as typeof project.status }))}
        >
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Work timer">
          <div className="text-3xl font-semibold tabular-nums">{formatDuration(timerElapsed(timer, now))}</div>
          <Field label="What are you working on?">
            <input className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </Field>
          <div className="mt-3 flex gap-2">
            {!timer.running && timer.accumulatedMs === 0 && <Button onClick={() => act('start')}>Start</Button>}
            {timer.running && (
              <Button variant="secondary" onClick={() => act('pause')}>
                Pause
              </Button>
            )}
            {!timer.running && timer.accumulatedMs > 0 && <Button onClick={() => act('resume')}>Resume</Button>}
            {(timer.running || timer.accumulatedMs > 0) && (
              <Button variant="danger" onClick={stopTimer}>
                Stop & save
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">Saved as "Self-reported (timer)". This never changes any skill's learning timeline.</p>
        </Card>
        <Card title="Add a manual work session">
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Start">
              <input type="datetime-local" className={inputCls} value={manual.start} onChange={(e) => setManual({ ...manual, start: e.target.value })} />
            </Field>
            <Field label="End">
              <input type="datetime-local" className={inputCls} value={manual.end} onChange={(e) => setManual({ ...manual, end: e.target.value })} />
            </Field>
          </div>
          <Field label="Description">
            <input className={inputCls} value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })} />
          </Field>
          <Field label="Evidence link (optional)">
            <input className={inputCls} value={manual.evidence} onChange={(e) => setManual({ ...manual, evidence: e.target.value })} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}
          <Button
            className="mt-3"
            onClick={async () => {
              if (!store) return;
              const toIsoSafe = (v: string) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : '');
              const s = toIsoSafe(manual.start);
              const e = toIsoSafe(manual.end);
              const err = s && e ? validateManualSession(s, e) : 'Enter a valid start and end.';
              setError(err ?? '');
              if (err) return;
              await addWorkSession(store, { projectId: id, startedAt: s, endedAt: e, description: manual.description, evidenceUrl: manual.evidence, skillNames: project.skillNames, provenance: 'self_reported' });
              setManual({ start: '', end: '', description: '', evidence: '' });
            }}
          >
            Add session
          </Button>
        </Card>
      </div>
      <Card title="Project timeline">
        <ul className="space-y-2 text-sm">
          {[
            ...sessions.map((s) => ({ key: s.id, at: s.startedAt, node: (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {s.description || 'Work session'} {s.evidenceUrl && <a className="text-indigo-700 underline" href={s.evidenceUrl} target="_blank" rel="noreferrer noopener">evidence</a>}
                </span>
                <span className="flex items-center gap-2">
                  <EvidenceBadge type={s.provenance} /> {formatDuration(s.durationMs)}
                  <button type="button" className="text-xs text-rose-700 hover:underline" onClick={() => store?.remove('project_work_sessions', s.id)}>
                    delete
                  </button>
                </span>
              </div>
            ) })),
            ...milestones.map((m) => ({ key: m.id, at: m.occurredAt, node: (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a className="hover:underline" href={m.url} target="_blank" rel="noreferrer noopener">{m.title}</a>
                <span className="flex items-center gap-2"><EvidenceBadge type={m.provenance} /> <Badge>0 h (milestone)</Badge></span>
              </div>
            ) })),
          ]
            .sort((a, b) => b.at.localeCompare(a.at))
            .map((x) => (
              <li key={x.key} className="border-l-2 border-slate-200 pl-3">
                <div className="text-xs text-slate-500">{new Date(x.at).toLocaleString()}</div>
                {x.node}
              </li>
            ))}
        </ul>
        <div className="mt-4 flex gap-2">
          <input className={inputCls} placeholder="Mark a milestone (e.g. Deployed v1)" value={milestone} onChange={(e) => setMilestone(e.target.value)} aria-label="Milestone title" />
          <Button
            variant="secondary"
            disabled={!milestone.trim()}
            onClick={async () => {
              if (!store) return;
              await addMilestone(store, { projectId: id, kind: 'release', title: milestone.trim(), occurredAt: new Date().toISOString(), url: project.githubUrl }, 'self_reported');
              setMilestone('');
            }}
          >
            Add milestone
          </Button>
        </div>
      </Card>
    </div>
  );
}
