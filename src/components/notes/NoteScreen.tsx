"use client";

import { useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Vollbild-Ansicht einer geoeffneten Notiz. Ersetzt die BottomSheet: kein
// Hintergrund zum Danebentippen, kein Griff zum versehentlichen Wegziehen —
// genau die Fehlbedienungen, die die Sheet hatte. Geschlossen wird nur ueber
// den Zurueck-Pfeil, die System-Zurueck-Geste (popstate) oder Escape.
//
// variant "overlay": Telefon/Tablet hochkant, fixed ueber der Uebersicht.
// variant "pane":    ab 1024 px rechte Spalte neben der Uebersicht (Liste-Detail).

interface NoteScreenProps {
  open: boolean;
  /** Shared-Element-ID der Karte (note-<id>), damit die Karte ins Vollbild morpht. */
  layoutId?: string;
  /** Zugaenglicher Name, z. B. "Liste bearbeiten". */
  label: string;
  variant: 'overlay' | 'pane';
  children: ReactNode;
}

export default function NoteScreen({ open, layoutId, label, variant, children }: NoteScreenProps) {
  // Fokus nach dem Schliessen zurueck auf die Karte/den Knopf, der geoeffnet hat.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      return;
    }
    returnFocusRef.current?.focus?.();
    returnFocusRef.current = null;
  }, [open]);

  // Overlay: Seite darunter nicht mitscrollen lassen (iOS scrollt sonst den
  // Body beim Ueberscrollen der Notiz). Die Scrollposition der Uebersicht
  // bleibt erhalten, weil sie nie veraendert wird.
  useEffect(() => {
    if (!open || variant !== 'overlay') return;
    const root = document.documentElement;
    root.classList.add('note-open');
    return () => root.classList.remove('note-open');
  }, [open, variant]);

  const className =
    variant === 'overlay'
      ? 'fixed inset-0 z-50 flex flex-col bg-[var(--background)]'
      : 'sticky top-0 flex h-dvh min-w-0 flex-1 flex-col overflow-hidden border-l border-[var(--border-color)] bg-[var(--background)]';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="note-screen"
          role={variant === 'overlay' ? 'dialog' : 'region'}
          aria-modal={variant === 'overlay' ? true : undefined}
          aria-label={label}
          layoutId={variant === 'overlay' ? layoutId : undefined}
          initial={variant === 'overlay' && layoutId ? false : { opacity: 0, y: variant === 'overlay' ? 24 : 0 }}
          animate={variant === 'overlay' && layoutId ? undefined : { opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
