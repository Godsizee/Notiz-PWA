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
// Kein Fallback auf eine konkrete Instanz mehr: der frühere Default zeigte auf
// den Produktionsserver des Autors, sodass jeder Fork ohne eigene Konfiguration
// stillschweigend dorthin geschrieben hätte. Lieber laut abbrechen.
if (!process.env.NEXT_PUBLIC_POCKETBASE_URL) {
  throw new Error(
    [
      "NEXT_PUBLIC_POCKETBASE_URL ist nicht gesetzt.",
      "Lokal:  cp .env.example .env  und den Wert eintragen.",
      "CI:     als Repository Variable setzen (siehe README, Abschnitt Deployment).",
    ].join("\n")
  );
}

const PB_ORIGIN = new URL(process.env.NEXT_PUBLIC_POCKETBASE_URL).origin;
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

// Sicherheitsheader. Bewusst konservativ gehalten, damit nichts unbemerkt
// bricht — die Direktiven unten koennen eine funktionierende App nicht kaputt
// machen, decken aber Clickjacking, MIME-Sniffing, Referrer-Leaks und
// base-tag-/Formular-Hijacking ab.
//
// script-src steht auf 'unsafe-inline': das Theme-Skript in layout.tsx muss
// vor dem ersten Paint laufen und Next injiziert eigene Inline-Skripte. Ein
// strenges script-src braucht Nonces und damit dynamisches Rendering auf allen
// Seiten — das ist ein eigener Umbau, kein Header-Einzeiler. Der Rest der
// Policy ist trotzdem wirksam: connect-src und img-src begrenzen, wohin
// ueberhaupt Daten fliessen koennen.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'" +
    (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  // Tailwind und Framer Motion schreiben Styles inline ins Element.
  "style-src 'self' 'unsafe-inline'",
  // blob: fuer die clientseitig herunterskalierten Bilder vor dem Upload,
  // data: fuer die Blur-Platzhalter aus der note_images-Collection.
  `img-src 'self' data: blob: ${PB_ORIGIN}`,
  "font-src 'self' data:",
  `connect-src 'self' ${PB_ORIGIN}`,
  // next-pwa registriert den Service Worker ueber eine blob:-URL.
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  // Die App braucht keine dieser Faehigkeiten: Fotos kommen ueber
  // <input type="file" capture>, was der OS-Kamera-App gehoert und keine
  // Permissions-Policy-Freigabe verlangt.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Nur ueber HTTPS wirksam, ueber http schlicht ignoriert.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withPWA(nextConfig);
