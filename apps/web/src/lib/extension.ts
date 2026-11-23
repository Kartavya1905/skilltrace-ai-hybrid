/**
 * Dashboard <-> extension sync over Chrome's externally_connectable messaging.
 * Only origins listed in the extension manifest can send messages, and Chrome tells the extension
 * the verified sender origin. The dashboard PULLS finished sessions, validates every event with zod,
 * reconstructs totals with the same tracking engine, stores them (idempotent ids), then ACKs.
 */
import { SessionMetaSchema, validateEvents, type LearningEvent, type SessionMeta } from '@skilltrace/shared';

export const EXTENSION_ID_KEY = 'skilltrace:extension-id';

interface ChromeRuntime {
  sendMessage: (extensionId: string, message: unknown, callback: (response: unknown) => void) => void;
  lastError?: { message?: string };
}

function runtime(): ChromeRuntime | null {
  const c = (globalThis as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome;
  return c?.runtime?.sendMessage ? c.runtime : null;
}

export function getExtensionId(): string {
  const fromUrl = new URLSearchParams(location.search).get('ext');
  if (fromUrl && /^[a-p]{32}$/.test(fromUrl)) localStorage.setItem(EXTENSION_ID_KEY, fromUrl);
  return localStorage.getItem(EXTENSION_ID_KEY) ?? import.meta.env.VITE_EXTENSION_ID ?? '';
}

export function setExtensionId(id: string) {
  if (id && !/^[a-p]{32}$/.test(id)) throw new Error('A Chrome extension ID is 32 letters a-p.');
  localStorage.setItem(EXTENSION_ID_KEY, id);
}

function send<T>(message: unknown, timeoutMs = 4000): Promise<T> {
  const rt = runtime();
  const id = getExtensionId();
  if (!rt || !id) return Promise.reject(new Error('Extension not reachable. Install it and open the dashboard from its popup.'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Extension did not respond.')), timeoutMs);
    rt.sendMessage(id, message, (response) => {
      clearTimeout(timer);
      if (rt.lastError) reject(new Error(rt.lastError.message ?? 'Extension error'));
      else resolve(response as T);
    });
  });
}

export interface ExtensionStatus {
  version: string;
  trackingEnabled: boolean;
  paused: boolean;
  origins: string[];
  pendingSessions: number;
}

export async function extensionStatus(): Promise<ExtensionStatus> {
  return send<ExtensionStatus>({ type: 'skilltrace.status' });
}

export interface PulledSession {
  meta: SessionMeta;
  events: LearningEvent[];
  rejected: number;
}

export async function pullSessions(): Promise<PulledSession[]> {
  const res = await send<{ sessions?: { meta: unknown; events: unknown[] }[] }>({ type: 'skilltrace.pull' }, 10_000);
  const out: PulledSession[] = [];
  for (const s of res.sessions ?? []) {
    const meta = SessionMetaSchema.safeParse(s.meta);
    if (!meta.success || !Array.isArray(s.events)) continue;
    const { accepted, rejected } = validateEvents(s.events);
    out.push({ meta: meta.data, events: accepted.filter((e) => e.sessionId === meta.data.sessionId), rejected });
  }
  return out;
}

export async function ackSessions(sessionIds: string[]): Promise<void> {
  await send({ type: 'skilltrace.ack', sessionIds });
}

export async function setExtensionPaused(paused: boolean): Promise<void> {
  await send({ type: 'skilltrace.setPaused', paused });
}
