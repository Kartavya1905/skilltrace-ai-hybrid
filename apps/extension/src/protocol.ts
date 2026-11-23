/** Messages between content script, popup, background service worker and the dashboard. */
import type { LearningEvent, SessionMeta } from '@skilltrace/shared';

export interface ExtensionSettings {
  trackingEnabled: boolean; // opt-in, default false
  paused: boolean;
  demoMode: boolean;
  responseWindowMultiplier: number;
  readingWpm: number;
  creditHiddenVideo: boolean;
  origins: string[]; // approved origins, e.g. "https://docs.python.org"
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  trackingEnabled: false,
  paused: false,
  demoMode: false,
  responseWindowMultiplier: 1,
  readingWpm: 238,
  creditHiddenVideo: false,
  origins: [],
};

/** content/popup -> background */
export type InternalMessage =
  | { type: 'getSettings' }
  | { type: 'meta'; meta: SessionMeta }
  | { type: 'events'; events: LearningEvent[] }
  | { type: 'closeSession'; sessionId: string }
  | { type: 'addOrigin'; origin: string }
  | { type: 'removeOrigin'; origin: string }
  | { type: 'updateSettings'; patch: Partial<ExtensionSettings> }
  | { type: 'pendingCount' };

/** dashboard -> background (externally_connectable) */
export type ExternalMessage =
  | { type: 'skilltrace.status' }
  | { type: 'skilltrace.pull' }
  | { type: 'skilltrace.ack'; sessionIds: string[] }
  | { type: 'skilltrace.setPaused'; paused: boolean };

export interface StoredSession {
  meta: SessionMeta;
  /** Tab that produced the session; closing or navigating the tab ends it. */
  tabId: number;
  lastEventAt: number;
  closed: boolean;
}

/** Sessions idle this long are treated as finished and offered to the dashboard. */
export const SESSION_IDLE_MS = 2 * 60_000;

export function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(u.hostname)) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Match pattern for an origin, e.g. "https://docs.python.org/*" (ports are not part of match patterns). */
export function matchPattern(origin: string): string {
  const u = new URL(origin);
  return `${u.protocol}//${u.hostname}/*`;
}
