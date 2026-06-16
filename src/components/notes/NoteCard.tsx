"use client";

import { useRef, useState } from 'react';
import { RecordModel } from 'pocketbase';
import { Pin, Circle, CheckCircle2, ListTodo, FileText, Trash2 } from 'lucide-react';
import { useRealtimeChecklist } from '@/lib/useRealtime';
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { getNoteColorStyles } from '@/lib/colors';
import { formatRelative } from '@/lib/relativeTime';
import { hapticMedium, hapticHeavy } from '@/lib/haptics';
import ContextMenu from '@/components/ui/ContextMenu';

interface NoteCardProps {
  note: RecordModel;
  onClick: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onChangeColor: (color: string) => void;
  onDelete: () => void;
}

const SWIPE_THRESHOLD = 90; // px the card must travel to fire the swipe action
const LONG_PRESS_MS = 400;
const MOVE_TOLERANCE = 10; // px of movement that cancels a long-press

export default function NoteCard({
  note,
  onClick,
  onTogglePin,
  onToggleArchive,
  onChangeColor,
  onDelete,
}: NoteCardProps) {
  const { items } = useRealtimeChecklist(note.type === 'checklist' ? note.id : '');
  const colorStyles = getNoteColorStyles(note.color);

  // Swipe drag plumbing
  const x = useMotionValue(0);
  const pinRevealOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const deleteRevealOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);

  // Long-press / context-menu plumbing
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  const visibleItems = items.slice(0, 5);

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    longPressFired.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      hapticMedium();
      setMenuPos({ x: e.clientX, y: e.clientY });
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pressStart.current) return;
    const dx = Math.abs(e.clientX - pressStart.current.x);
    const dy = Math.abs(e.clientY - pressStart.current.y);
    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) clearLongPress();
  };

  const handleClick = () => {
    // Suppress the open-tap that follows a long-press.
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    onClick();
  };

  const handleDragEnd = (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    if (info.offset.x <= -SWIPE_THRESHOLD) {
      hapticHeavy();
      onDelete();
    } else if (info.offset.x >= SWIPE_THRESHOLD) {
      hapticMedium();
      onTogglePin();
    }
  };

  return (
    <div className="relative mb-4 break-inside-avoid">
      {/* Swipe-right reveal: Pin (sits on the left, behind the card) */}
      <motion.div
        style={{ opacity: pinRevealOpacity }}
        className="absolute inset-0 rounded-3xl bg-primary-strong flex items-center justify-start pl-6 text-white pointer-events-none"
      >
        <Pin className="w-6 h-6 fill-current" />
      </motion.div>

      {/* Swipe-left reveal: Delete (sits on the right, behind the card) */}
      <motion.div
        style={{ opacity: deleteRevealOpacity }}
        className="absolute inset-0 rounded-3xl bg-red-500 flex items-center justify-end pr-6 text-white pointer-events-none"
      >
        <Trash2 className="w-6 h-6" />
      </motion.div>

      {/* The draggable card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        whileTap={{ scale: 0.98 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7}
        onDragEnd={handleDragEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={clearLongPress}
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuPos({ x: e.clientX, y: e.clientY });
        }}
        className={`cursor-pointer rounded-3xl p-5 border shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow duration-300 relative overflow-hidden group select-none ${colorStyles.bg}`}
        style={{ x, ...colorStyles.style }}
      >
        {/* Glow Effect on Hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Pin Icon */}
        {note.is_pinned && (
          <div className="absolute top-3.5 right-3.5 p-1.5 bg-[var(--card-bg)]/70 backdrop-blur-md rounded-lg text-primary shadow-sm border border-[var(--border-color)] z-10 transition-transform group-hover:scale-110">
            <Pin className="w-3.5 h-3.5 fill-current" />
          </div>
        )}

        {/* Title */}
        {note.title ? (
          <h3 className="font-bold text-base md:text-lg mb-3 pr-6 text-[var(--text-primary)] leading-snug group-hover:text-primary transition-colors duration-200">
            {note.title}
          </h3>
        ) : (
          <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase mb-3.5">
            {note.type === 'checklist' ? (
              <>
                <ListTodo className="w-3 h-3" />
                <span>Liste</span>
              </>
            ) : (
              <>
                <FileText className="w-3 h-3" />
                <span>Notiz</span>
              </>
            )}
          </div>
        )}

        {/* Text Note Content */}
        {note.type === 'text' && note.content && (
          <p className="text-[var(--text-secondary)] text-sm whitespace-pre-wrap line-clamp-6 leading-relaxed">
            {note.content}
          </p>
        )}

        {/* Checklist Preview */}
        {note.type === 'checklist' && (
          <div className="space-y-2">
            {visibleItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2.5">
                {item.is_completed ? (
                  <CheckCircle2 className={`w-4 h-4 shrink-0 ${colorStyles.icon}`} />
                ) : (
                  <Circle className="w-4 h-4 text-[var(--text-muted)]/40 shrink-0" />
                )}
                <span className={`text-sm ${item.is_completed ? 'line-through text-[var(--text-muted)]/60 font-normal' : 'text-[var(--text-secondary)] font-medium'} line-clamp-1`}>
                  {item.text}
                </span>
              </div>
            ))}

            {items.length > 5 && (
              <div className="pt-2.5 flex items-center gap-2">
                <div className="h-[1px] flex-1 bg-[var(--border-color)]"></div>
                <p className="text-[9px] font-extrabold text-[var(--text-muted)] uppercase tracking-widest bg-background/50 px-2 py-0.5 rounded-full border border-[var(--border-color)]">
                  + {items.length - 5} weitere
                </p>
                <div className="h-[1px] flex-1 bg-[var(--border-color)]"></div>
              </div>
            )}

            {items.length === 0 && (
              <p className="text-xs italic text-[var(--text-muted)]/50 py-1">
                Leere Checkliste...
              </p>
            )}
          </div>
        )}

        {/* Relative timestamp */}
        {(note.updated || note.created) && (
          <p className="mt-3 text-[9px] text-[var(--text-muted)] text-right">
            {formatRelative(note.updated || note.created)}
          </p>
        )}
      </motion.div>

      {/* Long-press / right-click context menu */}
      {menuPos && (
        <ContextMenu
          isOpen={!!menuPos}
          position={menuPos}
          note={note}
          onClose={() => setMenuPos(null)}
          onTogglePin={onTogglePin}
          onToggleArchive={onToggleArchive}
          onChangeColor={onChangeColor}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
