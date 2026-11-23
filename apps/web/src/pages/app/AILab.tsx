import { useState } from 'react';
import { classifyPrompt, type AIResult, type Classification, type InferenceModeValue } from '@skilltrace/ai-engine';
import { useApp } from '../../lib/app-context';
import { getFirebase } from '../../lib/firebase';
import { Badge, Button, Card, Field, PageHeader, SourceBadge, inputCls } from '../../components/ui';
import { OnDeviceAIPanel } from '../../components/OnDeviceAIPanel';

const MODES: { mode: InferenceModeValue; label: string; note: string }[] = [
  { mode: 'prefer_on_device', label: 'PREFER_ON_DEVICE', note: 'SDK hybrid routing: on-device if available, otherwise cloud' },
  { mode: 'only_on_device', label: 'ONLY_ON_DEVICE', note: 'Never leaves the device; fails if no local model' },
  { mode: 'only_in_cloud', label: 'ONLY_IN_CLOUD', note: 'Always the cloud model' },
];

export default function AILab() {
  const { ai, data, prefs } = useApp();
  const fb = getFirebase();
  const [title, setTitle] = useState('Python Functions: Parameters, Return Values and Scope');
  const [excerpt, setExcerpt] = useState('def area(width, height=1): return width * height. Variables assigned inside a function are local (LEGB rule).');
  const [results, setResults] = useState<Record<string, AIResult<Classification> | 'running'>>({});
  const logs = [...data.inference_logs].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15);

  async function run(mode: InferenceModeValue) {
    if (!ai) return;
    setResults((r) => ({ ...r, [mode]: 'running' }));
    const r = await ai.service.runWithMode<Classification>('classify', mode, classifyPrompt({ title, excerpt, contentType: 'reading' }));
    setResults((x) => ({ ...x, [mode]: r }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hybrid AI (Firebase AI Logic)"
        subtitle="Every AI feature in SkillTrace runs through the Firebase AI Logic hybrid SDK. The source badge is read from response.inferenceSource. It is never inferred or guessed."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="On-device model">
          <OnDeviceAIPanel />
        </Card>
        <Card title="Configuration">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Firebase project</dt>
              <dd>{fb ? <Badge tone="green">configured</Badge> : <Badge tone="rose">not configured</Badge>}</dd>
            </div>
            <div className="flex justify-between">
              <dt>App Check</dt>
              <dd>{fb?.appCheck ? <Badge tone="green">{fb.appCheckStatus}</Badge> : <Badge tone="amber">{fb?.appCheckStatus ?? 'n/a'}</Badge>}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Cloud model</dt>
              <dd className="font-mono text-xs">{import.meta.env.VITE_AI_CLOUD_MODEL || 'gemini-3.5-flash-lite (SDK default)'}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Cloud consent preference</dt>
              <dd>{prefs.cloudAIConsent}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Send excerpts to cloud</dt>
              <dd>{prefs.allowCloudExcerpts ? 'yes (≤800 chars)' : 'no, titles only'}</dd>
            </div>
          </dl>
        </Card>
      </div>
      <Card title="Try skill classification in each inference mode">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Excerpt">
            <input className={inputCls} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          </Field>
        </div>
        {prefs.cloudAIConsent === 'deny' && <p className="mt-2 text-xs text-amber-800">Cloud AI is disabled in your settings, so cloud modes are refused here too.</p>}
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {MODES.map((m) => {
            const r = results[m.mode];
            return (
              <div key={m.mode} className="rounded-lg p-3 ring-1 ring-slate-200">
                <div className="font-mono text-xs font-semibold">{m.label}</div>
                <div className="text-xs text-slate-500">{m.note}</div>
                <Button className="mt-2" variant="secondary" disabled={!ai || r === 'running'} onClick={() => run(m.mode)}>
                  {r === 'running' ? 'Running…' : 'Run'}
                </Button>
                {r && r !== 'running' && (
                  <div className="mt-2 space-y-1 text-xs">
                    {r.ok ? (
                      <>
                        <SourceBadge source={r.source} /> <span className="text-slate-500">{r.durationMs} ms</span>
                        <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">{JSON.stringify(r.output, null, 2)}</pre>
                        <div className="text-slate-500">Model: {r.model}</div>
                      </>
                    ) : (
                      <p className="text-rose-700">
                        {r.error.kind}: {r.error.message}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!ai && <p className="mt-3 text-sm text-slate-500">Firebase AI Logic is not configured in this build. See docs/deployment.md.</p>}
      </Card>
      <Card title="Inference log (this account)">
        {logs.length === 0 ? (
          <p className="text-sm text-slate-500">No inference yet.</p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1">Time</th>
                <th>Task</th>
                <th>Mode</th>
                <th>Source (SDK)</th>
                <th>Duration</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="py-1">{new Date(l.at).toLocaleTimeString()}</td>
                  <td>{l.task}</td>
                  <td className="font-mono">{l.mode}</td>
                  <td>{l.ok ? <SourceBadge source={l.source} /> : '—'}</td>
                  <td>{l.durationMs} ms</td>
                  <td>{l.ok ? 'ok' : l.errorCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
