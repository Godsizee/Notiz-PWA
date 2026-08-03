import { RecordModel } from 'pocketbase';
import { pb } from '@/lib/pb';
import { useSyncStore } from '@/store/useSyncStore';
import { useToastStore } from '@/store/useToastStore';
import { BACKGROUND_SYNC_TAG } from '@/lib/syncTag';
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
  blobGet,
  blobDelete,
  blobKeys,
  deadLetterAdd,
  deadLetterCount,
  deadLetterClear,
  deadLetterEntries,
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

// PocketBase aborts a request (rejecting with isAbort) when it is auto-cancelled
// by a newer same-key request. Shared with useRealtime.ts so both call sites
// agree on what "expected, not a real error" means.
export function isAbortError(err: unknown): boolean {
  return !!(err && typeof err === 'object' && (err as { isAbort?: boolean }).isAbort);
}

// Real device connectivity is rarely the bottleneck — a hung request or a
// "Lie-Fi" network (Wi-Fi connected, no actual internet) is. Both the
// reachability ping and the write-timeout below use this budget so a stuck
// write falls back to the offline path within roughly the same window the
// plan's acceptance test measures against ("binnen ~2s").
const CONNECTIVITY_TIMEOUT_MS = 2500;

// Image uploads must not share that budget. A few hundred KB over mobile data
// routinely takes longer than 2.5s, and treating that as "the network is
// gone" would flip the whole app into offline mode — and re-queue an upload
// that was in fact about to succeed — every single time a photo is attached.
const UPLOAD_TIMEOUT_MS = 60_000;

class WriteTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new WriteTimeoutError());
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Short health ping so "online" reflects real reachability, not just navigator.onLine. */
async function isReachable(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONNECTIVITY_TIMEOUT_MS);
  try {
    await pb.health.check({ requestKey: null, signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function applyChange(op: SyncOp): Promise<RecordModel> {
  const online = typeof navigator === 'undefined' || navigator.onLine;
  if (online) {
    try {
      return await withTimeout(
        applyRemote(op),
        op.blob ? UPLOAD_TIMEOUT_MS : CONNECTIVITY_TIMEOUT_MS
      );
    } catch (err) {
      if (!(err instanceof WriteTimeoutError) && !isOfflineError(err)) throw err;
      // Either the request died mid-flight although the browser reported
      // "online", or it simply hung (e.g. Wi-Fi with no real internet).
      useSyncStore.getState().setOnline(false);
    }
  }
  return applyLocal(op);
}

// Image ops carry their bytes in the `blobs` store instead of in op.data, so
// they can't go out as JSON. Build the multipart body the PocketBase SDK
// forwards as-is. Returns undefined when the blob is gone (already uploaded by
// an earlier attempt, or evicted) — the caller then falls back to a plain
// metadata-only write rather than re-uploading nothing.
async function buildFormData(op: SyncOp, includeId: boolean): Promise<FormData | undefined> {
  if (!op.blob) return undefined;
  const blob = await blobGet(op.blob.key).catch(() => undefined);
  if (!blob) return undefined;

  const form = new FormData();
  if (includeId) form.append('id', op.id);
  for (const [key, value] of Object.entries(op.data ?? {})) {
    if (value === undefined || value === null) continue;
    form.append(key, typeof value === 'boolean' ? String(value) : String(value));
  }
  form.append(op.blob.field, blob, op.blob.filename);
  return form;
}

async function applyRemote(op: SyncOp): Promise<RecordModel> {
  const col = pb.collection(op.collection);

  if (op.action === 'create') {
    const form = await buildFormData(op, true);
    const record = await col.create(form ?? { id: op.id, ...op.data }, { requestKey: null });
    if (op.blob) await blobDelete(op.blob.key).catch(() => {});
    await cachePut(op.collection, record).catch(() => {});
    return record;
  }
  if (op.action === 'update') {
    const form = await buildFormData(op, false);
    const record = await col.update(op.id, form ?? op.data, { requestKey: null });
    if (op.blob) await blobDelete(op.blob.key).catch(() => {});
    await cachePut(op.collection, record).catch(() => {});
    return record;
  }
  await col.delete(op.id, { requestKey: null });
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
    // The server hasn't seen the file yet, so `file` is empty — remember where
    // the bytes are so the gallery can render the picked photo immediately
    // instead of showing a gap until the queue flushes.
    if (op.blob) record._blobKey = op.blob.key;
    await cachePut(op.collection, record).catch(() => {});
  }

  try {
    await queueAdd(op);
    useSyncStore.getState().setPendingCount(await queueCount());
    registerBackgroundSync();
  } catch (err) {
    console.error('Failed to enqueue offline change:', err);
  }

  emit({ collection: op.collection, action: op.action, record: record as unknown as RecordModel });
  return record as unknown as RecordModel;
}

interface SyncManagerLike { register(tag: string): Promise<void>; }

// Best-effort durable flush: asks the browser to wake the service worker and
// replay the queue even if this tab/PWA gets closed before we're back
// online. Only Chromium-based browsers support this (not Safari/iOS) — the
// 'online' listener and the 30s interval below are the mandatory fallback
// and work everywhere, so a failure here is silently ignored.
async function registerBackgroundSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!('SyncManager' in window)) return;
  try {
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & { sync: SyncManagerLike };
    await reg.sync.register(BACKGROUND_SYNC_TAG);
  } catch {
    // Best-effort only.
  }
}

