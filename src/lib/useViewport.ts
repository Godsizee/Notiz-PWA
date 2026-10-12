"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** true, solange die Media-Query zutrifft. Auf dem Server immer false. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

/**
 * Scrollrichtung des Fensters, fuer "beim Runterscrollen ausblenden" von
 * Suchleiste und erweitertem FAB. Erst ab 8 px Bewegung, damit kleines
 * Zittern am Finger nichts umschaltet; ganz oben immer "up".
 */
export function useScrollDirection(): 'up' | 'down' {
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const lastY = useRef(0);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 24) {
        setDirection('up');
      } else if (Math.abs(y - lastY.current) >= 8) {
        setDirection(y > lastY.current ? 'down' : 'up');
      } else {
        return;
      }
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return direction;
}
