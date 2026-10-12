"use client";

import { useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSelectionActive, useSelectionStore } from '@/store/useSelectionStore';

// Mehrfachauswahl und Zurueck-Geste: Ohne eigenen History-Eintrag wuerde
// Android-Zurueck bei aktiver Auswahl die App verlassen. Beginnt eine Auswahl,
// kommt /?select=1 auf den Stack; Zurueck entfernt ihn und leert die Auswahl.
// parseNoteRoute ignoriert "select", die Route bleibt also "home".
export function useSelectionHistory() {
  const params = useSearchParams();
  const inUrl = params.get('select') === '1';
  const active = useSelectionActive();
  const clear = useSelectionStore((s) => s.clear);
  const pushedRef = useRef(false);
  const wasInUrlRef = useRef(inUrl);

  // Auswahl beginnt/endet → History nachziehen.
  useEffect(() => {
    if (active && !inUrl && !pushedRef.current) {
      window.history.pushState(null, '', '/?select=1');
      pushedRef.current = true;
    } else if (!active && inUrl) {
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
      } else {
        // Reload mit ?select=1: nichts ausgewaehlt, Parameter still entfernen.
        window.history.replaceState(null, '', '/');
      }
    }
  }, [active, inUrl]);

  // Zurueck gedrueckt: Parameter ist weg (true → false) → Auswahl leeren. Nur
  // auf den Wechsel reagieren — direkt nach dem pushState ist inUrl noch false.
  useEffect(() => {
    if (wasInUrlRef.current && !inUrl) {
      pushedRef.current = false;
      clear();
    }
    wasInUrlRef.current = inUrl;
  }, [inUrl, clear]);

  /** ✕ in der Auswahlleiste / Escape. */
  const exit = useCallback(() => clear(), [clear]);
  return { exit };
}
