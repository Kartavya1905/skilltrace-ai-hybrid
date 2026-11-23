import { useEffect, useState } from 'react';
import { checkOnDeviceAvailability, type OnDeviceAvailability } from '@skilltrace/ai-engine/firebase';
import { useApp } from '../lib/app-context';
import { Badge, Button, Progress } from './ui';

const LABELS: Record<OnDeviceAvailability, { text: string; tone: 'green' | 'amber' | 'slate' | 'rose' }> = {
  available: { text: 'On-device model ready', tone: 'green' },
  downloadable: { text: 'On-device model can be downloaded', tone: 'amber' },
  downloading: { text: 'On-device model downloading', tone: 'amber' },
  unavailable: { text: 'On-device model unavailable on this device', tone: 'rose' },
  api_missing: { text: 'Chrome built-in AI (Prompt API) not present', tone: 'slate' },
};

/** Explicit, user-initiated on-device model initialisation with live status (onboarding step 6-7). */
export function OnDeviceAIPanel() {
  const { ai } = useApp();
  const [availability, setAvailability] = useState<OnDeviceAvailability | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => void checkOnDeviceAvailability().then(setAvailability);
  useEffect(refresh, []);

  async function init() {
    if (!ai) return;
    setBusy(true);
    setMessage('');
    setProgress(0);
    const r = await ai.service.initializeOnDevice((p) => setProgress(p));
    setMessage(r.message);
    setBusy(false);
    refresh();
  }

  const label = availability ? LABELS[availability] : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {label ? <Badge tone={label.tone}>{label.text}</Badge> : <Badge>Checking…</Badge>}
        <button type="button" className="text-xs text-indigo-700 hover:underline" onClick={refresh}>
          Re-check
        </button>
      </div>
      {availability === 'api_missing' && (
        <p className="text-xs text-slate-600">
          On-device inference needs desktop Chrome 139+ with <code>chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</code> enabled (then restart Chrome).
          Until then, tasks either ask before using the cloud model or wait, depending on your privacy setting.
        </p>
      )}
      {ai ? (
        <Button onClick={init} disabled={busy || availability === 'api_missing' || availability === 'unavailable'}>
          {busy ? 'Initialising…' : 'Initialise on-device model'}
        </Button>
      ) : (
        <p className="text-xs text-slate-600">Firebase AI Logic is not configured for this build, so no model can be initialised. Tracking still works.</p>
      )}
      {progress !== null && busy && <Progress value={progress} label="Model download progress" />}
      {message && <p className="text-xs text-slate-600">{message}</p>}
    </div>
  );
}
