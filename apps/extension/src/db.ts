/** Durable event storage in the extension's own IndexedDB (survives service-worker suspension). */
import type { LearningEvent } from '@skilltrace/shared';
import type { StoredSession } from './protocol';

const DB = 'skilltrace-extension';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sessions'))
        db.createObjectStore('sessions', { keyPath: 'meta.sessionId' });
      if (!db.objectStoreNames.contains('events')) {
        const s = db.createObjectStore('events', { keyPath: 'id' });
        s.createIndex('bySession', 'sessionId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  stores: string[],
  mode: IDBTransactionMode,
  fn: (t: IDBTransaction) => T,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(stores, mode);
        const result = fn(t);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

function all<T>(r: IDBRequest): Promise<T[]> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result as T[]);
    r.onerror = () => reject(r.error);
  });
}

export async function putSession(s: StoredSession): Promise<void> {
  await tx(['sessions'], 'readwrite', (t) => t.objectStore('sessions').put(s));
}

export async function getSessions(): Promise<StoredSession[]> {
  const db = await open();
  return all<StoredSession>(db.transaction('sessions').objectStore('sessions').getAll());
}

/** Idempotent: events are keyed by their stable id, so re-delivery never duplicates. */
export async function putEvents(events: LearningEvent[]): Promise<void> {
  await tx(['events', 'sessions'], 'readwrite', (t) => {
    const store = t.objectStore('events');
    for (const e of events) store.put(e);
  });
}

export async function eventsFor(sessionId: string): Promise<LearningEvent[]> {
  const db = await open();
  return all<LearningEvent>(
    db.transaction('events').objectStore('events').index('bySession').getAll(sessionId),
  );
}

export async function deleteSession(sessionId: string): Promise<void> {
  const events = await eventsFor(sessionId);
  await tx(['events', 'sessions'], 'readwrite', (t) => {
    for (const e of events) t.objectStore('events').delete(e.id);
    t.objectStore('sessions').delete(sessionId);
  });
}
