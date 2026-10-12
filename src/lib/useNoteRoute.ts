"use client";

import { useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { buildNoteUrl, parseNoteRoute, type NoteRoute, type NoteType } from '@/lib/noteRoute';

// Navigation zur Vollbild-Notiz ueber die native History-API. Next 16 synchronisiert
// pushState/replaceState mit useSearchParams (node_modules/next/dist/docs/01-app/
// 01-getting-started/04-linking-and-navigating.md, "Native History API"), und die
// Zurueck-Geste loest popstate aus, das Next selbst verarbeitet.
//
// useSearchParams braucht auf einer vorgerenderten Seite eine <Suspense>-Grenze
// (src/app/page.tsx), sonst bricht `next build` ab.
export function useNoteRoute() {
  const params = useSearchParams();
  const route: NoteRoute = useMemo(() => parseNoteRoute(params), [params]);

  // Haben wir den aktuellen Eintrag selbst gepusht? Dann ist Schliessen ein
  // history.back() (die Uebersicht liegt direkt darunter). Nach einem Deep-Link
  // oder Reload gibt es keinen eigenen Eintrag darunter — dann ersetzen wir
  // ihn, damit "Zurueck" nicht aus der App hinausfuehrt.
  const pushedRef = useRef(false);

  const openNote = useCallback((id: string) => {
    window.history.pushState(null, '', buildNoteUrl({ kind: 'note', id }));
    pushedRef.current = true;
  }, []);

  const openNew = useCallback((type: NoteType) => {
    window.history.pushState(null, '', buildNoteUrl({ kind: 'new', type }));
    pushedRef.current = true;
  }, []);

  /** Neue Notiz wurde gespeichert: URL auf die ID umstellen, ohne History-Eintrag. */
  const replaceWithId = useCallback((id: string) => {
    window.history.replaceState(null, '', buildNoteUrl({ kind: 'note', id }));
  }, []);

  const close = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, '', '/');
    }
  }, []);

  return { route, openNote, openNew, replaceWithId, close };
}