// Queue replays must be tolerant: a 404 means the record was deleted on
// another device (deletion wins), a create collision means an earlier flush
// attempt already reached the server.
async function replayQueued(op: SyncOp): Promise<void> {
  const col = pb.collection(op.collection);
  try {
    if (op.action === 'create') {
      const form = await buildFormData(op, true);
      await col.create(form ?? { id: op.id, ...op.data }, { requestKey: null });
    } else if (op.action === 'update') {
      const form = await buildFormData(op, false);
      await col.update(op.id, form ?? op.data, { requestKey: null });
    } else {
      await col.delete(op.id, { requestKey: null });
    }
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return;
    if (op.action === 'create' && status === 400) {
      const retryForm = await buildFormData(op, false);
      await col.update(op.id, retryForm ?? op.data, { requestKey: null }).catch((retryErr) => {
        if ((retryErr as { status?: number }).status !== 404) throw retryErr;
      });
      return;
    }
    throw err;
  }

  // Uploaded (or the record was already gone) — the local copy has served its
  // purpose as the optimistic preview and can be released.
  if (op.blob) await blobDelete(op.blob.key).catch(() => {});
}

let flushing = false;

export async function flushQueue(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  flushing = true;

  const store = useSyncStore.getState();
  let deadLettered = 0;
  try {
    const entries = await queueEntries();
    if (entries.length > 0) store.setSyncing(true);
    for (const { key, op } of entries) {
      try {
        await replayQueued(op);
      } catch (err) {
        if (isOfflineError(err)) return; // still offline — keep queue, retry later
        const status = (err as { status?: number }).status;
        if (status === 401) return; // stale token — retry once the app refreshes auth, not the op's fault
        // Genuinely unsyncable (validation/permission): move to dead-letter
        // instead of silently dropping it so the failure stays recoverable.
        // Note the blob is deliberately *not* released here — the dead-lettered
        // op still references it, and dropping the bytes would lose the photo
        // for good.
        console.error('Moving unsyncable offline change to dead-letter:', op, err);
        await deadLetterAdd(op).catch(() => {});
        deadLettered++;
      }
      await queueRemove(key);
    }
  } catch (err) {
    console.error('Offline queue flush failed:', err);
  } finally {
    store.setPendingCount(await queueCount().catch(() => 0));
    store.setDeadLetterCount(await deadLetterCount().catch(() => 0));
    store.setSyncing(false);
    store.bumpFlushSerial();
    flushing = false;
  }

  if (deadLettered > 0) {
    useToastStore.getState().showToast({
      message: `${deadLettered} Änderung${deadLettered === 1 ? '' : 'en'} konnte${deadLettered === 1 ? '' : 'n'} nicht synchronisiert werden.`,
      duration: 5000,
    });
  }
}

