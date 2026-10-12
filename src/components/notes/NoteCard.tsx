"use client";

import { useRef, useState } from 'react';
import { RecordModel } from 'pocketbase';
import { Pin, Circle, CheckCircle2, ListTodo, FileText, Archive, ArchiveRestore, Users } from 'lucide-react';
import { useChecklistPreview } from '@/lib/useChecklistPreview';
import { useIsSelected, useSelectionActive, useSelectionStore } from '@/store/useSelectionStore';
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { getNoteColorStyles } from '@/lib/colors';
import { hapticMedium } from '@/lib/haptics';
import ContextMenu from '@/components/ui/ContextMenu';
import { parseQuantity } from '@/lib/quantities';
import NoteContent from '@/components/notes/NoteContent';
import NoteImageCollage from '@/components/notes/NoteImageCollage';
import { NoteImageTile } from '@/components/notes/NoteImageGallery';

interface NoteCardProps {
  note: RecordModel;
  /** Images of this note, already sorted (see useRealtimeImages). */
  images?: RecordModel[];
  onClick: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onToggleShare: () => void;
  onDuplicate: () => void;
  onChangeColor: (color: string) => void;
  onDelete: () => void;
  /** Overview layout: full masonry card ('grid') or compact single row ('list'). */
  layout?: 'grid' | 'list';
}

const SWIPE_THRESHOLD = 90; // px the card must travel to fire the swipe action
const LONG_PRESS_MS = 400;
const MAX_PREVIEW_ITEMS = 6;
const MOVE_TOLERANCE = 10; // px of movement that cancels a long-press

