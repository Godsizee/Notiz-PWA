import type { Transition } from 'framer-motion';

// Zwei Bewegungsvarianten fuer die ganze Oberflaeche (Plan UI-Overhaul C.4/U41),
// passend zu den Tokens --ease-standard/--duration-short in globals.css:
//  - springPage: Morph Karte → Notiz, Seiten und Spalten
//  - popoverTransition: kleine Menues und Paletten (kurz, ohne Nachschwingen)

export const springPage: Transition = { type: 'spring', damping: 32, stiffness: 320 };

export const popoverTransition: Transition = { duration: 0.15, ease: [0.2, 0, 0, 1] };
