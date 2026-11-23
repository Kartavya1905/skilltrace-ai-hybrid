/**
 * Storage abstraction with two implementations:
 *  - FirestoreStore: users/{uid}/{collection}/{id} (owner-only rules), public_passports/{shareId}
 *    for the explicitly published, aggregated passport. Writes are set-by-id, so retries and
 *    re-syncs are idempotent; the persistent local cache queues writes while offline.
 *  - LocalStore: IndexedDB in this browser (Local Demo mode, no account needed).
 */
import type { CollectionTypes, LearningEventRecord, PrivateCollection, PublicPassport } from '@skilltrace/shared';
import { PRIVATE_COLLECTIONS } from '@skilltrace/shared';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { openKV, type KV } from './idb';

export type Row<C extends PrivateCollection> = CollectionTypes[C];

export interface DataStore {
  readonly mode: 'local' | 'firestore';
  readonly uid: string;
  subscribe<C extends PrivateCollection>(c: C, cb: (rows: Row<C>[]) => void): () => void;
  put<C extends PrivateCollection>(c: C, row: Row<C>): Promise<void>;
  putMany<C extends PrivateCollection>(c: C, rows: Row<C>[]): Promise<void>;
  remove(c: PrivateCollection, id: string): Promise<void>;
  clear(c: PrivateCollection): Promise<void>;
  listEvents(sessionId?: string): Promise<LearningEventRecord[]>;
  publishPassport(p: PublicPassport): Promise<void>;
  unpublishPassport(shareId: string): Promise<void>;
}

/** Firestore rejects `undefined`; strip it (and non-JSON values) before writing. */
export function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export const LIVE_COLLECTIONS = PRIVATE_COLLECTIONS.filter((c) => c !== 'learning_events');

export class FirestoreStore implements DataStore {
  readonly mode = 'firestore' as const;
  constructor(
    private readonly db: Firestore,
    readonly uid: string,
  ) {}

  private col(c: PrivateCollection) {
    return collection(this.db, 'users', this.uid, c);
  }

  subscribe<C extends PrivateCollection>(c: C, cb: (rows: Row<C>[]) => void): () => void {
    return onSnapshot(
      this.col(c),
      (snap) => cb(snap.docs.map((d) => d.data() as Row<C>)),
      (err) => console.error(`[store] ${c} subscription failed`, err),
    );
  }

  async put<C extends PrivateCollection>(c: C, row: Row<C>): Promise<void> {
    await setDoc(doc(this.col(c), row.id), clean(row));
  }

  async putMany<C extends PrivateCollection>(c: C, rows: Row<C>[]): Promise<void> {
    for (let i = 0; i < rows.length; i += 400) {
      const batch = writeBatch(this.db);
      for (const r of rows.slice(i, i + 400)) batch.set(doc(this.col(c), r.id), clean(r));
      await batch.commit();
    }
  }

  async remove(c: PrivateCollection, id: string): Promise<void> {
    await deleteDoc(doc(this.col(c), id));
  }

  async clear(c: PrivateCollection): Promise<void> {
    const snap = await getDocs(this.col(c));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(this.db);
      for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
      await batch.commit();
    }
  }

  async listEvents(sessionId?: string): Promise<LearningEventRecord[]> {
    const snap = await getDocs(this.col('learning_events'));
    const all = snap.docs.map((d) => d.data() as LearningEventRecord);
    return sessionId ? all.filter((e) => e.sessionId === sessionId) : all;
  }

  async publishPassport(p: PublicPassport): Promise<void> {
    await setDoc(doc(this.db, 'public_passports', p.shareId), clean(p));
  }

  async unpublishPassport(shareId: string): Promise<void> {
    await deleteDoc(doc(this.db, 'public_passports', shareId));
  }
}

export async function fetchPublicPassport(db: Firestore | null, shareId: string): Promise<PublicPassport | null> {
  if (!db) return localPublicKV.get<PublicPassport>('public', shareId).then((v) => v ?? null);
  const snap = await getDoc(doc(db, 'public_passports', shareId));
  return snap.exists() ? (snap.data() as PublicPassport) : null;
}

const localPublicKV = openKV('skilltrace-public', ['public']);

export class LocalStore implements DataStore {
  readonly mode = 'local' as const;
  private kv: KV;
  private listeners = new Map<string, Set<(rows: unknown[]) => void>>();

  constructor(readonly uid = 'local-demo-user') {
    this.kv = openKV('skilltrace-local', [...PRIVATE_COLLECTIONS]);
  }

  private async emit(c: PrivateCollection) {
    const rows = await this.kv.getAll(c);
    for (const l of this.listeners.get(c) ?? []) l(rows);
  }

  subscribe<C extends PrivateCollection>(c: C, cb: (rows: Row<C>[]) => void): () => void {
    const set = this.listeners.get(c) ?? new Set();
    set.add(cb as (rows: unknown[]) => void);
    this.listeners.set(c, set);
    void this.kv.getAll<Row<C>>(c).then(cb);
    return () => set.delete(cb as (rows: unknown[]) => void);
  }

  async put<C extends PrivateCollection>(c: C, row: Row<C>): Promise<void> {
    await this.kv.put(c, row.id, clean(row));
    await this.emit(c);
  }

  async putMany<C extends PrivateCollection>(c: C, rows: Row<C>[]): Promise<void> {
    await this.kv.putMany(
      c,
      rows.map((r) => [r.id, clean(r)]),
    );
    await this.emit(c);
  }

  async remove(c: PrivateCollection, id: string): Promise<void> {
    await this.kv.delete(c, id);
    await this.emit(c);
  }

  async clear(c: PrivateCollection): Promise<void> {
    await this.kv.clear(c);
    await this.emit(c);
  }

  async listEvents(sessionId?: string): Promise<LearningEventRecord[]> {
    const all = await this.kv.getAll<LearningEventRecord>('learning_events');
    return sessionId ? all.filter((e) => e.sessionId === sessionId) : all;
  }

  async publishPassport(p: PublicPassport): Promise<void> {
    await localPublicKV.put('public', p.shareId, clean(p));
  }

  async unpublishPassport(shareId: string): Promise<void> {
    await localPublicKV.delete('public', shareId);
  }
}
