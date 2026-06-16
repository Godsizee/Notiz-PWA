"use client";

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Undo2, X } from 'lucide-react';
import { useToastStore } from '@/store/useToastStore';

// Global toast host. Mount this once near the app root. It reads the
// single active toast from the Zustand store and renders a floating
// notification at the bottom of the screen, auto-dismissing after the
// toast's `duration`.
export default function Toast() {
  const toast = useToastStore((s) => s.toast);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismiss, toast.duration);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.95 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] w-[calc(100%-2rem)] max-w-sm"
        >
          <div className="flex items-center gap-3 bg-[var(--card-bg)]/95 backdrop-blur-xl border border-[var(--border-color)] shadow-2xl rounded-2xl px-4 py-3">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                toast.tone === 'danger' ? 'bg-red-500' : 'bg-primary'
              }`}
            />
            <p className="flex-1 text-sm font-semibold text-[var(--text-primary)] leading-snug">
              {toast.message}
            </p>

            {toast.actionLabel && (
              <button
                onClick={() => {
                  toast.onAction?.();
                  dismiss();
                }}
                className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-[var(--primary-hover)] uppercase tracking-wide px-2.5 py-1.5 rounded-xl hover:bg-primary/10 transition-colors cursor-pointer shrink-0"
              >
                <Undo2 className="w-3.5 h-3.5" />
                {toast.actionLabel}
              </button>
            )}

            <button
              onClick={dismiss}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer p-1 shrink-0"
              aria-label="Schließen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
