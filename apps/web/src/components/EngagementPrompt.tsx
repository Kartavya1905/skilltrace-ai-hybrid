import { useEffect, useState } from 'react';
import type { CheckRequest } from '@skilltrace/tracking-engine';
import { Button, Modal } from './ui';

export interface QuestionContent {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  source: string; // 'author' | 'on_device' | 'in_cloud'
}

const TRIGGER_TEXT: Record<string, string> = {
  rapid_scroll: 'You scrolled through this section quickly.',
  inactivity: 'There has been no activity for a while.',
  implausible_progress: 'Progress is running ahead of the time recorded.',
  random: 'Routine randomised check.',
  user_requested: 'You asked for a knowledge check.',
  scheduled: 'Routine randomised check.',
};

/**
 * Accessible engagement check. Video checks are a single "I'm here" confirmation; reading checks
 * show a short question. Answering incorrectly has NO time penalty; only not responding counts.
 */
export function EngagementPrompt({
  check,
  question,
  onRespond,
}: {
  check: CheckRequest | null;
  question?: QuestionContent | null;
  onRespond: (correct?: boolean) => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    setPicked(null);
    if (!check) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [check]);
  if (!check) return null;
  const left = Math.max(0, Math.ceil((check.expiresAt - now) / 1000));
  const isReading = check.kind === 'reading_question' && question;
  return (
    <Modal open title={isReading ? 'Quick check-in' : 'Are you still watching?'}>
      <p className="text-sm text-slate-600">
        {TRIGGER_TEXT[check.trigger] ?? 'Routine check.'} Eligible time is paused until you respond.{' '}
        <span aria-live="polite" className="font-medium text-slate-900">
          {left}s left
        </span>
      </p>
      {isReading ? (
        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-slate-900">{question.question}</legend>
          <div className="mt-3 space-y-2">
            {question.options.map((o, i) => (
              <label
                key={o}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-slate-200 hover:bg-slate-50"
              >
                <input
                  type="radio"
                  name="eq"
                  checked={picked === i}
                  onChange={() => setPicked(i)}
                />
                {o}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            A wrong answer never removes time. Question source:{' '}
            {question.source === 'author'
              ? 'lesson author'
              : question.source === 'on_device'
                ? 'on-device AI'
                : question.source === 'in_cloud'
                  ? 'cloud AI'
                  : question.source}
            .
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              disabled={picked === null}
              onClick={() => onRespond(picked === question.correctIndex)}
            >
              Submit answer
            </Button>
            <Button variant="secondary" onClick={() => onRespond(undefined)}>
              Skip question, I'm here
            </Button>
          </div>
        </fieldset>
      ) : (
        <div className="mt-4">
          <Button onClick={() => onRespond(undefined)}>I'm here, continue</Button>
          <p className="mt-2 text-xs text-slate-500">
            Not responding within the window marks only the time since your last check as
            unverified. Earlier verified time is kept, and the raw log is preserved so you can
            review or dispute it. Longer response windows are available in Settings.
          </p>
        </div>
      )}
    </Modal>
  );
}
