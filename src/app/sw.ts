/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Service Worker (Serwist). Gebaut von src/app/serwist/[path]/route.ts per
// esbuild und unter /serwist/sw.js ausgeliefert (Scope "/" per
// Service-Worker-Allowed-Header).
//
// Die eigenen Handler (Background Sync der Offline-Queue, Web Share Target)
// stehen unveraendert in sw-handlers.js und werden VOR Serwist registriert:
// Der Share-Target-POST muss beantwortet sein, bevor Serwists Router ihn sieht.
import './sw-handlers.js';
import { defaultCache } from '@serwist/turbopack/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, CacheableResponsePlugin, ExpirationPlugin, NetworkOnly, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Per esbuild-`define` zur Buildzeit eingesetzt (siehe route.ts) — ein SW-Bundle
// hat zur Laufzeit kein process.env. Frueher stand hier die Produktions-URL
// des Autors als Literal.
const PB_ORIGIN = new URL(process.env.NEXT_PUBLIC_POCKETBASE_URL as string).origin;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Notizbilder sind unveraenderlich (PocketBase vergibt pro Upload einen
    // neuen Dateinamen) — einmal laden, offline weiter anzeigen.
    {
      matcher: ({ url }) => url.origin === PB_ORIGIN && url.pathname.startsWith('/api/files/'),
      handler: new CacheFirst({
        cacheName: 'pb-note-images',
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 }),
        ],
      }),
    },
    // Alle anderen PocketBase-Aufrufe muessen ans Netz oder sauber scheitern:
    // Offline liest die App aus ihrem eigenen IndexedDB-Snapshot, der die
    // lokal gequeueten Aenderungen schon enthaelt. defaultCache wuerde
    // Cross-Origin-Antworten sonst per NetworkFirst cachen und offline einen
    // veralteten Stand ohne die eben gemachte Aenderung ausliefern.
    { matcher: ({ url }) => url.origin === PB_ORIGIN, handler: new NetworkOnly() },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: '/~offline', matcher: ({ request }) => request.destination === 'document' }],
  },
});

// Precache-Reste des alten Service Workers (@ducanh2912/next-pwa / Workbox).
// Die Runtime-Caches heissen in Serwist gleich und werden weiterverwendet.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('workbox-precache') || key === 'start-url')
            .map((key) => caches.delete(key))
        )
      )
  );
});

serwist.addEventListeners();
