"use client";

import type { ReactNode, RefObject } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useKeyboardInset } from '@/lib/useKeyboardInset';

// Obere und untere Leiste der Vollbild-Notiz (Aufbau wie Google Keep, das die
// beiden Nutzer kennen): oben Zurueck + Statusaktionen, unten Hinzufuegen,
// Farbe, Speicherstatus und "Mehr". Beide Editoren nutzen dieselben Leisten,
// damit sich Liste und Textnotiz gleich bedienen.

interface NoteTopBarProps {
  onBack: () => void;
  /** Titel der Notiz — erscheint in der Leiste, sobald der Titel im Inhalt weggescrollt ist. */
  title: string;
  showTitle: boolean;
  /** Tippen auf den Titel scrollt nach oben (iOS-Konvention). */
  scrollRef: RefObject<HTMLElement | null>;
  /** Rechte Seite: Anpinnen, Archivieren, Teilen-Status, Presence. */
  actions: ReactNode;
}

export function NoteTopBar({ onBack, title, showTitle, scrollRef, actions }: NoteTopBarProps) {
  return (
    <header
      className={`sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1 px-1 transition-colors ${showTitle ? 'border-b border-[var(--border-color)] bg-[var(--card-bg)]/90 backdrop-blur-xl' : 'bg-transparent'}`}
      style={{ paddingTop: 'env(safe-area-inset-top)', boxSizing: 'content-box' }}
    >
      <button
        onClick={onBack}
        className="tap-target shrink-0 rounded-full text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 cursor-pointer"
        aria-label="Zur Übersicht"
        title="Zur Übersicht"
      >
        <ArrowLeft className="h-6 w-6" />
      </button>
      <button
        onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
        tabIndex={showTitle ? 0 : -1}
        aria-hidden={!showTitle}
        className={`min-w-0 flex-1 truncate text-left text-base font-bold text-[var(--text-primary)] transition-opacity ${showTitle ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        {title}
      </button>
      <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
    </header>
  );
}

interface NoteBottomBarProps {
  /** Links: Hinzufuegen (Bild/Scan) und Farbe. */
  leading: ReactNode;
  /** Mitte: "Bearbeitet 10:42" / "Speichert…" / "Lokal gespeichert". */
  status: ReactNode;
  /** Rechts: Mehr-Menue. */
  trailing: ReactNode;
}

export function NoteBottomBar({ leading, status, trailing }: NoteBottomBarProps) {
  // Haelt die Leiste ueber der Bildschirmtastatur. Chrome/Android erledigt das
  // ueber interactive-widget=resizes-content (layout.tsx) selbst, dann ist der
  // Wert 0; iOS Safari schiebt nur den Visual Viewport und braucht den Versatz.
  const keyboardInset = useKeyboardInset();
  return (
    <footer
      className="sticky bottom-0 z-20 flex h-14 shrink-0 items-center gap-1 border-t border-[var(--border-color)] bg-[var(--card-bg)]/90 px-1 backdrop-blur-xl"
      style={{
        paddingBottom: keyboardInset > 0 ? 0 : 'env(safe-area-inset-bottom)',
        boxSizing: 'content-box',
        transform: keyboardInset > 0 ? `translateY(-${keyboardInset}px)` : undefined,
      }}
    >
      <div className="flex shrink-0 items-center gap-0.5">{leading}</div>
      <div className="min-w-0 flex-1 truncate text-center text-xs text-[var(--text-muted)]" aria-live="polite">
        {status}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">{trailing}</div>
    </footer>
  );
}

/** Einheitlicher Symbolknopf fuer beide Leisten (44 px, Name Pflicht). */
export function BarButton({
  label,
  onClick,
  pressed,
  disabled,
  expanded,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  expanded?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      className={`tap-target shrink-0 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${pressed ? 'bg-primary/10 text-primary' : 'text-[var(--text-secondary)] hover:bg-[var(--text-primary)]/5'}`}
    >
      {children}
    </button>
  );
}
