"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Cloud, CloudOff, RefreshCw } from "lucide-react";
import DisplaySettings from "@/components/ui/DisplaySettings";
import { pb } from "@/lib/pb";
import { initSync, clearDeadLetters } from "@/lib/sync";
import { initPreferences } from "@/store/usePreferencesStore";
import { useSyncStore } from "@/store/useSyncStore";
import { useScrollDirection } from "@/lib/useViewport";

interface HomeTopBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

// Kopfzeile der Uebersicht als Suchleiste (Material 3 "Search bar"): Logo,
// Suchfeld, Sync-Status und Menue in einer runden Leiste. Sie blendet beim
// Runterscrollen aus und beim Hochscrollen wieder ein, solange nicht gesucht wird.
export default function HomeTopBar({ searchQuery, onSearchChange }: HomeTopBarProps) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const scrollDirection = useScrollDirection();

  const isOnline = useSyncStore((s) => s.isOnline);
  const isSyncing = useSyncStore((s) => s.isSyncing);
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const deadLetterCount = useSyncStore((s) => s.deadLetterCount);
  const hasDeadLetters = deadLetterCount > 0;

  useEffect(() => {
    initSync();
    initPreferences();
    const user = pb.authStore.model || pb.authStore.record;
    if (user?.email) {
      setUserEmail(user.email);
    }
  }, []);

  const handleLogout = () => {
    const pending = useSyncStore.getState().pendingCount;
    if (
      pending > 0 &&
      !window.confirm(
        `${pending} Änderung${pending === 1 ? ' ist' : 'en sind'} noch nicht synchronisiert. ` +
          'Sie werden übertragen, sobald du dich mit demselben Konto wieder anmeldest. Trotzdem abmelden?'
      )
    ) {
      return;
    }
    pb.authStore.clear();
    document.cookie = "pb_auth=; path=/; max-age=0; SameSite=Lax";
    router.push("/login");
  };

  const syncTitle = !isOnline
    ? "Offline – Änderungen werden lokal gespeichert und später synchronisiert"
    : isSyncing
      ? "Synchronisiert..."
      : pendingCount > 0
        ? `${pendingCount} Änderung${pendingCount === 1 ? "" : "en"} wartet auf Synchronisation`
        : hasDeadLetters
          ? `${deadLetterCount} Änderung${deadLetterCount === 1 ? "" : "en"} konnte${deadLetterCount === 1 ? "" : "n"} nicht synchronisiert werden – tippen zum Ausblenden`
          : "Online – alles synchronisiert";

  // Waehrend der Eingabe bleibt die Leiste stehen, sonst verschwaende das Feld
  // unter dem Finger.
  const hidden = scrollDirection === "down" && !searchFocused && !searchQuery;

  return (
    <header
      // inert: ausgeblendet darf die Leiste weder Fokus noch Screenreader erreichen.
      inert={hidden}
      className="sticky top-0 z-40 safe-t transition-transform duration-[var(--duration-medium)] ease-[var(--ease-standard)]"
      style={{ transform: hidden ? "translateY(-100%)" : undefined }}
    >
      <div className="mx-auto max-w-4xl px-3 py-2">
        <div className="flex h-14 items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border-color)] bg-[var(--card-bg)] px-1 shadow-[var(--shadow-card)]">
          {/* Logo: Tipp scrollt nach oben */}
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="tap-target shrink-0 rounded-[var(--radius-pill)] cursor-pointer"
            aria-label="B&B – Nach oben"
            title="Nach oben"
          >
            {/* next/image lohnt sich hier nicht: statisches Logo (7 KB), und der
                standalone-Runner bringt kein sharp mit, wuerde also ohnehin unoptimiert
                ausliefern. width/height verhindern den Layout-Shift. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt=""
              width={36}
              height={36}
              decoding="async"
              className="logo-img h-9 w-9 rounded-[var(--radius-pill)] object-cover"
            />
            {/* Life-OS-Design: statt des violetten App-Icons ein pinker Sticker */}
            <span className="logo-sticker" aria-hidden="true">B&amp;B</span>
          </button>

          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onSearchChange("");
                e.currentTarget.blur();
              }
            }}
            placeholder="Notizen durchsuchen"
            aria-label="Notizen durchsuchen"
            enterKeyHint="search"
            className="min-w-0 flex-1 appearance-none bg-transparent py-2 text-base text-[var(--text-primary)] outline-none placeholder-[var(--text-muted)]/70 [&::-webkit-search-cancel-button]:hidden"
          />

          {searchQuery ? (
            <button
              onClick={() => onSearchChange("")}
              className="tap-target shrink-0 rounded-[var(--radius-pill)] text-[var(--text-muted)] hover:bg-[var(--text-primary)]/5 cursor-pointer"
              aria-label="Suche leeren"
              title="Suche leeren"
            >
              <X className="h-5 w-5" />
            </button>
          ) : (
            // Unter 384 px braucht das Feld den Platz fuer den Platzhalter.
            <Search className="mr-1 hidden h-5 w-5 shrink-0 text-[var(--text-muted)] xs:block" aria-hidden="true" />
          )}

          {/* Sync / offline status — becomes a dismiss button once there are
              dead-lettered changes (permanently failed, won't auto-retry) */}
          {hasDeadLetters ? (
            <button
              onClick={() => clearDeadLetters()}
              className="tap-target relative shrink-0 rounded-[var(--radius-pill)] hover:bg-[var(--text-primary)]/5 cursor-pointer"
              title={syncTitle}
              aria-label={syncTitle}
            >
              <CloudOff className="w-4.5 h-4.5 text-amber-500" />
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-[var(--radius-pill)] bg-amber-500 px-1 text-[11px] font-bold text-white">
                {deadLetterCount}
              </span>
            </button>
          ) : (
            <div
              role="status"
              aria-label={syncTitle}
              className="tap-target relative shrink-0 rounded-[var(--radius-pill)] cursor-help"
              title={syncTitle}
            >
              {!isOnline ? (
                <CloudOff className="w-4.5 h-4.5 text-amber-500" />
              ) : isSyncing ? (
                <RefreshCw className="w-4.5 h-4.5 animate-spin text-primary" />
              ) : (
                <Cloud className="w-4.5 h-4.5 text-[var(--text-muted)]" />
              )}
              {pendingCount > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-[var(--radius-pill)] bg-amber-500 px-1 text-[11px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </div>
          )}

          <DisplaySettings userEmail={userEmail} onLogout={handleLogout} />
        </div>
      </div>
    </header>
  );
}
