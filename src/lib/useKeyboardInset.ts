"use client";

import { useEffect, useState } from 'react';

/**
 * Hoehe der Bildschirmtastatur, soweit sie den Layout-Viewport NICHT schon
 * verkleinert. Mit interactive-widget=resizes-content (Chrome/Android) ist das
 * 0; in iOS Safari schrumpft nur der Visual Viewport, dann liefert der Hook die
 * Differenz, um fixierte Leisten darueber zu halten.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      // Unter 80 px ist es Browser-Chrome (Adressleiste), keine Tastatur.
      setInset(covered > 80 ? Math.round(covered) : 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
