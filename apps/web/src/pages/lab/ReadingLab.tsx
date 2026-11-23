import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { pageIdFromUrl, type SessionMeta } from '@skilltrace/shared';
import { countWords, type CheckRequest, type SessionResult } from '@skilltrace/tracking-engine';
import { bindReading } from '@skilltrace/tracking-engine/dom';
import { questionPrompt, type EngagementQuestion } from '@skilltrace/ai-engine';
import { useApp } from '../../lib/app-context';
import { useLabSession } from '../../lib/lab-session';
import { saveEngagementCheck, trackingOptions } from '../../lib/actions';
import { PYTHON_FUNCTIONS_LESSON as LESSON, lessonText } from '../../content/lessons';
import { Button, Card, PageHeader } from '../../components/ui';
import { EngagementPrompt, type QuestionContent } from '../../components/EngagementPrompt';
import { LiveStats } from './LiveStats';
import { TrackingGate } from './LabHome';

const PAGE_URL = `${location.origin}/lab/reading/${LESSON.slug}`;

export default function ReadingLab() {
  const { prefs, data, store, ai } = useApp();
  const articleRef = useRef<HTMLElement>(null);
  const [question, setQuestion] = useState<QuestionContent | null>(null);
  const [finished, setFinished] = useState<SessionResult | 'discarded' | null>(null);
  const pageId = pageIdFromUrl(PAGE_URL);
  const opts = useMemo(() => trackingOptions(prefs, data, pageId), [prefs, data, pageId]);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const text = useMemo(() => lessonText(LESSON), []);

  const buildMeta = useCallback(
    (sessionId: string): SessionMeta => ({
      sessionId,
      pageId,
      origin: location.origin,
      url: PAGE_URL,
      title: LESSON.title,
      contentType: 'reading',
      wordCount: countWords(text),
      durationSec: 0,
      excerpt: text.slice(0, 1500),
      sections: LESSON.sections.map((s) => ({
        id: s.id,
        heading: s.heading,
        words: countWords([s.heading, ...s.paragraphs, s.code ?? ''].join(' ')),
      })),
      startedAt: Date.now(),
      device: 'learning_lab',
    }),
    [pageId, text],
  );

  const questionRef = useRef<QuestionContent | null>(null);
  questionRef.current = question;
  const answerRef = useRef<boolean | null>(null);

  const onResolved = useCallback(
    (c: CheckRequest, outcome: 'responded' | 'missed') => {
      if (!store) return;
      void saveEngagementCheck(store, {
        checkId: c.checkId,
        sessionId: c.checkId.split('_chk')[0]!,
        pageId,
        kind: 'reading_question',
        trigger: c.trigger,
        issuedAt: c.issuedAt,
        outcome,
        answerCorrect: outcome === 'responded' ? answerRef.current : null,
        question: questionRef.current?.question ?? '',
      });
      answerRef.current = null;
    },
    [store, pageId],
  );

  const tracking = prefs.trackingEnabled && !prefs.trackingPaused;
  const lab = useLabSession(buildMeta, opts, store, tracking, onResolved);

  useEffect(() => {
    if (!lab.session || !articleRef.current) return;
    const sections = Array.from(articleRef.current.querySelectorAll('[data-section-id]'));
    const sectionWords = Object.fromEntries(lab.session.meta.sections.map((s) => [s.id, s.words]));
    return bindReading(lab.session, { sections, sectionWords, wpm: optsRef.current.readingWpm });
  }, [lab.session]);

  // When a check opens, pick a question for the current section. AI questions are generated
  // ON-DEVICE ONLY (lesson text never leaves the device for this); otherwise the author's question.
  useEffect(() => {
    if (!lab.check) return;
    const sectionId = lab.session?.currentSectionId ?? LESSON.sections[0]!.id;
    const section = LESSON.sections.find((s) => s.id === sectionId) ?? LESSON.sections[0]!;
    setQuestion({ ...section.question, source: 'author' });
    if (!ai) return;
    let cancelled = false;
    void ai.service
      .runWithMode<EngagementQuestion>(
        'question',
        'only_on_device',
        questionPrompt({
          skill: 'Python',
          sectionHeading: section.heading,
          sectionText: section.paragraphs.join('\n'),
        }),
      )
      .then((r) => {
        if (!cancelled && r.ok && r.output.correctIndex < r.output.options.length)
          setQuestion({ ...r.output, source: r.source });
      });
    return () => {
      cancelled = true;
    };
  }, [lab.check, ai, lab.session]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <PageHeader title={LESSON.title} subtitle="Reading lesson · first-party Learning Lab" />
        <TrackingGate />
        {lab.pageResetNotice && (
          <div
            role="alert"
            className="mb-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200"
          >
            Five questions in a row were missed, so credited time for{' '}
            <strong>this page only</strong> was reset. Your raw activity log is kept, other pages
            and skills are unchanged, and you can review or dispute the checks on the{' '}
            <Link to="/app/engagement" className="underline">
              Engagement checks
            </Link>{' '}
            page.
          </div>
        )}
        <article
          ref={articleRef}
          className="space-y-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-10"
        >
          {LESSON.sections.map((s) => (
            <section key={s.id} data-section-id={s.id} aria-labelledby={`h-${s.id}`}>
              <h2 id={`h-${s.id}`} className="text-xl font-semibold text-slate-900">
                {s.heading}
              </h2>
              {s.paragraphs.map((p) => (
                <p key={p.slice(0, 30)} className="mt-3 leading-7 text-slate-700">
                  {p}
                </p>
              ))}
              {s.code && (
                <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-sm text-slate-100">
                  {s.code}
                </pre>
              )}
            </section>
          ))}
        </article>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card title="This session">
          <LiveStats summary={lab.summary} kind="reading" />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!lab.session || !!lab.check}
              onClick={lab.requestCheck}
            >
              Check my understanding
            </Button>
            {lab.stopped ? (
              <Button
                onClick={() => {
                  setFinished(null);
                  lab.restart();
                }}
              >
                Start a new session
              </Button>
            ) : (
              <Button
                disabled={!lab.session}
                onClick={async () => {
                  setFinished((await lab.finish()) ?? 'discarded');
                }}
              >
                Finish session
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Estimated pace: {opts.readingWpm} wpm (
            {opts.readingWpm === prefs.readingBaselineWpm
              ? 'baseline reference'
              : 'personalised from your credible sessions'}
            ).
          </p>
        </Card>
        {finished === 'discarded' && (
          <Card title="Not saved">
            <p className="text-sm text-slate-700">
              The session was too short to record (under 5 seconds with no credited time).
            </p>
          </Card>
        )}
        {finished && finished !== 'discarded' && (
          <Card title="Saved">
            <p className="text-sm text-slate-700">
              Session saved. Skill detection runs{' '}
              {ai ? 'now through Firebase AI Logic' : 'once AI is configured (queued)'}. See{' '}
              <Link className="text-indigo-700 underline" to="/app/sessions">
                Sessions
              </Link>
              .
            </p>
          </Card>
        )}
      </aside>
      <EngagementPrompt
        check={lab.check}
        question={question}
        onRespond={(correct) => {
          answerRef.current = correct ?? null;
          lab.respond(correct);
        }}
      />
    </div>
  );
}