export default function NoteCard({
  note,
  images = [],
  onClick,
  onTogglePin,
  onToggleArchive,
  onToggleShare,
  onDuplicate,
  onChangeColor,
  onDelete,
  layout = 'grid',
}: NoteCardProps) {
  // Aus dem gemeinsamen Store der Uebersicht statt eigener Abfrage je Karte.
  const items = useChecklistPreview(note.type === 'checklist' ? note.id : '');
  const colorStyles = getNoteColorStyles(note.color);
  // Mehrfachauswahl (Store, damit nur die betroffene Karte neu rendert).
  const selected = useIsSelected(note.id);
  const selecting = useSelectionActive();
  const toggleSelected = useSelectionStore((s) => s.toggle);
  const isList = layout === 'list';
  const completedCount = items.filter((i) => i.is_completed).length;

  // Swipe drag plumbing
  const x = useMotionValue(0);
  const pinRevealOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const archiveRevealOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);

  // Long-press / context-menu plumbing
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  // Android-Chrome feuert contextmenu auch bei Long-Press auf Touch; das
  // Kontextmenue gehoert aber nur zur Maus (Rechtsklick), Touch waehlt aus.
  const pointerTypeRef = useRef('mouse');

  const visibleItems = items.slice(0, MAX_PREVIEW_ITEMS);
  const openCount = items.length - completedCount;

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    longPressFired.current = false;
    pointerTypeRef.current = e.pointerType;
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      hapticMedium();
      toggleSelected(note.id);
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pressStart.current) return;
    const dx = Math.abs(e.clientX - pressStart.current.x);
    const dy = Math.abs(e.clientY - pressStart.current.y);
    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) clearLongPress();
  };

  const handleClick = (e: React.MouseEvent) => {
    // Suppress the open-tap that follows a long-press.
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    // Waehrend einer Auswahl waehlt jeder Tipp aus/ab; Strg/Cmd-Klick startet
    // sie am Desktop.
    if (selecting || e.ctrlKey || e.metaKey) {
      toggleSelected(note.id);
      return;
    }
    onClick();
  };

  const handleDragEnd = (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    // Wischen = archivieren (umkehrbar, fuer alle Nutzer erlaubt). Loeschen
    // bleibt im Kontextmenue, weil nur der Besitzer eine geteilte Notiz
    // loeschen darf und ein Wisch das nicht unterscheiden kann.
    if (info.offset.x <= -SWIPE_THRESHOLD) {
      hapticMedium();
      onToggleArchive();
    } else if (info.offset.x >= SWIPE_THRESHOLD) {
      hapticMedium();
      onTogglePin();
    }
  };

  const revealRound = 'rounded-2xl';

  return (
    <div className={`relative break-inside-avoid ${isList ? 'mb-2.5' : 'mb-3'}`}>
      {/* Swipe-right reveal: Pin (sits on the left, behind the card) */}
      <motion.div
        style={{ opacity: pinRevealOpacity }}
        className={`absolute inset-0 ${revealRound} bg-primary-strong flex items-center justify-start pl-6 text-white pointer-events-none`}
      >
        <Pin className="w-6 h-6 fill-current" />
      </motion.div>

      {/* Swipe-left reveal: Archive (sits on the right, behind the card) */}
      <motion.div
        style={{ opacity: archiveRevealOpacity }}
        className={`absolute inset-0 ${revealRound} bg-orange-500 flex items-center justify-end pr-6 text-white pointer-events-none`}
      >
        {note.is_archived ? <ArchiveRestore className="w-6 h-6" /> : <Archive className="w-6 h-6" />}
      </motion.div>

      {/* The draggable card — layoutId enables the card→editor morph */}
      <motion.div
        layoutId={`note-${note.id}`}
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        whileTap={{ scale: 0.98 }}
        drag={selecting ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7}
        onDragEnd={handleDragEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={clearLongPress}
        onClick={handleClick}
        role="button"
        aria-pressed={selecting ? selected : undefined}
        tabIndex={0}
        aria-label={note.title || (note.type === 'checklist' ? 'Unbenannte Liste' : 'Unbenannte Notiz')}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (selecting) toggleSelected(note.id);
            else onClick();
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (pointerTypeRef.current === 'mouse') setMenuPos({ x: e.clientX, y: e.clientY });
        }}
        className={`cursor-pointer border shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-elevated)] transition-shadow duration-300 relative overflow-hidden group select-none ${colorStyles.bg} ${selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-[var(--background)]' : ''} ${
          isList ? 'rounded-2xl p-3.5 flex items-center gap-3' : 'rounded-2xl p-3.5'
        }`}
        style={{ x, ...colorStyles.style }}
      >
        {/* Haken der Mehrfachauswahl (oben rechts, wie in Keep) */}
        {selected && (
          <span className="pointer-events-none absolute right-2.5 top-2.5 z-20 rounded-full bg-[var(--card-bg)]" aria-hidden="true">
            <CheckCircle2 className="h-6 w-6 text-primary fill-current [&>path:last-child]:stroke-white" />
          </span>
        )}

        {/* Glow Effect on Hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {isList ? (
          <>
            {/* Leading slot: the note's cover image if it has one, else the
                type icon. A row this compact only has space for one of them. */}
            {images.length > 0 ? (
              <NoteImageTile
                image={images[0]}
                className="shrink-0 w-9 h-9 rounded-xl border border-[var(--border-color)]"
              />
            ) : (
              <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-[var(--card-bg)]/60 border border-[var(--border-color)] ${colorStyles.icon}`}>
                {note.type === 'checklist' ? <ListTodo className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
              </div>
            )}

            {/* Title + one-line preview */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {note.is_pinned && <Pin className="w-3 h-3 text-primary fill-current shrink-0" />}
                <h3 className="font-bold text-sm text-[var(--text-primary)] truncate group-hover:text-primary transition-colors">
                  {note.title || (note.type === 'checklist' ? 'Liste' : 'Notiz')}
                </h3>
              </div>
              <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                {note.type === 'checklist'
                  ? items.length > 0
                    ? `${completedCount}/${items.length} erledigt`
                    : 'Leere Checkliste'
                  : String(note.content || '').replace(/\s*\n+\s*/g, ' ') || 'Leere Notiz'}
              </p>
            </div>

            {/* Meta */}
            {note.is_shared && (
              <span role="img" aria-label="Geteilt" title="Geteilt" className="shrink-0">
                <Users className="w-3.5 h-3.5 text-primary/80" />
              </span>
            )}
          </>
        ) : (
        <>
        {/* Image collage — bleeds to the card edges above the title (Keep style) */}
        <NoteImageCollage images={images} />

        {/* Pin Icon */}
        {note.is_pinned && (
          <div className={`absolute top-3.5 p-1.5 ${selected ? 'right-12' : 'right-3.5'} bg-[var(--card-bg)]/70 backdrop-blur-md rounded-lg text-primary shadow-sm border border-[var(--border-color)] z-10 transition-transform group-hover:scale-110`}>
            <Pin className="w-3.5 h-3.5 fill-current" />
          </div>
        )}

        {/* Title */}
        {note.title ? (
          <h3 className="font-semibold text-base mb-2.5 pr-6 text-[var(--text-primary)] leading-snug group-hover:text-primary transition-colors duration-200">
            {note.title}
          </h3>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase mb-3.5">
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
          <NoteContent
            text={note.content}
            className="text-[var(--text-secondary)] text-sm whitespace-pre-wrap line-clamp-8 leading-relaxed break-words"
          />
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
                <span className={`text-sm ${item.is_completed ? 'line-through text-[var(--text-muted)] font-normal' : 'text-[var(--text-secondary)] font-medium'} line-clamp-1 flex items-center gap-1.5 min-w-0 overflow-hidden`}>
                  {(() => {
                    const { quantity, text: restText } = parseQuantity(item.text);
                    if (quantity) {
                      return (
                        <>
                          <span className={`px-1 py-0.5 rounded text-[11px] font-bold bg-[var(--text-primary)]/8 text-[var(--text-secondary)] border border-[var(--border-color)] shrink-0 ${item.is_completed ? 'opacity-50' : ''}`}>
                            {quantity}
                          </span>
                          <span className="truncate">{restText}</span>
                        </>
                      );
                    }
                    return <span className="truncate">{item.text}</span>;
                  })()}
                </span>
              </div>
            ))}

            {items.length > MAX_PREVIEW_ITEMS && (
              <div className="pt-2.5 flex items-center gap-2">
                <div className="h-[1px] flex-1 bg-[var(--border-color)]"></div>
                <p className="text-[11px] font-extrabold text-[var(--text-muted)] uppercase tracking-widest bg-background/50 px-2 py-0.5 rounded-full border border-[var(--border-color)]">
                  + {items.length - MAX_PREVIEW_ITEMS} weitere
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

        {/* Fortschritt (offen/gesamt) und Geteilt-Symbol. Die Datenbank kennt kein
            created/updated, eine relative Zeit gibt es darum nicht. */}
        {((note.type === 'checklist' && items.length > 0) || note.is_shared) && (
          <div className="mt-2.5 flex items-center justify-between gap-2">
            {note.type === 'checklist' && items.length > 0 ? (
              <span
                className="text-xs font-semibold text-[var(--text-muted)]"
                aria-label={`${openCount} von ${items.length} offen`}
              >
                {openCount}/{items.length}
              </span>
            ) : (
              <span />
            )}
            {note.is_shared && (
              <span role="img" aria-label="Geteilt" title="Geteilt">
                <Users className="w-3.5 h-3.5 text-primary/80" />
              </span>
            )}
          </div>
        )}
        </>
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
          onToggleShare={onToggleShare}
          onDuplicate={onDuplicate}
          onChangeColor={onChangeColor}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
