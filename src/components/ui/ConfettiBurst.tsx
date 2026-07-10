"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

// Kurzer Konfetti-Burst (Scope v1.2 Stufe 3: Micro-Delight), wenn der letzte
// offene Checklist-Eintrag abgehakt wird. Bei prefers-reduced-motion wird
// nichts gerendert. Einbetten mit wechselndem `key`, damit jeder Trigger
// einen frischen Burst startet; nach der Animation bleibt alles unsichtbar.
const COLORS = ["#c77dff", "#7b2cbf", "#a0c4ff", "#caffbf", "#ffd166", "#ffadad"];
const PARTICLE_COUNT = 22;

interface Particle {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  color: string;
  delay: number;
}

function makeParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + Math.random() * 0.5;
    const distance = 70 + Math.random() * 110;
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance - 40, // leichter Auftrieb nach oben
      rotate: (Math.random() - 0.5) * 540,
      scale: 0.6 + Math.random() * 0.8,
      color: COLORS[i % COLORS.length],
      delay: Math.random() * 0.08,
    };
  });
}

export default function ConfettiBurst() {
  const reduceMotion = useReducedMotion();
  const particles = useMemo(() => makeParticles(), []);

  if (reduceMotion) return null;

  return (
    <div className="absolute inset-0 z-[70] pointer-events-none flex items-center justify-center overflow-hidden">
      {particles.map((p, i) => (
        <motion.span
          key={i}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: p.scale }}
          animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.rotate }}
          transition={{ duration: 0.9, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
          className="absolute w-2.5 h-2.5"
          style={{
            backgroundColor: p.color,
            borderRadius: i % 3 === 0 ? "9999px" : "2px",
          }}
        />
      ))}
    </div>
  );
}
