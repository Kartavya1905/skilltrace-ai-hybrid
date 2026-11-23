import { useApp } from '../lib/app-context';
import { Button, Modal } from './ui';

/** Shown in "ask" mode when on-device AI is unavailable and a task would need the cloud. */
export function ConsentDialog() {
  const { consentRequest, answerConsent } = useApp();
  if (!consentRequest) return null;
  return (
    <Modal open title="Use cloud AI for this task?" onClose={() => answerConsent(false)}>
      <p className="text-sm text-slate-700">
        On-device AI is not available in this browser right now, so this task would run on Google's
        cloud model through Firebase AI Logic.
      </p>
      <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
        <div className="font-medium text-slate-900">What would leave this device</div>
        <p className="mt-1">{consentRequest.description}</p>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        You can change the default (always ask, always allow, never) in Privacy & Settings.
        Declining keeps the task pending; nothing is uploaded.
      </p>
      <div className="mt-4 flex gap-2">
        <Button onClick={() => answerConsent(true)}>Allow once</Button>
        <Button variant="secondary" onClick={() => answerConsent(false)}>
          Not now
        </Button>
      </div>
    </Modal>
  );
}
