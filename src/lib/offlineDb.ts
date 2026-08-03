// Minimal IndexedDB layer for offline support:
//   - `queue`: pending write operations (offline sync queue)
//   - `notes` / `checklist_items`: snapshot caches so the UI can hydrate
//     already-loaded data when the app starts without network.

const DB_NAME = 'bb-notes-offline';
const DB_VERSION = 2;

export type SyncCollection = 'notes' | 'checklist_items';

export interface SyncOp {
  collection: SyncCollection;
  action: 'create' | 'update' | 'delete';
  /** Record id — for creates a client-generated PocketBase-compatible id. */
  id: string;
  data?: Record<string, unknown>;
}

export type CachedRecord = { id: string } & Record<string, unknown>;

export interface DeadLetterEntry {
  key: number;
  op: SyncOp;
  failedAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('queue')) {
          db.createObjectStore('queue', { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('notes')) {
          db.createObjectStore('notes', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('checklist_items')) {
          const items = db.createObjectStore('checklist_items', { keyPath: 'id' });
          items.createIndex('note', 'note');
        }
        if (!db.objectStoreNames.contains('deadLetters')) {
          db.createObjectStore('deadLetters', { autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function asPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  name: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  return asPromise(fn(db.transaction(name, mode).objectStore(name)));
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// --- Snapshot cache ---

export function cacheGet(store: SyncCollection, id: string): Promise<CachedRecord | undefined> {
  return withStore(store, 'readonly', (s) => s.get(id));
}

export function cachePut(store: SyncCollection, record: CachedRecord): Promise<unknown> {
  return withStore(store, 'readwrite', (s) => s.put(record));
}

export function cacheDelete(store: SyncCollection, id: string): Promise<unknown> {
  return withStore(store, 'readwrite', (s) => s.delete(id));
}

export function cacheGetAll(store: SyncCollection): Promise<CachedRecord[]> {
  return withStore(store, 'readonly', (s) => s.getAll());
}

export async function cacheItemsByNote(noteId: string): Promise<CachedRecord[]> {
  const db = await openDb();
  const index = db
    .transaction('checklist_items', 'readonly')
    .objectStore('checklist_items')
    .index('note');
  return asPromise(index.getAll(noteId));
}

/** Replace the full notes snapshot with a fresh server list. */
export async function cacheReplaceNotes(records: CachedRecord[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('notes', 'readwrite');
  const store = tx.objectStore('notes');
  store.clear();
  records.forEach((r) => store.put(r));
  return txDone(tx);
}

/** Replace the cached items of a single note with a fresh server list. */
export async function cacheReplaceItems(noteId: string, records: CachedRecord[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('checklist_items', 'readwrite');
  const store = tx.objectStore('checklist_items');
  const staleKeys = await asPromise(store.index('note').getAllKeys(noteId));
  staleKeys.forEach((key) => store.delete(key));
  records.forEach((r) => store.put(r));
  return txDone(tx);
}

// --- Offline queue ---

export interface QueueEntry {
  key: number;
  op: SyncOp;
}

export function queueAdd(op: SyncOp): Promise<unknown> {
  return withStore('queue', 'readwrite', (s) => s.add(op));
}

export function queueRemove(key: number): Promise<unknown> {
  return withStore('queue', 'readwrite', (s) => s.delete(key));
}

export function queueCount(): Promise<number> {
  return withStore('queue', 'readonly', (s) => s.count());
}

export async function queueEntries(): Promise<QueueEntry[]> {
  const db = await openDb();
  const store = db.transaction('queue', 'readonly').objectStore('queue');
  const keysReq = store.getAllKeys();
  const valuesReq = store.getAll();
  const [keys, values] = await Promise.all([asPromise(keysReq), asPromise(valuesReq)]);
  return keys.map((key, i) => ({ key: key as number, op: values[i] as SyncOp }));
}

// --- Dead-letter ---
// Ops that fail during queue replay with a non-retryable error (validation /
// permission — as opposed to "still offline") land here instead of being
// silently dropped, so the failure stays visible (Header badge) and the op
// itself isn't lost.

export function deadLetterAdd(op: SyncOp): Promise<unknown> {
  return withStore('deadLetters', 'readwrite', (s) => s.add({ op, failedAt: new Date().toISOString() }));
}

export function deadLetterCount(): Promise<number> {
  return withStore('deadLetters', 'readonly', (s) => s.count());
}

export async function deadLetterEntries(): Promise<DeadLetterEntry[]> {
  const db = await openDb();
  const store = db.transaction('deadLetters', 'readonly').objectStore('deadLetters');
  const keysReq = store.getAllKeys();
  const valuesReq = store.getAll();
  const [keys, values] = await Promise.all([asPromise(keysReq), asPromise(valuesReq)]);
  return keys.map((key, i) => ({ key: key as number, ...(values[i] as { op: SyncOp; failedAt: string }) }));
}

export function deadLetterClear(): Promise<unknown> {
  return withStore('deadLetters', 'readwrite', (s) => s.clear());
}

// --- Meta key/value store ---
// Currently used to mirror the PocketBase auth token so the service worker's
// Background Sync handler can authenticate — it has no access to
// localStorage or cookies from the SW global scope.

export function metaSet(key: string, value: string): Promise<unknown> {
  return withStore('meta', 'readwrite', (s) => s.put(value, key));
}

export function metaDelete(key: string): Promise<unknown> {
  return withStore('meta', 'readwrite', (s) => s.delete(key));
}

export function metaGet(key: string): Promise<string | undefined> {
  return withStore('meta', 'readonly', (s) => s.get(key));
}
