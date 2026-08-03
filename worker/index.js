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

import {
  queueEntries,
  queueRemove,
  deadLetterAdd,
  metaGet,
  metaSet,
  blobGet,
  blobPut,
  blobDelete,
} from '../src/lib/offlineDb';
import { BACKGROUND_SYNC_TAG, PENDING_SHARE_KEY } from '../src/lib/syncTag';

// Mirrors the fallback in src/lib/pb.ts — this SW bundle has no access to
// build-time env vars, and the backend URL is not expected to change often.
const PB_URL = 'https://pbnote.dasdann.jetzt';

// `body` is either a plain object (sent as JSON) or a FormData (sent as
// multipart). For multipart the Content-Type header must be omitted entirely
// so the browser can generate the boundary.
async function pbFetch(path, method, token, body) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(`${PB_URL}/api/collections/${path}`, {
    method,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: token } : {}),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(`PocketBase ${method} ${path} failed with ${res.status}`);
    err.status = res.status;
    throw err;
  }
}

// Counterpart to buildFormData() in src/lib/sync.ts. Returns undefined when
// the op has no blob or its bytes are already gone, so the caller falls back
// to the plain JSON path.
async function buildFormData(op, includeId) {
  if (!op.blob) return undefined;
  let blob;
  try {
    blob = await blobGet(op.blob.key);
  } catch {
    return undefined;
  }
  if (!blob) return undefined;

  const form = new FormData();
  if (includeId) form.append('id', op.id);
  const data = op.data || {};
  Object.keys(data).forEach((key) => {
    const value = data[key];
    if (value === undefined || value === null) return;
    form.append(key, String(value));
  });
  form.append(op.blob.field, blob, op.blob.filename);
  return form;
}

// Mirrors replayQueued()'s tolerant error handling in src/lib/sync.ts: a 404
// means another device already deleted the record (deletion wins), and a 400
// on create means an earlier flush attempt already reached the server.
async function replayOp(op, token) {
  const base = `${op.collection}/records`;
  try {
    if (op.action === 'create') {
      const form = await buildFormData(op, true);
      await pbFetch(base, 'POST', token, form || { id: op.id, ...op.data });
    } else if (op.action === 'update') {
      const form = await buildFormData(op, false);
      await pbFetch(`${base}/${op.id}`, 'PATCH', token, form || op.data);
    } else {
      await pbFetch(`${base}/${op.id}`, 'DELETE', token);
    }
  } catch (err) {
    if (err.status === 404) return;
    if (op.action === 'create' && err.status === 400) {
      try {
        const retryForm = await buildFormData(op, false);
        await pbFetch(`${base}/${op.id}`, 'PATCH', token, retryForm || op.data);
      } catch (retryErr) {
        if (retryErr.status !== 404) throw retryErr;
      }
      if (op.blob) await blobDelete(op.blob.key).catch(() => {});
      return;
    }
    throw err;
  }

  if (op.blob) await blobDelete(op.blob.key).catch(() => {});
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

// --- Web Share Target (POST / multipart) ---
//
// Sharing a photo from the Samsung gallery into the app posts a multipart body
// at the manifest's share_target action. A Next.js client page cannot read
// that body, so the service worker has to intercept the request, park the
// payload in IndexedDB and redirect to a normal GET page which picks it up.
//
// It gets its own path instead of reusing /share so it can never collide with
// Workbox's navigation route for that page. Workbox routes are GET-only by
// default, so this POST reaches us untouched either way.

const SHARE_TARGET_PATH = '/share-target';

async function handleShareTarget(request) {
  try {
    const form = await request.formData();

    const images = [];
    const shared = form.getAll('images');
    for (let i = 0; i < shared.length; i++) {
      const file = shared[i];
      if (!file || typeof file === 'string' || !file.size) continue;
      const key = `share_${Date.now()}_${i}`;
      await blobPut(key, file);
      images.push({ key, type: file.type || 'image/jpeg', name: file.name || '' });
    }

    await metaSet(
      PENDING_SHARE_KEY,
      JSON.stringify({
        title: String(form.get('title') || ''),
        text: String(form.get('text') || ''),
        url: String(form.get('url') || ''),
        images,
      })
    );
  } catch {
    // Nothing parked → the page finds no pending share and just goes home.
  }

  // Absolute URL: Response.redirect rejects relative ones.
  return Response.redirect(new URL('/share?shared=1', self.location.origin).href, 303);
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'POST') return;
  if (new URL(event.request.url).pathname !== SHARE_TARGET_PATH) return;
  event.respondWith(handleShareTarget(event.request));
});
