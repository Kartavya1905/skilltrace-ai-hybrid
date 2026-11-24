import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../lib/app-context';
import {
  ackSessions,
  extensionStatus,
  getExtensionId,
  pullSessions,
  setExtensionId,
  type ExtensionStatus,
} from '../lib/extension';
import { saveSession, trackingOptions, withSpokenText } from '../lib/actions';
import { reconstructSession } from '@skilltrace/tracking-engine';
import type { LearningSource } from '@skilltrace/shared';
import { Badge, Button, Field, inputCls } from './ui';

/** Connect to the extension, show its status, and import finished sessions. */
export function ExtensionPanel({ compact = false }: { compact?: boolean }) {
  const { store, prefs, data, ai } = useApp();
  const [id, setId] = useState(getExtensionId());
  const [status, setStatus] = useState<ExtensionStatus | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    try {
      setStatus(await extensionStatus());
    } catch (e) {
      setStatus(null);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (id) void refresh();
  }, [id, refresh]);

  async function sync() {
    if (!store) return;
    setMessage('');
    try {
      const sessions = await pullSessions();
      let rejected = 0;
      let transcribed = 0;
      for (const s of sessions) {
        const result = reconstructSession(
          s.meta,
          s.events,
          trackingOptions(prefs, data, s.meta.pageId),
        );
        // Speech-based detection: transcribe the clips once (on-device first), keep only text.
        let meta = s.meta;
        let speech: LearningSource['speech'];
        if (s.speech.length && ai) {
          const t = await ai.transcribeSpeech(s.speech);
          if (t.ok && t.output.transcript.trim()) {
            meta = { ...meta, excerpt: withSpokenText(meta.excerpt, t.output.transcript) };
            speech = {
              source: t.source,
              model: t.model,
              clips: s.speech.length,
              durationMs: t.durationMs,
              at: t.timestamp,
            };
            transcribed++;
          }
        }
        await saveSession(store, meta, result, s.events, 'auto_recorded', { speech });
        rejected += s.rejected;
      }
      await ackSessions(sessions.map((s) => s.meta.sessionId));
      setMessage(
        `Imported ${sessions.length} session(s)` +
          (transcribed ? `, ${transcribed} with speech transcribed` : '') +
          (rejected ? `, rejected ${rejected} invalid event(s)` : '') +
          '.',
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      {!compact && (
        <p className="text-slate-600">
          The extension stores events locally (IndexedDB) and only hands them to this dashboard when
          you sync. Messages are accepted only from the dashboard origins listed in its manifest.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Field
          label="Extension ID"
          hint="Shown in the extension popup. Opening the dashboard from the popup fills it in automatically."
        >
          <input
            className={`${inputCls} w-80 font-mono`}
            value={id}
            onChange={(e) => setId(e.target.value.trim())}
            placeholder="32 letters a–p"
          />
        </Field>
        <Button
          variant="secondary"
          onClick={() => {
            try {
              setExtensionId(id);
              void refresh();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Connect
        </Button>
      </div>
      {status ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="green">Connected v{status.version}</Badge>
          <Badge tone={status.trackingEnabled && !status.paused ? 'green' : 'slate'}>
            Extension tracking {status.trackingEnabled ? (status.paused ? 'paused' : 'on') : 'off'}
          </Badge>
          <Badge>{status.origins.length} approved site(s)</Badge>
          <Badge tone={status.pendingSessions ? 'amber' : 'slate'}>
            {status.pendingSessions} session(s) waiting
          </Badge>
          <Button onClick={sync} disabled={!status.pendingSessions}>
            Sync sessions
          </Button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          {error || 'Not connected. See docs/deployment.md for loading the unpacked extension.'}
        </p>
      )}
      {status && status.origins.length > 0 && !compact && (
        <ul className="text-xs text-slate-600">
          {status.origins.map((o) => (
            <li key={o}>• {o}</li>
          ))}
        </ul>
      )}
      {message && <p className="text-xs text-emerald-700">{message}</p>}
      {error && status && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
