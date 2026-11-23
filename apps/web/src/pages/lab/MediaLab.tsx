import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { pageIdFromUrl, type SessionMeta } from '@skilltrace/shared';
import type { CheckRequest, SessionResult } from '@skilltrace/tracking-engine';
import { bindMediaElement } from '@skilltrace/tracking-engine/dom';
import { useApp } from '../../lib/app-context';
import { useLabSession } from '../../lib/lab-session';
import { saveEngagementCheck, trackingOptions } from '../../lib/actions';
import { AUDIO_LESSON, VIDEO_LESSON } from '../../content/lessons';
import scripts from '../../content/media-scripts.json';
import { Button, Card, PageHeader } from '../../components/ui';
import { EngagementPrompt } from '../../components/EngagementPrompt';
import { CoverageStrip, LiveStats } from './LiveStats';
import { TrackingGate } from './LabHome';

export default function MediaLab({ kind }: { kind: 'video' | 'audio' }) {
  const lesson = kind === 'video' ? VIDEO_LESSON : AUDIO_LESSON;
  const script = kind === 'video' ? scripts['python-functions'] : scripts['sql-select'];
  const { prefs, data, store, ai } = useApp();
  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const [mediaError, setMediaError] = useState('');
  const [finished, setFinished] = useState<SessionResult | 'discarded' | null>(null);
  const pageUrl = `${location.origin}/lab/${kind}/${lesson.slug}`;
  const pageId = pageIdFromUrl(pageUrl);
  const opts = useMemo(() => trackingOptions(prefs, data, pageId), [prefs, data, pageId]);
  const transcript = useMemo(() => script.slides.flatMap((s) => s.narration).join(' '), [script]);

  const buildMeta = useCallback(
    (sessionId: string): SessionMeta => ({
      sessionId,
      pageId,
      origin: location.origin,
      url: pageUrl,
      title: lesson.title,
      contentType: kind,
      wordCount: 0,
      durationSec: mediaRef.current && Number.isFinite(mediaRef.current.duration) ? mediaRef.current.duration : 0,
      // Permitted excerpt: the lesson's own transcript (first-party content).
      excerpt: `${lesson.description}\n${transcript}`.slice(0, 1500),
      sections: [],
      startedAt: Date.now(),
      device: 'learning_lab',
    }),
    [pageId, pageUrl, lesson, kind, transcript],
  );

  const onResolved = useCallback(
    (c: CheckRequest, outcome: 'responded' | 'missed') => {
      if (outcome === 'missed') mediaRef.current?.pause(); // stop crediting; resuming starts a new window
      if (!store) return;
      void saveEngagementCheck(store, {
        checkId: c.checkId,
        sessionId: c.checkId.split('_chk')[0]!,
        pageId,
        kind: 'video_presence',
        trigger: c.trigger,
        issuedAt: c.issuedAt,
        outcome,
        answerCorrect: null,
        question: 'Are you still watching?',
      });
    },
    [store, pageId],
  );

  const tracking = prefs.trackingEnabled && !prefs.trackingPaused;
  const lab = useLabSession(buildMeta, opts, store, tracking, onResolved);

  useEffect(() => {
    if (!lab.session || !mediaRef.current) return;
    return bindMediaElement(mediaRef.current, lab.session);
  }, [lab.session]);

  const duration = mediaRef.current?.duration ?? 0;
  const ranges = lab.session?.coveredRanges ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <PageHeader title={lesson.title} subtitle={`${kind === 'video' ? 'Video' : 'Audio'} lesson · first-party Learning Lab · original content generated for this project`} />
        <TrackingGate />
        <Card>
          {kind === 'video' ? (
            <video ref={mediaRef} controls preload="metadata" className="aspect-video w-full rounded-lg bg-black" onError={() => setMediaError('missing')} crossOrigin="anonymous">
              <source src={lesson.src} type="video/webm" />
              <track kind="captions" src={lesson.captions} srcLang="en" label="English" default />
            </video>
          ) : (
            <div>
              <div className="mb-3 rounded-lg bg-gradient-to-r from-indigo-600 to-sky-500 p-6 text-white">
                <div className="text-xs uppercase tracking-wide opacity-80">Audio lesson</div>
                <div className="text-lg font-semibold">{lesson.title}</div>
              </div>
              <audio ref={mediaRef} controls preload="metadata" className="w-full" onError={() => setMediaError('missing')}>
                <source src={lesson.src} type="audio/webm" />
              </audio>
            </div>
          )}
          {mediaError && (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              The lesson media could not be loaded. Generate it with <code>pnpm media:generate</code> (see docs/deployment.md).
            </p>
          )}
          <div className="mt-4 space-y-1">
            <div className="text-xs text-slate-500">Unique coverage (green = played at least once)</div>
            <CoverageStrip ranges={ranges} duration={Number.isFinite(duration) ? duration : 0} />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Try it: watch a minute, rewind 30 seconds and watch again (active and revision time grow, coverage does not), skip ahead (skipped content is not counted),
            or play at 2× (credit uses real elapsed time).{' '}
            {kind === 'video'
              ? `Video playback in a hidden tab is ${prefs.creditHiddenVideo ? 'credited' : 'not credited'} (Settings).`
              : 'Audio keeps counting in a background tab.'}
          </p>
        </Card>
        <Card title="Transcript" className="mt-4">
          <div className="space-y-3 text-sm text-slate-700">
            {script.slides.map((s) => (
              <div key={s.heading}>
                <div className="font-medium text-slate-900">{s.heading}</div>
                <p>{s.narration.join(' ')}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card title="This session">
          <LiveStats summary={lab.summary} kind={kind} />
          {kind === 'video' && (
            <p className="mt-3 text-xs text-slate-500">
              Presence checks every {prefs.demoMode ? '20–45 seconds (DEMO mode)' : '5–90 minutes'} of playback; {Math.round(30 * prefs.responseWindowMultiplier)} s to respond.
            </p>
          )}
          <div className="mt-4">
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
                  mediaRef.current?.pause();
                  setFinished((await lab.finish()) ?? 'discarded');
                }}
              >
                Finish session
              </Button>
            )}
          </div>
        </Card>
        {finished === 'discarded' && (
          <Card title="Not saved">
            <p className="text-sm text-slate-700">The session was too short to record (under 5 seconds with no credited time).</p>
          </Card>
        )}
        {finished && finished !== 'discarded' && (
          <Card title="Saved">
            <p className="text-sm text-slate-700">
              Saved. Skill detection {ai ? 'is running through Firebase AI Logic' : 'is queued until AI is configured'}. See <Link className="text-indigo-700 underline" to="/app/sessions">Sessions</Link>.
            </p>
          </Card>
        )}
      </aside>
      <EngagementPrompt check={lab.check} onRespond={() => lab.respond()} />
    </div>
  );
}
