"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

// prefers-reduced-motion galt bisher nur fuer CSS-Animationen (globals.css).
// Framer Motion animiert per JavaScript und ignoriert die Media-Query, solange
// man es nicht ausdruecklich sagt — Karten-Morph, Sheets und Konfetti liefen
// also auch bei "Bewegung reduzieren" voll.
export default function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
