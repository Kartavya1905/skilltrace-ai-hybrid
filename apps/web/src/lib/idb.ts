/** Minimal promise wrapper over IndexedDB for durable local storage (events, local-mode records). */

export interface KV {
  get<T>(store: string, key: string): Promise<T | undefined>;
  getAll<T>(store: string): Promise<T[]>;
  put(store: string, key: string, value: unknown): Promise<void>;
  putMany(store: string, entries: [string, unknown][]): Promise<void>;
  delete(store: string, key: string): Promise<void>;
  clear(store: string): Promise<void>;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function openKV(name: string, stores: string[], version = 1): KV {
  let dbp: Promise<IDBDatabase> | null = null;
  const db = () =>
    (dbp ??= new Promise((resolve, reject) => {
      const open = indexedDB.open(name, version);
      open.onupgradeneeded = () => {
        for (const s of stores)
          if (!open.result.objectStoreNames.contains(s)) open.result.createObjectStore(s);
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    }));
  const tx = async (store: string, mode: IDBTransactionMode) =>
    (await db()).transaction(store, mode).objectStore(store);
  const done = (t: IDBObjectStore) =>
    new Promise<void>((resolve, reject) => {
      t.transaction.oncomplete = () => resolve();
      t.transaction.onerror = () => reject(t.transaction.error);
      t.transaction.onabort = () => reject(t.transaction.error);
    });
  return {
    async get<T>(store: string, key: string) {
      return (await req((await tx(store, 'readonly')).get(key))) as T | undefined;
    },
    async getAll<T>(store: string) {
      return (await req((await tx(store, 'readonly')).getAll())) as T[];
    },
    async put(store, key, value) {
      const t = await tx(store, 'readwrite');
      t.put(value, key);
      await done(t);
    },
    async putMany(store, entries) {
      const t = await tx(store, 'readwrite');
      for (const [k, v] of entries) t.put(v, k);
      await done(t);
    },
    async delete(store, key) {
      const t = await tx(store, 'readwrite');
      t.delete(key);
      await done(t);
    },
    async clear(store) {
      const t = await tx(store, 'readwrite');
      t.clear();
      await done(t);
    },
  };
}
