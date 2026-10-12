"use client";

import { useEffect, useRef } from 'react';

/**
 * Escape schliesst nur das oberste Popover, nicht die Notiz dahinter:
 * useKeyboardShortcuts haengt seinen Escape-Handler in der Bubble-Phase an
 * window, dieser hier laeuft in der Capture-Phase davor und stoppt das Event
 * (gleiches Muster wie ScanSheet).
 */
export function useEscapeKey(active: boolean, onEscape: () => void) {
  const handlerRef = useRef(onEscape);
  useEffect(() => {
    handlerRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      handlerRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);
}