/** Acknowledges and clears all dead-lettered ops (user-dismissed from the Header badge). */
export async function clearDeadLetters(): Promise<void> {
  await deadLetterClear().catch(() => {});
  useSyncStore.getState().setDeadLetterCount(0);
  // The acknowledged ops were the last thing keeping their image bytes alive.
  sweepOrphanBlobs().catch(() => {});
}

/**
 * Drop image bytes no queued and no dead-lettered op refers to any more.
 * Without this, an interrupted flush (or a blob whose op was removed while its
 * delete never ran) would keep multi-hundred-KB photos in IndexedDB forever.
 */
async function sweepOrphanBlobs(): Promise<void> {
  const keys = await blobKeys().catch(() => []);
  if (keys.length === 0) return;

  const [queued, dead] = await Promise.all([
    queueEntries().catch(() => []),
    deadLetterEntries().catch(() => []),
  ]);
  const referenced = new Set<string>();
  queued.forEach(({ op }) => op.blob && referenced.add(op.blob.key));
  dead.forEach(({ op }) => op.blob && referenced.add(op.blob.key));

  await Promise.all(
    keys.filter((key) => !referenced.has(key)).map((key) => blobDelete(key).catch(() => {}))
  );
}

const REACHABILITY_INTERVAL_MS = 20_000;

let initialized = false;

/** Idempotent bootstrap: connectivity listeners + initial queue flush. */
export function initSync(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  useSyncStore.getState().setOnline(navigator.onLine);

  // Queued photos are the one thing here that's expensive to lose *and* big
  // enough for the browser to consider evicting under storage pressure. Ask
  // for persistent storage so an offline shot survives until it syncs.
  navigator.storage?.persist?.().catch(() => {});

  window.addEventListener('online', async () => {
    // The browser fires this on link-layer changes (e.g. Wi-Fi reconnect)
    // even without real internet access ("Lie-Fi") — confirm reachability
    // before trusting it and flushing the queue.
    const reachable = await isReachable();
    useSyncStore.getState().setOnline(reachable);
    if (reachable) flushQueue();
  });
  window.addEventListener('offline', () => {
    useSyncStore.getState().setOnline(false);
  });

  // Ops that failed while the browser still reported "online" (unreachable
  // server) never trigger an 'online' event — retry periodically instead.
  setInterval(() => {
    if (useSyncStore.getState().pendingCount > 0 && navigator.onLine) flushQueue();
  }, 30_000);

  // Heartbeat: catches "Lie-Fi" in both directions (going stale and
  // recovering), since the browser's online/offline events never fire for it.
  setInterval(async () => {
    if (!navigator.onLine) return;
    const reachable = await isReachable();
    const store = useSyncStore.getState();
    if (reachable !== store.isOnline) {
      store.setOnline(reachable);
      if (reachable) flushQueue();
    }
  }, REACHABILITY_INTERVAL_MS);

  // The service worker's Background Sync handler (worker/index.js) flushes
  // the queue directly and has no way to update this tab's state itself —
  // it posts a message instead so an open tab refreshes immediately rather
  // than waiting for its next own flush attempt.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type !== 'QUEUE_FLUSHED') return;
      const store = useSyncStore.getState();
      queueCount().then((count) => store.setPendingCount(count)).catch(() => {});
      deadLetterCount().then((count) => store.setDeadLetterCount(count)).catch(() => {});
      store.bumpFlushSerial();
    });
  }

  queueCount()
    .then((count) => {
      useSyncStore.getState().setPendingCount(count);
      if (count > 0 && navigator.onLine) flushQueue();
    })
    .catch(() => {});

  deadLetterCount()
    .then((count) => useSyncStore.getState().setDeadLetterCount(count))
    .catch(() => {});

  sweepOrphanBlobs().catch(() => {});
}
