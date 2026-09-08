"use client";

// Letzte Auffanglinie: greift, wenn das Root-Layout selbst beim Rendern
// fehlschlaegt. Next ersetzt dann den kompletten Baum durch diese Datei —
// inklusive <html> und <body>, die deshalb hier selbst gerendert werden.
//
// Bewusst ohne globals.css und ohne die CSS-Variablen aus dem Theme-Skript:
// beides haengt am Root-Layout, das in genau diesem Fall nicht laeuft. Die
// Farben stehen darum fest im Markup, damit die Seite unter allen Umstaenden
// lesbar bleibt.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "24px",
          textAlign: "center",
          background: "#0b0717",
          color: "#f3f0fb",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <h1 style={{ fontSize: "18px", fontWeight: 800, margin: 0 }}>
          Die App konnte nicht geladen werden
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "#c2bad8",
            maxWidth: "22rem",
            margin: 0,
          }}
        >
          Deine Notizen sind davon nicht betroffen — sie liegen lokal auf diesem
          Gerät. Bitte lade die App neu.
        </p>
        {error.digest && (
          <p style={{ fontSize: "11px", color: "#8b82a6", margin: 0 }}>
            Fehler-ID: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: "8px",
            minHeight: "44px",
            padding: "10px 18px",
            borderRadius: "12px",
            border: "none",
            background: "#390099",
            color: "#ffffff",
            fontSize: "14px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Neu laden
        </button>
      </body>
    </html>
  );
}
