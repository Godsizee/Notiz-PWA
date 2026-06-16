"use client";

import { useRef, useState, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { hapticLight } from '@/lib/haptics';

// Height of the sticky header (h-16 = 64px) plus a small gap.
const HEADER_HEIGHT = 64;
const MIN_HEIGHT = 280;
const DISMISS_THRESHOLD = 120; // px downward before release dismisses
const DEFAULT_FRACTION = 0.6;  // 60 % of viewport on open

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function BottomSheet({ isOpen, onClose, children }: BottomSheetProps) {
  const [height, setHeight] = useState(0);
  const drag = useRef({ active: false, startY: 0, startH: 0 });
  const sheetRef = useRef<HTMLDivElement>(null);

  // Set default height synchronously before the first paint to avoid flash.
  useLayoutEffect(() => {
    if (isOpen) {
      const max = window.innerHeight - HEADER_HEIGHT - 8;
      setHeight(Math.max(MIN_HEIGHT, Math.min(max, Math.round(window.innerHeight * DEFAULT_FRACTION))));
    }
  }, [isOpen]);

  const maxH = () => window.innerHeight - HEADER_HEIGHT - 8;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = {
      active: true,
      startY: e.clientY,
      // Read actual rendered height so the starting point is always accurate.
      startH: sheetRef.current?.offsetHeight ?? height,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    const delta = d.startY - e.clientY; // positive = dragging up
    if (delta > 0) {
      // Upward drag → resize sheet taller, capped just below the header.
      setHeight(Math.min(maxH(), d.startH + delta));
    }
    // Downward drag: no height change — visual dismiss feedback comes from
    // the exit animation when onClose() fires on pointer-up.
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    const delta = d.startY - e.clientY;
    if (delta < -DISMISS_THRESHOLD) {
      hapticLight();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{ height: height || undefined }}
            className="fixed bottom-0 left-0 right-0 bg-card rounded-t-3xl p-4 z-50 shadow-(--shadow-elevated) border-t border-border max-w-4xl mx-auto overflow-hidden"
          >
            {/* Resize / dismiss handle — the only pointer-capture surface */}
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="w-full flex justify-center pt-1 pb-3 -mt-1 cursor-grab active:cursor-grabbing touch-none select-none"
            >
              <div className="w-12 h-1.5 bg-(--text-muted)/40 rounded-full transition-colors" />
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
