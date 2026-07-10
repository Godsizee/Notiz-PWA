import { RecordModel } from 'pocketbase';
import { pb } from '@/lib/pb';
import { useSyncStore } from '@/store/useSyncStore';
import {
  SyncOp,
  SyncCollection,
  CachedRecord,
  cacheGet,
  cachePut,
  cacheDelete,
  queueAdd,
  queueRemove,
  queueCount,
  queueEntries,
} from '@/lib/offlineDb';

// Offline sync engine (Last-Write-Wins).
//
// applyChange() is the single write path for notes & checklist items:
//   online  → direct PocketBase call (behavior identical to before; the UI
//             updates through the realtime echo as usual)
//   offline → the op is applied optimistically to the snapshot cache,
//             broadcast to the data hooks (onLocalChange) and enqueued in
//             IndexedDB. flushQueue() replays the queue in order on reconnect.

export interface LocalChange {
  collection: SyncCollection;
  action: SyncOp['action'];
  record: RecordModel;
}

type Listener = (change: LocalChange) => void;
const listeners = new Set<Listener>();

export function onLocalChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(change: LocalChange) {
  listeners.forEach((l) => l(change));
}

/** PocketBase-compatible client-side record id (15 chars, [a-z0-9]). */
export function newRecordId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  return Array.from(bytes, (b) => chars[b % 36]).join('');
}

// A real connectivity failure has status 0 — but so do the SDK's auto-cancel
// aborts, which must NOT land in the offline queue.
function isOfflineError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; isAbort?: boolean };
  return e.status === 0 && !e.isAbort;
}

export async function applyChange(op: SyncOp): Promise<RecordModel> {
  const online = typeof navigator === 'undefined' || navigator.onLine;
  if (online) {
    try {
      return await applyRemote(op);
    } catch (err) {
      if (!isOfflineError(err)) throw err;
      // Request died mid-flight although the browser reported "online".
      useSyncStore.getState().setOnline(false);
    }
  }
  return applyLocal(op);
}

async function applyRemote(op: SyncOp): Promise<RecordModel> {
  const col = pb.collection(op.collection);
  if (op.action === 'create') {
    const record = await col.create({ id: op.id, ...op.data });
    await cachePut(op.collection, record).catch(() => {});
    return record;
  }
  if (op.action === 'update') {
    const record = await col.update(op.id, op.data);
    await cachePut(op.collection, record).catch(() => {});
    return record;
  }
  await col.delete(op.id);
  await cacheDelete(op.collection, op.id).catch(() => {});
  return { id: op.id } as RecordModel;
}

async function applyLocal(op: SyncOp): Promise<RecordModel> {
  const now = new Date().toISOString();
  let record: CachedRecord;

  if (op.action === 'delete') {
    record = { id: op.id };
    await cacheDelete(op.collection, op.id).catch(() => {});
  } else {
    const existing =
      op.action === 'update'
        ? await cacheGet(op.collection, op.id).catch(() => undefined)
        : undefined;
    record = { created: now, ...existing, ...op.data, id: op.id, updated: now };
    await cachePut(op.collection, record).catch(() => {});
  }

  try {
    await queueAdd(op);
    useSyncStore.getState().setPendingCount(await queueCount());
  } catch (err) {
    console.error('Failed to enqueue offline change:', err);
  }

  emit({ collection: op.collection, action: op.action, record: record as unknown as RecordModel });
  return record as unknown as RecordModel;
}

// Queue replays must be tolerant: a 404 means the record was deleted on
// another device (deletion wins), a create collision means an earlier flush
// attempt already reached the server.
async function replayQueued(op: SyncOp): Promise<void> {
  const col = pb.collection(op.collection);
  try {
    if (op.action === 'create') await col.create({ id: op.id, ...op.data }, { requestKey: null });
    else if (op.action === 'update') await col.update(op.id, op.data, { requestKey: null });
    else await col.delete(op.id, { requestKey: null });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return;
    if (op.action === 'create' && status === 400) {
      await col.update(op.id, op.data, { requestKey: null }).catch((retryErr) => {
        if ((retryErr as { status?: number }).status !== 404) throw retryErr;
      });
      return;
    }
    throw err;
  }
}

let flushing = false;

export async function flushQueue(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  flushing = true;

  const store = useSyncStore.getState();
  try {
    const entries = await queueEntries();
    if (entries.length > 0) store.setSyncing(true);
    for (const { key, op } of entries) {
      try {
        await replayQueued(op);
      } catch (err) {
        if (isOfflineError(err)) return; // still offline — keep queue, retry later
        // Unsyncable op (validation/permission): drop it so it can't block the queue.
        console.error('Dropping unsyncable offline change:', op, err);
      }
      await queueRemove(key);
    }
  } catch (err) {
    console.error('Offline queue flush failed:', err);
  } finally {
    store.setPendingCount(await queueCount().catch(() => 0));
    store.setSyncing(false);
    store.bumpFlushSerial();
    flushing = false;
  }
}

let initialized = false;

/** Idempotent bootstrap: connectivity listeners + initial queue flush. */
export function initSync(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  useSyncStore.getState().setOnline(navigator.onLine);

  window.addEventListener('online', () => {
    useSyncStore.getState().setOnline(true);
    flushQueue();
  });
  window.addEventListener('offline', () => {
    useSyncStore.getState().setOnline(false);
  });

  // Ops that failed while the browser still reported "online" (unreachable
  // server) never trigger an 'online' event — retry periodically instead.
  setInterval(() => {
    if (useSyncStore.getState().pendingCount > 0 && navigator.onLine) flushQueue();
  }, 30_000);

  queueCount()
    .then((count) => {
      useSyncStore.getState().setPendingCount(count);
      if (count > 0 && navigator.onLine) flushQueue();
    })
    .catch(() => {});
}
