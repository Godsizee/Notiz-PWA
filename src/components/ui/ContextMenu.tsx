"use client";

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { RecordModel } from 'pocketbase';
import { Pin, PinOff, Archive, ArchiveRestore, Trash2, Check, Users, UserMinus, Copy } from 'lucide-react';
import { NOTE_COLORS } from '@/lib/colors';
import { hapticLight } from '@/lib/haptics';
import { isOwnedByMe } from '@/lib/pb';

interface ContextMenuProps {
  isOpen: boolean;
  /** Screen coordinates of the long-press / right-click point. */
  position: { x: number; y: number };
  note: RecordModel;
  onClose: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onToggleShare: () => void;
  onDuplicate: () => void;
  onChangeColor: (color: string) => void;
  onDelete: () => void;
}

const MENU_WIDTH = 240;
const MENU_EST_HEIGHT = 300;

export default function ContextMenu({
  isOpen,
  position,
  note,
  onClose,
  onTogglePin,
  onToggleArchive,
  onToggleShare,
  onDuplicate,
  onChangeColor,
  onDelete,
}: ContextMenuProps) {
  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (typeof document === 'undefined') return null;

  // Keep the menu fully on screen.
  const left = isOpen
    ? Math.max(12, Math.min(position.x, window.innerWidth - MENU_WIDTH - 12))
    : 0;
  const top = isOpen
    ? Math.max(12, Math.min(position.y, window.innerHeight - MENU_EST_HEIGHT - 12))
    : 0;

  const run = (fn: () => void) => {
    hapticLight();
    fn();
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Dismiss backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            onContextMenu={(e) => {
              e.preventDefault();
              onClose();
            }}
            className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-[3px]"
          />

          {/* Menu */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -6 }}
            transition={{ type: 'spring', damping: 24, stiffness: 360 }}
            style={{ left, top, width: MENU_WIDTH }}
            className="fixed z-[91] bg-[var(--card-bg)] border border-[var(--border-color)] shadow-2xl rounded-2xl p-2 origin-top-left"
          >
            <button
              onClick={() => run(onTogglePin)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--background)]/80 transition-colors cursor-pointer text-left"
            >
              {note.is_pinned ? (
                <><PinOff className="w-4 h-4 text-primary" /> Loslösen</>
              ) : (
                <><Pin className="w-4 h-4 text-primary" /> Anpinnen</>
              )}
            </button>

            <button
              onClick={() => run(onToggleArchive)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--background)]/80 transition-colors cursor-pointer text-left"
            >
              {note.is_archived ? (
                <><ArchiveRestore className="w-4 h-4 text-orange-500" /> Wiederherstellen</>
              ) : (
                <><Archive className="w-4 h-4 text-orange-500" /> Archivieren</>
              )}
            </button>

            <button
              onClick={() => run(onToggleShare)}
              disabled={!isOwnedByMe(note)}
              title={isOwnedByMe(note) ? undefined : 'Nur wer die Notiz angelegt hat, kann das Teilen beenden'}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--background)]/80 transition-colors cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              {note.is_shared ? (
                <><UserMinus className="w-4 h-4 text-primary" /> Nicht mehr teilen</>
              ) : (
                <><Users className="w-4 h-4 text-primary" /> Mit Partner teilen</>
              )}
            </button>

            <button
              onClick={() => run(onDuplicate)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--background)]/80 transition-colors cursor-pointer text-left"
            >
              <Copy className="w-4 h-4 text-primary" /> Duplizieren
            </button>

            {/* Color row */}
            <div className="flex items-center gap-1.5 px-3 py-2.5 flex-wrap">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => run(() => onChangeColor(c.hex))}
                  className="w-6 h-6 rounded-full border border-black/10 shadow-inner flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
                  style={{ backgroundColor: c.hex }}
                  title={c.label}
                >
                  {(note.color === c.hex || (!note.color && c.id === 'white')) && (
                    <Check className="w-3.5 h-3.5 text-slate-800" />
                  )}
                </button>
              ))}
            </div>

            <div className="h-[1px] bg-[var(--border-color)] my-1 mx-2" />

            <button
              onClick={() => run(onDelete)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-500/5 transition-colors cursor-pointer text-left"
            >
              <Trash2 className="w-4 h-4" /> Löschen
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
