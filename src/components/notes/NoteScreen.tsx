"use client";

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { springPage } from '@/lib/motion';

// Vollbild-Ansicht einer geoeffneten Notiz. Ersetzt das fruehere Bottom-Sheet: kein
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

  return (
    <AnimatePresence>
      {open && (
        <NoteSurface key="note-screen" layoutId={layoutId} label={label} variant={variant}>
          {children}
        </NoteSurface>
      )}
    </AnimatePresence>
  );
}

function NoteSurface({ layoutId, label, variant, children }: Omit<NoteScreenProps, 'open'>) {
  // Ob die Karte ins Vollbild morpht, wird beim Mounten festgelegt und bleibt
  // so. Bei Deep-Link/Reload steht die ID erst nach dem Laden der Notizen fest,
  // also mitten in der Eintrittsanimation; mit nachtraeglicher layoutId hing der
  // Crossfade mit der Karte bei ~16 % Deckkraft fest und die Uebersicht
  // schimmerte durch die Notiz.
  const [morphId] = useState(variant === 'overlay' ? layoutId : undefined);

  const className =
    variant === 'overlay'
      ? 'fixed inset-0 z-50 flex flex-col bg-[var(--background)]'
      : 'relative z-10 flex h-full min-w-0 flex-col overflow-hidden bg-[var(--background)]';

  return (
    <motion.div
      role={variant === 'overlay' ? 'dialog' : 'region'}
      aria-modal={variant === 'overlay' ? true : undefined}
      aria-label={label}
      layoutId={morphId}
      initial={morphId ? false : { opacity: 0, y: variant === 'overlay' ? 24 : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={springPage}
      className={className}
    >
      {children}
    </motion.div>
  );
}
