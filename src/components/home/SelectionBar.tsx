"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Pin, Palette, Archive, MoreVertical, Copy, Trash2, Check } from "lucide-react";
import { BarButton } from "@/components/notes/NoteBars";
import { NOTE_COLORS } from "@/lib/colors";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { popoverTransition } from "@/lib/motion";

interface SelectionBarProps {
  count: number;
  /** Alle ausgewaehlten sind angepinnt / archiviert → der Knopf macht es rueckgaengig. */
  allPinned: boolean;
  allArchived: boolean;
  onExit: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onChangeColor: (color: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

// Aktionsleiste der Mehrfachauswahl; ersetzt die Suchleiste an derselben Stelle.
export default function SelectionBar({
  count,
  allPinned,
  allArchived,
  onExit,
  onTogglePin,
  onToggleArchive,
  onChangeColor,
  onDuplicate,
  onDelete,
}: SelectionBarProps) {
  const [showPalette, setShowPalette] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // Escape schliesst ein offenes Popover, sonst die Auswahl (HomeScreen).
  useEscapeKey(showPalette || showMore, () => {
    setShowPalette(false);
    setShowMore(false);
  });

  const popoverMotion = {
    initial: { opacity: 0, y: -8, scale: 0.96 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -8, scale: 0.96 },
    transition: popoverTransition,
  };

  return (
    <header className="sticky top-0 z-40 safe-t">
      <div className="mx-auto max-w-4xl px-3 py-2">
        <div className="relative flex h-14 items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border-color)] bg-[var(--card-bg)] px-1 shadow-[var(--shadow-card)]">
          <BarButton label="Auswahl beenden" onClick={onExit}>
            <X size={22} />
          </BarButton>
          <p className="min-w-0 flex-1 truncate text-base font-bold text-[var(--text-primary)]" role="status" aria-live="polite">
            {count} ausgewählt
          </p>

          <BarButton label={allPinned ? "Anpinnen aufheben" : "Anpinnen"} onClick={onTogglePin}>
            <Pin size={20} className={allPinned ? "fill-current" : ""} />
          </BarButton>
          <BarButton
            label="Farbe ändern"
            expanded={showPalette}
            onClick={() => { setShowPalette((v) => !v); setShowMore(false); }}
          >
            <Palette size={20} />
          </BarButton>
          <BarButton label={allArchived ? "Aus dem Archiv holen" : "Archivieren"} onClick={onToggleArchive}>
            <Archive size={20} />
          </BarButton>
          <BarButton
            label="Mehr"
            expanded={showMore}
            onClick={() => { setShowMore((v) => !v); setShowPalette(false); }}
          >
            <MoreVertical size={20} />
          </BarButton>

          <AnimatePresence>
            {showPalette && (
              <motion.div
                key="palette"
                {...popoverMotion}
                className="absolute right-2 top-full z-50 mt-2 flex max-w-[min(18rem,calc(100vw-1.5rem))] flex-wrap gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-3 shadow-[var(--shadow-elevated)]"
              >
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.id}
                    className="relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-pill)] border border-black/10 shadow-inner transition-transform hover:scale-110 cursor-pointer"
                    style={{ backgroundColor: c.hex }}
                    onClick={() => { setShowPalette(false); onChangeColor(c.hex); }}
                    title={c.label}
                    aria-label={c.label}
                  >
                    <Check className="h-4 w-4 text-slate-800 opacity-0" aria-hidden="true" />
                  </button>
                ))}
              </motion.div>
            )}

            {showMore && (
              <motion.div
                key="more"
                {...popoverMotion}
                className="absolute right-2 top-full z-50 mt-2 flex min-w-[200px] flex-col gap-1 rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-2 shadow-2xl"
              >
                <button
                  onClick={() => { setShowMore(false); onDuplicate(); }}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-3 text-left text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--background)]/80 cursor-pointer"
                >
                  <Copy className="h-4 w-4 text-primary" />
                  <span>Duplizieren</span>
                </button>
                <div className="mx-2 my-1 h-px bg-[var(--border-color)]" />
                <button
                  onClick={() => { setShowMore(false); onDelete(); }}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-3 text-left text-sm font-semibold text-red-500 transition-colors hover:bg-red-500/5 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Löschen</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
