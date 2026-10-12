import { withSerwist } from "@serwist/turbopack";

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
  // Der Service Worker kommt von der eigenen Origin (/serwist/sw.js); blob:
  // blieb aus der next-pwa-Zeit stehen und schadet nicht.
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

export default withSerwist(nextConfig);
