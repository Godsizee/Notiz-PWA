import withPWAInit from "@ducanh2912/next-pwa";

// PocketBase reads must always hit the network — or fail cleanly offline —
// so the app's own IndexedDB snapshot cache (which already reflects locally
// queued offline edits, see src/lib/useRealtime.ts) is what serves offline
// reads. Without this override, next-pwa's default cross-origin NetworkFirst
// rule would transparently serve a stale Workbox HTTP cache instead of
// letting the request fail, silently resurrecting old data that doesn't
// include a just-made offline edit.
//
// This has to be a RegExp, not a urlPattern function: workbox-build embeds
// function-valued urlPatterns into the generated sw.js via Function.toString(),
// which captures only the literal source text — any outer closure variable
// (like a PB_ORIGIN const) would come out as an undefined free variable in
// the emitted file and throw at request time. A RegExp serializes as a
// self-contained literal instead, so it survives the trip intact.
const PB_ORIGIN = new URL(
  process.env.NEXT_PUBLIC_POCKETBASE_URL || "https://pbnote.dasdann.jetzt"
).origin;
const PB_ORIGIN_ESCAPED = PB_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PB_ORIGIN_PATTERN = new RegExp(`^${PB_ORIGIN_ESCAPED}/`);

// Note images are the one exception to the NetworkOnly rule above: they are
// immutable (PocketBase gives every upload a random filename suffix, so a
// changed image is a different URL) and useless to re-fetch. Without caching
// them, a note that reads fine offline would show empty boxes where its
// photos are. Listed first — Workbox matches runtimeCaching in array order.
const PB_FILES_PATTERN = new RegExp(`^${PB_ORIGIN_ESCAPED}/api/files/`);

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  // A forced full-page reload on reconnect can wipe out an open checklist
  // editor or unsaved focus. Realtime + the offline queue already handle
  // reconnection gracefully, so the hard reload buys nothing and only risks
  // losing in-progress work.
  reloadOnOnline: false,
  cacheOnFrontEndNav: true,
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: PB_FILES_PATTERN,
        handler: "CacheFirst",
        options: {
          cacheName: "pb-note-images",
          expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
          // status 0 covers the opaque response an unauthenticated cross-origin
          // image request can produce.
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        urlPattern: PB_ORIGIN_PATTERN,
        handler: "NetworkOnly",
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
};

export default withPWA(nextConfig);
