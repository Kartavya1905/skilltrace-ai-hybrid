/**
 * First-party Learning Lab session lifecycle.
 * Every event is written to IndexedDB *before* it is applied, so a refresh or crash loses at most
 * the time since the last checkpoint. Unfinished sessions are reconstructed from their event log
 * on the next visit (see recoverLabSessions).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LearningEvent, SessionMeta } from '@skilltrace/shared';
import { randomId } from '@skilltrace/shared';
import {
  TrackedSession,
  reconstructSession,
  type CheckRequest,
  type SessionResult,
  type TrackingOptions,
} from '@skilltrace/tracking-engine';
import { openKV } from './idb';
import { saveSession } from './actions';
import type { DataStore } from './store';

const labKV = openKV('skilltrace-lab', ['meta', 'events']);

interface StoredMeta {
  meta: SessionMeta;
}

export async function recoverLabSessions(store: DataStore, opts: TrackingOptions): Promise<number> {
  const metas = await labKV.getAll<StoredMeta>('meta');
  const events = await labKV.getAll<LearningEvent>('events');
  let n = 0;
  const staleBefore = Date.now() - 60_000; // leave sessions that may still be live in another tab
  for (const { meta } of metas) {
    const own = events.filter((e) => e.sessionId === meta.sessionId);
    const lastT = own.reduce((m, e) => Math.max(m, e.t), meta.startedAt);
    if (lastT > staleBefore) continue;
    // Same id as the live save would use, so a later save of the same session is idempotent.
    if (await finalizeSession(store, meta, own, opts)) n++;
  }
  return n;
}

export interface LabSessionApi {
  session: TrackedSession | null;
  summary: SessionResult | null;
  check: CheckRequest | null;
  lastResolution: { outcome: 'responded' | 'missed'; at: number } | null;
  pageResetNotice: boolean;
  respond: (correct?: boolean) => void;
  requestCheck: () => void;
  finish: () => Promise<SessionResult | null>;
  /** True after finish(): nothing is recorded until restart(). */
  stopped: boolean;
  restart: () => void;
}

/**
 * Create and drive a TrackedSession for one Learning Lab page.
 * `enabled` must reflect the learner's opt-in: nothing is recorded while it is false.
 */
export function useLabSession(
  buildMeta: (sessionId: string) => SessionMeta | null,
  opts: TrackingOptions,
  store: DataStore | null,
  enabled: boolean,
  onCheckResolved?: (check: CheckRequest, outcome: 'responded' | 'missed') => void,
): LabSessionApi {
  const [session, setSession] = useState<TrackedSession | null>(null);
  const [summary, setSummary] = useState<SessionResult | null>(null);
  const [check, setCheck] = useState<CheckRequest | null>(null);
  const [lastResolution, setLastResolution] = useState<LabSessionApi['lastResolution']>(null);
  const [pageResetNotice, setPageResetNotice] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [stopped, setStopped] = useState(false);
  const eventsRef = useRef<LearningEvent[]>([]);
  const finishedRef = useRef(false);
  const checkRef = useRef<CheckRequest | null>(null);
  const resolvedCb = useRef(onCheckResolved);
  resolvedCb.current = onCheckResolved;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const buildRef = useRef(buildMeta);
  buildRef.current = buildMeta;

  useEffect(() => {
    if (!enabled || !store || stopped) return;
    const meta = buildRef.current(randomId('lab'));
    if (!meta) return;
    finishedRef.current = false;
    eventsRef.current = [];
    // Only plain data is persisted (options contain RNG functions and are rebuilt on recovery).
    void labKV.put('meta', meta.sessionId, { meta });
    const s = new TrackedSession(meta, optsRef.current, {
      persist: (e) => {
        eventsRef.current.push(e);
        void labKV.put('events', e.id, e);
      },
      onCheck: (c) => {
        checkRef.current = c;
        setCheck(c);
      },
      onCheckResolved: (id, outcome) => {
        const c = checkRef.current;
        checkRef.current = null;
        setCheck(null);
        setLastResolution({ outcome, at: Date.now() });
        if (c && c.checkId === id) resolvedCb.current?.(c, outcome);
      },
      onPageReset: () => setPageResetNotice(true),
    });
    setSession(s);
    const timer = setInterval(() => {
      s.tick();
      setSummary(s.summary());
    }, 1000);
    // No pagehide handler is needed: every event is already in IndexedDB and
    // recoverLabSessions() rebuilds the summary on the next visit.
    return () => {
      clearInterval(timer);
      if (!finishedRef.current)
        void finalizeSession(store, meta, eventsRef.current, optsRef.current);
      setSession(null);
    };
  }, [enabled, store, nonce, stopped]);

  const respond = useCallback(
    (correct?: boolean) => {
      if (session && checkRef.current) session.respond(checkRef.current.checkId, correct);
    },
    [session],
  );

  const finish = useCallback(async () => {
    if (!session || !store) return null;
    finishedRef.current = true;
    const result = await finalizeSession(store, session.meta, eventsRef.current, optsRef.current);
    setStopped(true); // tracking stays off until the learner explicitly starts a new session
    setSummary(null);
    return result;
  }, [session, store]);

  return {
    session,
    summary,
    check,
    lastResolution,
    pageResetNotice,
    respond,
    requestCheck: () => {
      session?.requestCheck();
    },
    finish,
    stopped,
    restart: () => {
      setStopped(false);
      setNonce((n) => n + 1);
    },
  };
}

/** Sessions shorter than this with no credited time are noise (e.g. page opened then left). */
const MIN_RAW_MS = 5_000;

async function discard(meta: SessionMeta, events: LearningEvent[]) {
  await labKV.delete('meta', meta.sessionId);
  for (const e of events) await labKV.delete('events', e.id);
}

async function finalizeSession(
  store: DataStore,
  meta: SessionMeta,
  events: LearningEvent[],
  opts: TrackingOptions,
): Promise<SessionResult | null> {
  if (events.length < 2) {
    await discard(meta, events);
    return null;
  }
  const result = reconstructSession(meta, events, opts);
  if (result.eligibleMs === 0 && result.rawMs < MIN_RAW_MS) {
    await discard(meta, events);
    return null;
  }
  await saveSession(store, meta, result, events);
  await labKV.delete('meta', meta.sessionId);
  for (const e of events) await labKV.delete('events', e.id);
  return result;
}
