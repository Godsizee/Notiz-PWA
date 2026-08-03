// Minimal IndexedDB layer for offline support:
//   - `queue`: pending write operations (offline sync queue)
//   - `notes` / `checklist_items` / `note_images`: snapshot caches so the UI
//     can hydrate already-loaded data when the app starts without network.
//   - `blobs`: image data that hasn't been uploaded yet. Blobs are structured-
//     cloneable, so an offline photo survives an app kill here and gets
//     replayed as multipart/form-data by sync.ts (or worker/index.js).

const DB_NAME = 'bb-notes-offline';
const DB_VERSION = 3;

export type SyncCollection = 'notes' | 'checklist_items' | 'note_images';

/** Snapshot caches that hold child records pointing at a note via `note`. */
export type ChildCollection = 'checklist_items' | 'note_images';

/**
 * Binary side-channel for a queued op. The bytes live in the `blobs` store
 * rather than inside the op itself so the queue entry stays small and the
 * service worker can stream it into a FormData without deserializing it.
 */
export interface SyncBlobRef {
  /** Target file field on the record, e.g. 'file'. */
  field: string;
  /** Key into the `blobs` object store. */
  key: string;
  filename: string;
  type: string;
}

export interface SyncOp {
  collection: SyncCollection;
  action: 'create' | 'update' | 'delete';
  /** Record id — for creates a client-generated PocketBase-compatible id. */
  id: string;
  data?: Record<string, unknown>;
  blob?: SyncBlobRef;
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
        if (!db.objectStoreNames.contains('note_images')) {
          const images = db.createObjectStore('note_images', { keyPath: 'id' });
          images.createIndex('note', 'note');
        }
        // Out-of-line keys: the value *is* the Blob, the key is the client-side
        // id minted alongside the queued op.
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs');
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

/** All cached child records (items or images) belonging to one note. */
export async function cacheByNote(
  store: ChildCollection,
  noteId: string
): Promise<CachedRecord[]> {
  const db = await openDb();
  const index = db.transaction(store, 'readonly').objectStore(store).index('note');
  return asPromise(index.getAll(noteId));
}

export function cacheItemsByNote(noteId: string): Promise<CachedRecord[]> {
  return cacheByNote('checklist_items', noteId);
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

/** Replace the cached child records of a single note with a fresh server list. */
export async function cacheReplaceByNote(
  store: ChildCollection,
  noteId: string,
  records: CachedRecord[]
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const objectStore = tx.objectStore(store);
  const staleKeys = await asPromise(objectStore.index('note').getAllKeys(noteId));
  staleKeys.forEach((key) => objectStore.delete(key));
  records.forEach((r) => objectStore.put(r));
  return txDone(tx);
}

export function cacheReplaceItems(noteId: string, records: CachedRecord[]): Promise<void> {
  return cacheReplaceByNote('checklist_items', noteId, records);
}

/**
 * Replace the full note_images snapshot. Unlike checklist items these are
 * loaded once for the whole overview (see useRealtimeImages), so the refresh
 * is collection-wide rather than per note. Records still pending upload keep
 * their locally cached entry — their bytes only exist in `blobs` until the
 * queue flushes, and the server list obviously doesn't know about them yet.
 */
export async function cacheReplaceImages(records: CachedRecord[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('note_images', 'readwrite');
  const store = tx.objectStore('note_images');
  const existing = await asPromise(store.getAll());
  const pending = existing.filter((r) => (r as CachedRecord)._blobKey);
  const fresh = new Set(records.map((r) => r.id));
  store.clear();
  records.forEach((r) => store.put(r));
  pending.forEach((r) => {
    if (!fresh.has((r as CachedRecord).id)) store.put(r);
  });
  return txDone(tx);
}

// --- Blob store ---
// Image bytes waiting to be uploaded. Kept out of the queue entry itself so
// the op stays a small plain object; sync.ts and worker/index.js look the blob
// up by key when they build the multipart request.

export function blobPut(key: string, blob: Blob): Promise<unknown> {
  return withStore('blobs', 'readwrite', (s) => s.put(blob, key));
}

export function blobGet(key: string): Promise<Blob | undefined> {
  return withStore('blobs', 'readonly', (s) => s.get(key));
}

export function blobDelete(key: string): Promise<unknown> {
  return withStore('blobs', 'readwrite', (s) => s.delete(key));
}

export async function blobKeys(): Promise<string[]> {
  const keys = await withStore('blobs', 'readonly', (s) => s.getAllKeys());
  return keys as string[];
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
