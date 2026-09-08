"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

// React-Error-Boundary fuer alle Routen unterhalb des Root-Layouts. Ohne diese
// Datei zeigt Next im Produktionsbuild seine nackte Standard-Fehlerseite —
// unbrandet, englisch und ohne Ausweg ausser dem Zurueck-Button des Browsers.
//
// reset() rendert das Segment neu, ohne die Seite komplett zu laden: der
// Service Worker, die IndexedDB-Verbindung und alles, was noch in der
// Sync-Queue liegt, bleiben dabei erhalten.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unerwarteter Fehler:", error);
  }, [error]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[var(--card-bg)] border border-[var(--border-color)] shadow-[var(--shadow-card)] flex items-center justify-center text-amber-500">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h1 className="text-lg font-extrabold text-[var(--text-primary)]">
        Da ist etwas schiefgelaufen
      </h1>
      <p className="text-sm text-[var(--text-secondary)] max-w-xs">
        Deine Notizen sind sicher — sie liegen lokal auf diesem Gerät und in der
        Sync-Queue. Meist reicht ein neuer Versuch.
      </p>
      {error.digest && (
        <p className="text-[11px] font-mono text-[var(--text-muted)]">
          Fehler-ID: {error.digest}
        </p>
      )}
      <button
        onClick={reset}
        className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 min-h-11 rounded-xl bg-primary text-white text-sm font-bold cursor-pointer"
      >
        <RotateCcw className="w-4 h-4" />
        Erneut versuchen
      </button>
    </div>
  );
}
