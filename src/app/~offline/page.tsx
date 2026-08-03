"use client";

import { CloudOff } from "lucide-react";

// Workbox's precache-fallback document for when a navigation fails offline
// AND nothing was precached for that route (see next.config.mjs). With the
// app shell + start URL precached, normal navigation inside the installed
// PWA should never actually hit this — it's the safety net for a truly cold,
// unprecached deep link (e.g. a fresh install that hasn't finished caching).
export default function OfflineFallbackPage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[var(--card-bg)] border border-[var(--border-color)] shadow-[var(--shadow-card)] flex items-center justify-center text-amber-500">
        <CloudOff className="w-6 h-6" />
      </div>
      <h1 className="text-lg font-extrabold text-[var(--text-primary)]">Keine Verbindung</h1>
      <p className="text-sm text-[var(--text-secondary)] max-w-xs">
        Diese Seite wurde noch nicht für die Offline-Nutzung gespeichert. Bereits geöffnete Notizen und Checklisten funktionieren weiterhin ganz normal.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-2 px-4 py-2.5 min-h-11 rounded-xl bg-primary text-white text-sm font-bold cursor-pointer"
      >
        Erneut versuchen
      </button>
    </div>
  );
}
