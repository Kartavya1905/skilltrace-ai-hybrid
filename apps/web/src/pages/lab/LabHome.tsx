import { Link } from 'react-router-dom';
import { touch } from '@skilltrace/shared';
import { useApp } from '../../lib/app-context';
import { AUDIO_LESSON, PYTHON_FUNCTIONS_LESSON, VIDEO_LESSON } from '../../content/lessons';
import { Button, Card, PageHeader } from '../../components/ui';

export function TrackingGate() {
  const { prefs, store } = useApp();
  if (prefs.trackingEnabled && !prefs.trackingPaused) return null;
  return (
    <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
      <span>{prefs.trackingEnabled ? 'Tracking is paused. Nothing on this page is being recorded.' : 'Tracking is off. You can use the lesson, but nothing will be recorded.'}</span>
      <Button onClick={() => store?.put('preferences', touch({ ...prefs, trackingEnabled: true, trackingPaused: false }))}>
        {prefs.trackingEnabled ? 'Resume tracking' : 'Enable tracking'}
      </Button>
    </div>
  );
}

const ITEMS = [
  { to: '/app/lab/reading', title: PYTHON_FUNCTIONS_LESSON.title, kind: 'Reading', body: 'Five sections with engagement questions. Personalised reading pace after a few sessions.' },
  { to: '/app/lab/video', title: VIDEO_LESSON.title, kind: 'Video', body: 'Rewind, skip or change speed and watch how active time, coverage and revision are counted separately.' },
  { to: '/app/lab/audio', title: AUDIO_LESSON.title, kind: 'Audio', body: 'Background listening is allowed for audio. Captions come from a bundled transcript.' },
  { to: '/app/assessments', title: 'Python functions assessment', kind: 'Assessment', body: 'Objectively graded output-prediction and debugging questions.' },
  { to: '/app/github', title: 'Import a GitHub project', kind: 'Project', body: 'Import a public repository, confirm suggested skills, then log your own work time.' },
];

export default function LabHome() {
  return (
    <div>
      <PageHeader
        title="Learning Lab"
        subtitle="First-party demo lessons written for SkillTrace. Everything here works without the extension or third-party platforms, and is tracked with the same engine the extension uses."
      />
      <TrackingGate />
      <div className="grid gap-4 md:grid-cols-2">
        {ITEMS.map((i) => (
          <Card key={i.to}>
            <div className="text-xs font-medium uppercase tracking-wide text-indigo-700">{i.kind}</div>
            <h2 className="mt-1 font-semibold text-slate-900">{i.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{i.body}</p>
            <Link to={i.to} className="mt-3 inline-block text-sm font-medium text-indigo-700 hover:underline">
              Open →
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
