"use client";

import { useRef, useState } from 'react';
import { Plus, FileText, ListTodo } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { hapticLight, hapticMedium } from '@/lib/haptics';

interface FABProps {
  /** Single-tap: jump straight into a free-text note (the common case). */
  onCreateText: () => void;
  /** Long-press menu: create a checklist. */
  onCreateChecklist: () => void;
}

const LONG_PRESS_MS = 300;

export default function FAB({ onCreateText, onCreateChecklist }: FABProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handlePointerDown = () => {
    longPressedRef.current = false;
    clearTimer();
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      hapticMedium();
      setMenuOpen(true);
    }, LONG_PRESS_MS);
  };

  const handlePointerUp = () => {
    clearTimer();
    // The long-press already opened the menu — ignore the lifting of that press.
    if (longPressedRef.current) return;
    // A tap while the menu is open closes it; otherwise it's a quick create.
    if (menuOpen) {
      setMenuOpen(false);
    } else {
      hapticLight();
      onCreateText();
    }
  };

  const handlePointerLeave = () => {
    clearTimer();
  };

  const choose = (fn: () => void) => {
    hapticLight();
    setMenuOpen(false);
    fn();
  };

  return (
    <>
      {/* Outside-tap catcher while the radial menu is open */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px]"
          />
        )}
      </AnimatePresence>

      <div className="fixed bottom-8 right-6 z-40 flex flex-col items-end gap-3">
        {/* Long-press type picker */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ type: 'spring', damping: 22, stiffness: 320 }}
              className="flex flex-col gap-2 items-end"
            >
              <button
                onClick={() => choose(onCreateText)}
                className="flex items-center gap-2.5 pl-4 pr-3 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] shadow-xl rounded-2xl text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--primary-light)] transition-colors cursor-pointer"
              >
                Freitext-Notiz
                <span className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </span>
              </button>
              <button
                onClick={() => choose(onCreateChecklist)}
                className="flex items-center gap-2.5 pl-4 pr-3 py-2.5 bg-[var(--card-bg)] border border-[var(--border-color)] shadow-xl rounded-2xl text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--primary-light)] transition-colors cursor-pointer"
              >
                Checkliste
                <span className="w-9 h-9 rounded-xl bg-green-500/10 text-green-500 flex items-center justify-center">
                  <ListTodo className="w-5 h-5" />
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* The FAB itself */}
        <button
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onContextMenu={(e) => e.preventDefault()}
          className="w-14 h-14 bg-[var(--fab-bg)] text-white rounded-2xl shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-transform duration-200 border border-white/10 select-none touch-none"
          aria-label="Notiz erstellen — tippen für Notiz, halten für Auswahl"
        >
          <motion.span animate={{ rotate: menuOpen ? 45 : 0 }} transition={{ duration: 0.2 }}>
            <Plus size={32} strokeWidth={2.5} />
          </motion.span>
        </button>
      </div>
    </>
  );
}
