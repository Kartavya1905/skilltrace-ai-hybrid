import { useState } from 'react';
import { deleteUser } from 'firebase/auth';
import { PRIVATE_COLLECTIONS, touch, type Preferences } from '@skilltrace/shared';
import { useApp } from '../../lib/app-context';
import { getFirebase } from '../../lib/firebase';
import { deleteLearningHistory, exportAllData } from '../../lib/actions';
import { loadSampleData, removeSampleData } from '../../lib/sample';
import { setExtensionPaused } from '../../lib/extension';
import { Button, Card, Field, Modal, PageHeader, Toggle, inputCls } from '../../components/ui';
import { ExtensionPanel } from '../../components/ExtensionPanel';

export default function Settings() {
  const { prefs, store, data, share, user, signOut } = useApp();
  const [confirm, setConfirm] = useState<'history' | 'account' | null>(null);
  const [message, setMessage] = useState('');

  const save = (patch: Partial<Preferences>) => store?.put('preferences', touch({ ...prefs, ...patch }));
  const hasSample = Object.values(data).some((rows) => (rows as { provenance?: string }[]).some((r) => r.provenance === 'sample_data'));

  async function download() {
    if (!store) return;
    const blob = await exportAllData(store, data);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `skilltrace-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function deleteAccount() {
    if (!store) return;
    try {
      if (share.enabled) await store.unpublishPassport(share.shareId);
      for (const c of PRIVATE_COLLECTIONS) await store.clear(c);
      const fb = getFirebase();
      if (fb?.auth.currentUser && !user?.isLocal) await deleteUser(fb.auth.currentUser);
      await signOut();
    } catch (e) {
      setMessage(`${(e as Error).message}. For security, Firebase may require you to sign in again before deleting the account; your data has been deleted.`);
    }
    setConfirm(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Privacy & Settings" subtitle="Privacy is a feature: you decide what is recorded, what may leave this device, and what becomes public." />
      {message && <p className="text-sm text-amber-800">{message}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Tracking">
          <div className="divide-y divide-slate-100">
            <Toggle checked={prefs.trackingEnabled} onChange={(v) => save({ trackingEnabled: v })} label="Learning activity tracking" description="Opt-in. Off means nothing is recorded anywhere." />
            <Toggle
              checked={prefs.trackingPaused}
              onChange={(v) => {
                void save({ trackingPaused: v });
                void setExtensionPaused(v).catch(() => undefined);
              }}
              label="Pause tracking"
              description="Temporarily stop recording in the Learning Lab and the extension."
            />
            <Toggle checked={prefs.creditHiddenVideo} onChange={(v) => save({ creditHiddenVideo: v })} label="Credit video in hidden tabs" description="Off by default: background video is recorded raw but not credited. Audio is always credited." />
            <Toggle checked={prefs.demoMode} onChange={(v) => save({ demoMode: v })} label="DEMO mode" description="Shortens verification intervals to 20–45 s for demonstrations. Production defaults (5–90 min) are unchanged." />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Response window (accessibility)" hint="Multiplies the 30 s video / 60 s reading windows.">
              <select className={inputCls} value={prefs.responseWindowMultiplier} onChange={(e) => save({ responseWindowMultiplier: Number(e.target.value) })}>
                <option value={1}>Standard</option>
                <option value={2}>2× longer</option>
                <option value={4}>4× longer</option>
              </select>
            </Field>
            <Field label="Reading baseline (wpm)" hint="Starting reference before personalisation.">
              <input type="number" min={80} max={600} className={inputCls} value={prefs.readingBaselineWpm} onChange={(e) => save({ readingBaselineWpm: Math.min(600, Math.max(80, Number(e.target.value) || 238)) })} />
            </Field>
          </div>
        </Card>
        <Card title="AI and data leaving this device">
          <fieldset>
            <legend className="text-sm font-medium">When on-device AI is unavailable</legend>
            {(
              [
                ['ask', 'Ask me each time'],
                ['allow', 'Allow automatic cloud fallback (Firebase AI Logic PREFER_ON_DEVICE)'],
                ['deny', 'Never use the cloud'],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className="mt-2 flex items-center gap-2 text-sm">
                <input type="radio" name="consent" checked={prefs.cloudAIConsent === v} onChange={() => save({ cloudAIConsent: v })} /> {l}
              </label>
            ))}
          </fieldset>
          <Toggle checked={prefs.allowCloudExcerpts} onChange={(v) => save({ allowCloudExcerpts: v })} label="Include short excerpts in cloud requests" description="Off: cloud requests contain titles only. On-device requests may use the full excerpt." />
        </Card>
      </div>
      <Card title="Websites (Chrome extension)">
        <ExtensionPanel />
        <p className="mt-2 text-xs text-slate-500">Approve or remove individual sites from the extension popup. The Learning Lab on this dashboard is first-party and always allowed when tracking is on.</p>
      </Card>
      <Card title="Your data">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={download}>
            Export all my data (JSON)
          </Button>
          {hasSample ? (
            <Button variant="secondary" onClick={() => store && removeSampleData(store, data)}>
              Remove sample data
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => store && loadSampleData(store)}>
              Load labelled sample data
            </Button>
          )}
          {share.enabled && (
            <Button
              variant="secondary"
              onClick={async () => {
                if (!store) return;
                await store.unpublishPassport(share.shareId);
                await store.put('public_share_settings', touch({ ...share, enabled: false }));
              }}
            >
              Disable public profile sharing
            </Button>
          )}
          {data.github_connections[0] && (
            <Button variant="secondary" onClick={() => store?.remove('github_connections', data.github_connections[0]!.id)}>
              Disconnect GitHub
            </Button>
          )}
          <Button variant="danger" onClick={() => setConfirm('history')}>
            Delete learning history
          </Button>
          <Button variant="danger" onClick={() => setConfirm('account')}>
            Delete account
          </Button>
        </div>
      </Card>
      <Modal open={confirm === 'history'} title="Delete all learning history?" onClose={() => setConfirm(null)}>
        <p className="text-sm text-slate-700">This permanently deletes every learning session, raw event, reading metric, engagement check, detected skill and inference log. Projects and assessments are kept. This cannot be undone.</p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="danger"
            onClick={async () => {
              if (store) await deleteLearningHistory(store);
              setConfirm(null);
            }}
          >
            Delete permanently
          </Button>
          <Button variant="secondary" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
        </div>
      </Modal>
      <Modal open={confirm === 'account'} title="Delete your account?" onClose={() => setConfirm(null)}>
        <p className="text-sm text-slate-700">This permanently deletes all your SkillTrace data, revokes your public passport, and deletes your sign-in account. This cannot be undone.</p>
        <div className="mt-4 flex gap-2">
          <Button variant="danger" onClick={deleteAccount}>
            Delete account permanently
          </Button>
          <Button variant="secondary" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
