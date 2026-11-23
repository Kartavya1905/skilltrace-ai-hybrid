import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { touch } from '@skilltrace/shared';
import { useApp } from '../lib/app-context';
import { Badge, Button, Card, Field, Toggle, inputCls } from '../components/ui';
import { OnDeviceAIPanel } from '../components/OnDeviceAIPanel';
import { ExtensionPanel } from '../components/ExtensionPanel';

const INTERESTS = [
  'Python',
  'JavaScript',
  'TypeScript',
  'SQL',
  'Machine Learning',
  'React',
  'REST APIs',
  'Data Analysis',
  'Statistics',
  'Docker',
];
const STEPS = [
  'Profile',
  'Interests',
  'Enable tracking',
  'Approve sites',
  'On-device AI',
  'Start learning',
];

export default function Onboarding() {
  const { store, profile, prefs, user } = useApp();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.displayName || user?.displayName || '');
  const [interests, setInterests] = useState<string[]>(profile.interests);
  const [career, setCareer] = useState(profile.targetCareer);
  const [tracking, setTracking] = useState(prefs.trackingEnabled);
  const [consent, setConsent] = useState(prefs.cloudAIConsent);

  async function saveAll(done = false) {
    if (!store) return;
    await store.put(
      'profile',
      touch({
        ...profile,
        displayName: name,
        interests,
        targetCareer: career,
        onboardingComplete: done || profile.onboardingComplete,
      }),
    );
    await store.put(
      'preferences',
      touch({ ...prefs, trackingEnabled: tracking, cloudAIConsent: consent }),
    );
  }

  async function next() {
    await saveAll(step === STEPS.length - 1);
    if (step === STEPS.length - 1) nav('/app/lab');
    else setStep(step + 1);
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <ol className="mb-6 flex flex-wrap gap-2" aria-label="Onboarding steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <Badge tone={i === step ? 'indigo' : i < step ? 'green' : 'slate'}>
                {i + 1}. {s}
              </Badge>
            </li>
          ))}
        </ol>
        <Card title={STEPS[step]}>
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Your account is ready. Choose the name shown on your dashboard and, only if you
                publish it, your Skill Passport.
              </p>
              <Field label="Display name">
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <fieldset>
                <legend className="text-sm font-medium text-slate-800">
                  What are you learning? (optional)
                </legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {INTERESTS.map((i) => (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={interests.includes(i)}
                      onClick={() =>
                        setInterests((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))
                      }
                      className={`rounded-full px-3 py-1 text-sm ring-1 ${interests.includes(i) ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-white text-slate-700 ring-slate-300'}`}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </fieldset>
              <Field label="Target career (optional)">
                <input
                  className={inputCls}
                  value={career}
                  onChange={(e) => setCareer(e.target.value)}
                  placeholder="e.g. Backend engineer"
                />
              </Field>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3 text-sm text-slate-700">
              <p>
                SkillTrace never tracks anything until you turn tracking on. When it is on, it
                records only on the first-party Learning Lab and on sites you approve.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-slate-600">
                <li>
                  Recorded: page title, a privacy-preserving page ID, content type, word count,
                  play/pause/seek/scroll events, and a short excerpt for skill detection.
                </li>
                <li>
                  Never recorded: keystrokes, form fields, passwords, private messages, microphone,
                  camera or screen.
                </li>
                <li>
                  You can pause tracking, disable sites, export or delete your history at any time.
                </li>
              </ul>
              <Toggle
                checked={tracking}
                onChange={setTracking}
                label="Enable learning activity tracking"
                description="Required to record sessions. You can turn it off later."
              />
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3 text-sm text-slate-700">
              <p>
                The built-in Learning Lab is first-party and works without the extension. To track
                other educational sites, install the SkillTrace Chrome extension and approve each
                site from its popup. Chrome asks you to confirm every site.
              </p>
              <ExtensionPanel compact />
            </div>
          )}
          {step === 4 && (
            <div className="space-y-4 text-sm text-slate-700">
              <p>
                Skill detection runs on Chrome's built-in model when available. Initialising may
                download the model; it needs your click.
              </p>
              <OnDeviceAIPanel />
              <fieldset>
                <legend className="font-medium text-slate-900">
                  When on-device AI is unavailable
                </legend>
                {(
                  [
                    ['ask', 'Ask me each time before using the cloud model (recommended)'],
                    ['allow', 'Allow Firebase AI Logic to fall back to the cloud automatically'],
                    [
                      'deny',
                      'Never use the cloud; keep tasks pending until on-device AI is available',
                    ],
                  ] as const
                ).map(([v, l]) => (
                  <label key={v} className="mt-2 flex items-start gap-2">
                    <input
                      type="radio"
                      name="consent"
                      checked={consent === v}
                      onChange={() => setConsent(v)}
                      className="mt-1"
                    />
                    <span>{l}</span>
                  </label>
                ))}
              </fieldset>
            </div>
          )}
          {step === 5 && (
            <div className="space-y-3 text-sm text-slate-700">
              <p>
                You're set. Start with the Learning Lab: a Python reading lesson, a video lesson you
                can rewind, an SQL audio lesson and a short assessment.
              </p>
              {!tracking && (
                <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
                  Tracking is still off, so nothing will be recorded until you enable it.
                </p>
              )}
            </div>
          )}
          <div className="mt-6 flex justify-between">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
              Back
            </Button>
            <Button onClick={next}>
              {step === STEPS.length - 1 ? 'Open the Learning Lab' : 'Continue'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
