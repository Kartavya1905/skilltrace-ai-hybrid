/**
 * SkillTrace background service worker.
 *  - Stores settings (opt-in) in chrome.storage.local and events in IndexedDB.
 *  - Registers the content script ONLY for origins the learner approved (optional host permissions).
 *  - Answers the dashboard over externally_connectable; Chrome only delivers messages from the
 *    origins in the manifest, and we re-check the sender origin here.
 */
import { LearningEventSchema, SessionMetaSchema } from '@skilltrace/shared';
import { deleteSession, eventsFor, getSessions, putEvents, putSession } from './db';
import {
  DEFAULT_SETTINGS,
  SESSION_IDLE_MS,
  matchPattern,
  type ExtensionSettings,
  type ExternalMessage,
  type InternalMessage,
} from './protocol';

const SCRIPT_ID = 'skilltrace-content';

async function getSettings(): Promise<ExtensionSettings> {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings as Partial<ExtensionSettings> | undefined) };
}

async function saveSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

/** Keep the registered content script in sync with approved + still-granted origins. */
async function syncContentScripts(): Promise<void> {
  const settings = await getSettings();
  const granted: string[] = [];
  for (const origin of settings.origins) {
    if (await chrome.permissions.contains({ origins: [matchPattern(origin)] }))
      granted.push(origin);
  }
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  if (granted.length === 0) return;
  await chrome.scripting.registerContentScripts([
    {
      id: SCRIPT_ID,
      matches: [...new Set(granted.map(matchPattern))],
      js: ['content.js'],
      runAt: 'document_idle',
      persistAcrossSessions: true,
    },
  ]);
}

async function closeTabSessions(tabId: number, keepPageId?: string) {
  for (const s of await getSessions()) {
    if (s.tabId === tabId && !s.closed && s.meta.pageId !== keepPageId)
      await putSession({ ...s, closed: true });
  }
}

chrome.tabs.onRemoved.addListener((tabId) => void closeTabSessions(tabId));

chrome.runtime.onInstalled.addListener(() => void syncContentScripts());
chrome.runtime.onStartup.addListener(() => void syncContentScripts());
chrome.permissions.onRemoved.addListener(() => void syncContentScripts());

async function pendingSessions(now = Date.now()) {
  const sessions = await getSessions();
  return sessions.filter((s) => s.closed || now - s.lastEventAt > SESSION_IDLE_MS);
}

async function handleInternal(
  msg: InternalMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  // Only our own extension pages and content scripts reach onMessage.
  const settings = await getSettings();
  switch (msg.type) {
    case 'getSettings':
      return settings;
    case 'meta': {
      const parsed = SessionMetaSchema.safeParse(msg.meta);
      const senderOrigin = sender.url ? new URL(sender.url).origin : '';
      if (
        !parsed.success ||
        !settings.trackingEnabled ||
        settings.paused ||
        !settings.origins.includes(senderOrigin)
      )
        return { ok: false };
      const tabId = sender.tab?.id ?? -1;
      // A new page load in the same tab ends that tab's earlier sessions.
      if (tabId >= 0) await closeTabSessions(tabId, parsed.data.pageId);
      await putSession({
        meta: parsed.data,
        tabId,
        lastEventAt: parsed.data.startedAt,
        closed: false,
      });
      return { ok: true };
    }
    case 'events': {
      if (!settings.trackingEnabled || settings.paused) return { ok: false };
      const senderOrigin = sender.url ? new URL(sender.url).origin : '';
      const sessions = await getSessions();
      // Accept events only for sessions that this same origin opened.
      const owned = new Set(
        sessions.filter((s) => s.meta.origin === senderOrigin).map((s) => s.meta.sessionId),
      );
      const valid = msg.events.filter(
        (e) => LearningEventSchema.safeParse(e).success && owned.has(e.sessionId),
      );
      if (!valid.length) return { ok: true, stored: 0 };
      await putEvents(valid);
      for (const id of new Set(valid.map((e) => e.sessionId))) {
        const s = sessions.find((x) => x.meta.sessionId === id);
        if (s)
          await putSession({
            ...s,
            lastEventAt: Math.max(
              s.lastEventAt,
              ...valid.filter((e) => e.sessionId === id).map((e) => e.t),
            ),
          });
      }
      return { ok: true, stored: valid.length };
    }
    case 'closeSession': {
      const s = (await getSessions()).find((x) => x.meta.sessionId === msg.sessionId);
      if (s) await putSession({ ...s, closed: true });
      return { ok: true };
    }
    case 'addOrigin': {
      if (!(await chrome.permissions.contains({ origins: [matchPattern(msg.origin)] })))
        return { ok: false, error: 'Permission not granted' };
      await saveSettings({ origins: [...new Set([...settings.origins, msg.origin])] });
      await syncContentScripts();
      return { ok: true };
    }
    case 'removeOrigin': {
      await saveSettings({ origins: settings.origins.filter((o) => o !== msg.origin) });
      const stillUsed = (await getSettings()).origins.some(
        (o) => matchPattern(o) === matchPattern(msg.origin),
      );
      if (!stillUsed)
        await chrome.permissions.remove({ origins: [matchPattern(msg.origin)] }).catch(() => false);
      await syncContentScripts();
      return { ok: true };
    }
    case 'updateSettings':
      return saveSettings(msg.patch);
    case 'pendingCount':
      return { pending: (await pendingSessions()).length, total: (await getSessions()).length };
  }
}

chrome.runtime.onMessage.addListener((msg: InternalMessage, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  handleInternal(msg, sender).then(sendResponse, (e: unknown) =>
    sendResponse({ ok: false, error: String(e) }),
  );
  return true; // async response
});

async function allowedDashboardOrigins(): Promise<string[]> {
  const res = await fetch(chrome.runtime.getURL('dashboard-origins.json'));
  return (await res.json()) as string[];
}

async function handleExternal(msg: ExternalMessage): Promise<unknown> {
  const settings = await getSettings();
  switch (msg.type) {
    case 'skilltrace.status':
      return {
        version: chrome.runtime.getManifest().version,
        trackingEnabled: settings.trackingEnabled,
        paused: settings.paused,
        origins: settings.origins,
        pendingSessions: (await pendingSessions()).length,
      };
    case 'skilltrace.pull': {
      const sessions = await pendingSessions();
      return {
        sessions: await Promise.all(
          sessions.map(async (s) => ({ meta: s.meta, events: await eventsFor(s.meta.sessionId) })),
        ),
      };
    }
    case 'skilltrace.ack':
      // The dashboard stored these sessions (idempotently); remove the local copies.
      for (const id of msg.sessionIds.slice(0, 500)) await deleteSession(id);
      return { ok: true };
    case 'skilltrace.setPaused':
      await saveSettings({ paused: !!msg.paused });
      return { ok: true };
  }
}

chrome.runtime.onMessageExternal.addListener((msg: ExternalMessage, sender, sendResponse) => {
  void (async () => {
    const origins = await allowedDashboardOrigins();
    const origin = sender.origin ?? (sender.url ? new URL(sender.url).origin : '');
    if (!origins.includes(origin)) return sendResponse({ error: 'origin not allowed' });
    try {
      sendResponse(await handleExternal(msg));
    } catch (e) {
      sendResponse({ error: String(e) });
    }
  })();
  return true;
});
