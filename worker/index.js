// Custom service worker addition, bundled and imported into the generated
// Workbox service worker via next-pwa's customWorkerSrc mechanism (see
// next.config.mjs — this file lives at the default "worker/index.js" path,
// no extra config needed). It runs in the SW's global scope alongside the
// auto-generated precaching/fetch logic.
//
// This only adds a Background Sync handler so the offline write queue can
// flush even while the PWA is fully closed, on browsers that support the
// Background Sync API (Chrome/Edge — NOT Safari/iOS, which has no support
// for it at all). initSync() in src/lib/sync.ts remains the primary,
// universally-supported flush path (online event + 30s interval); this is a
// best-effort enhancement on top of it, never the only strategy.
//
// Plain JS (not .ts): it uses service-worker-only globals (self, clients)
// that aren't part of this project's "dom"-only tsconfig lib, and isn't
// covered by tsconfig's include globs, so it stays out of `tsc` entirely.
// The imported modules below are plain, environment-agnostic IndexedDB code
// and typecheck normally on their own.

import { queueEntries, queueRemove, deadLetterAdd, metaGet } from '../src/lib/offlineDb';
import { BACKGROUND_SYNC_TAG } from '../src/lib/syncTag';

// Mirrors the fallback in src/lib/pb.ts — this SW bundle has no access to
// build-time env vars, and the backend URL is not expected to change often.
const PB_URL = 'https://pbnote.dasdann.jetzt';

async function pbFetch(path, method, token, body) {
  const res = await fetch(`${PB_URL}/api/collections/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = new Error(`PocketBase ${method} ${path} failed with ${res.status}`);
    err.status = res.status;
    throw err;
  }
}

// Mirrors replayQueued()'s tolerant error handling in src/lib/sync.ts: a 404
// means another device already deleted the record (deletion wins), and a 400
// on create means an earlier flush attempt already reached the server.
async function replayOp(op, token) {
  const base = `${op.collection}/records`;
  try {
    if (op.action === 'create') await pbFetch(base, 'POST', token, { id: op.id, ...op.data });
    else if (op.action === 'update') await pbFetch(`${base}/${op.id}`, 'PATCH', token, op.data);
    else await pbFetch(`${base}/${op.id}`, 'DELETE', token);
  } catch (err) {
    if (err.status === 404) return;
    if (op.action === 'create' && err.status === 400) {
      try {
        await pbFetch(`${base}/${op.id}`, 'PATCH', token, op.data);
      } catch (retryErr) {
        if (retryErr.status !== 404) throw retryErr;
      }
      return;
    }
    throw err;
  }
}

async function flushQueueInBackground() {
  const token = await metaGet('authToken').catch(() => undefined);
  if (!token) return; // nothing to authenticate with — the app will flush once it's reopened

  const entries = await queueEntries();
  for (const { key, op } of entries) {
    try {
      await replayOp(op, token);
    } catch (err) {
      // No status at all (network failure) or 401 (stale token, needs the
      // full app to refresh it): stop and let the next sync/online event
      // retry, don't punish the op for either of those.
      if (err.status === undefined || err.status === 401) return;
      await deadLetterAdd(op).catch(() => {});
    }
    await queueRemove(key).catch(() => {});
  }

  const clients = await self.clients.matchAll();
  clients.forEach((client) => client.postMessage({ type: 'QUEUE_FLUSHED' }));
}

self.addEventListener('sync', (event) => {
  if (event.tag === BACKGROUND_SYNC_TAG) {
    event.waitUntil(flushQueueInBackground());
  }
});
