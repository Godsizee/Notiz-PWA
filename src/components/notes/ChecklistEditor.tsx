"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { RecordModel } from 'pocketbase';
import { pb } from '@/lib/pb';
import { Palette, Pin, Archive, Trash2, Plus, X, CheckCircle2, Circle, Check, RefreshCw, MoreVertical, RotateCcw, GripVertical, Users } from 'lucide-react';
import { useRealtimeChecklist } from '@/lib/useRealtime';
import { applyChange, newRecordId, isAbortError } from '@/lib/sync';
import { usePresence } from '@/lib/usePresence';
import { getNoteColorStyles, NOTE_COLORS } from '@/lib/colors';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { hapticLight, hapticHeavy } from '@/lib/haptics';
import { parseQuantity } from '@/lib/quantities';
import { useToastStore } from '@/store/useToastStore';
import ConfettiBurst from '@/components/ui/ConfettiBurst';

const UNDO_DELETE_MS = 5000;

interface ChecklistEditorProps {
  note?: RecordModel | null;
  onClose: () => void;
  /** When provided, deleting routes through the app's soft-delete + undo toast. */
  onRequestDelete?: (noteId: string) => void;
}

// A single reorderable active item. Drag is restricted to the grip handle so
// the text input and checkbox stay tappable.
interface ActiveRowProps {
  item: RecordModel;
  isCompletedVisual: boolean;
  iconClass: string;
  registerRef: (id: string, el: HTMLInputElement | null) => void;
  onToggle: (id: string, current: boolean) => void;
  onUpdateText: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onEnter: (item: RecordModel) => void;
  onBackspaceEmpty: (item: RecordModel) => void;
}

function ActiveChecklistRow({
  item,
  isCompletedVisual,
  iconClass,
  registerRef,
  onToggle,
  onUpdateText,
  onDelete,
  onEnter,
  onBackspaceEmpty,
}: ActiveRowProps) {
  const controls = useDragControls();
  const [isFocused, setIsFocused] = useState(false);
  const { quantity, text: restText } = parseQuantity(item.text);

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      layoutId={item.id}
      whileDrag={{ scale: 1.02, boxShadow: '0 10px 30px -12px rgba(0,0,0,0.35)' }}
      className="flex items-center gap-2 group py-1.5 bg-transparent rounded-xl"
    >
      {/* Drag handle */}
      <button
        onPointerDown={(e) => controls.start(e)}
        className="touch-none cursor-grab active:cursor-grabbing text-[var(--text-muted)]/30 hover:text-[var(--text-muted)] transition-colors shrink-0 p-0.5"
        title="Zum Sortieren ziehen"
        aria-label="Eintrag verschieben"
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {/* Checkbox */}
      <button
        onClick={() => onToggle(item.id, item.is_completed)}
        className="tap-target checkbox-animation text-[var(--text-muted)]/40 hover:text-primary transition-colors cursor-pointer shrink-0"
        aria-label={isCompletedVisual ? 'Als offen markieren' : 'Als erledigt markieren'}
      >
        {isCompletedVisual ? (
          <CheckCircle2 className={`w-5 h-5 ${iconClass}`} />
        ) : (
          <Circle className="w-5 h-5" />
        )}
      </button>

      {/* Text field */}
      <div className="flex-1 relative flex items-center min-w-0">
        {!isFocused && quantity && (
          <div className="absolute inset-0 flex items-center gap-2 pointer-events-none text-base md:text-lg text-[var(--text-primary)] overflow-hidden">
            <span className="px-1.5 py-0.5 rounded-md text-xs font-bold bg-[var(--text-primary)]/8 text-[var(--text-secondary)] border border-[var(--border-color)] shrink-0">
              {quantity}
            </span>
            <span className={`truncate ${isCompletedVisual ? 'line-through text-[var(--text-muted)]/60' : ''}`}>
              {restText}
            </span>
          </div>
        )}
        <input
          ref={(el) => registerRef(item.id, el)}
          type="text"
          className={`w-full bg-transparent border-none outline-none text-base md:text-lg text-[var(--text-primary)] transition-all ${isCompletedVisual ? 'line-through text-[var(--text-muted)]/60' : ''} ${!isFocused && quantity ? 'text-transparent selection:text-transparent' : ''}`}
          value={item.text}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onChange={(e) => onUpdateText(item.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onEnter(item);
            }
            if (e.key === 'Backspace' && item.text === '') {
              e.preventDefault();
              onBackspaceEmpty(item);
            }
          }}
        />
      </div>

      {/* Delete cross */}
      <button
        onClick={() => onDelete(item.id)}
        className="tap-target opacity-100 md:opacity-0 md:group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 active:scale-90 transition-all cursor-pointer shrink-0"
        title="Eintrag entfernen"
        aria-label="Eintrag entfernen"
      >
        <X className="w-4 h-4" />
      </button>
    </Reorder.Item>
  );
}

export default function ChecklistEditor({ note, onClose, onRequestDelete }: ChecklistEditorProps) {
  const [title, setTitle] = useState(note?.title || '');
  const [color, setColor] = useState(note?.color || 'white');
  const [isPinned, setIsPinned] = useState(note?.is_pinned || false);
  const [isArchived, setIsArchived] = useState(note?.is_archived || false);
  const [isShared, setIsShared] = useState(note?.is_shared || false);
  const [showPalette, setShowPalette] = useState(false);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | undefined>(note?.id);
  const [newItemText, setNewItemText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  // Local state for 450ms Visual Checkbox-Delay Engine
  const [togglingItems, setTogglingItems] = useState<Record<string, { is_completed: boolean; timer: NodeJS.Timeout }>>({});

  // Micro-Delight: increments when the last open item gets checked → each
  // new key mounts a fresh ConfettiBurst.
  const [confettiKey, setConfettiKey] = useState(0);

  const { items, setItems } = useRealtimeChecklist(activeNoteId || '');
  const { others } = usePresence(activeNoteId);
  const showToast = useToastStore((s) => s.showToast);

  const notifyError = (message: string) => {
    showToast({ message, tone: 'danger', duration: 3500 });
  };

  // Refs for unmount-cleanup (always hold latest values without re-registering the effect)
  const activeNoteIdRef = useRef<string | undefined>(note?.id);
  const titleRef = useRef(note?.title || '');
  const itemsRef = useRef(items);
  const colorRef = useRef(note?.color || 'white');
  const isPinnedRef = useRef(note?.is_pinned || false);
  const isArchivedRef = useRef(note?.is_archived || false);
  const isSharedRef = useRef(note?.is_shared || false);
  useEffect(() => { activeNoteIdRef.current = activeNoteId; }, [activeNoteId]);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { isPinnedRef.current = isPinned; }, [isPinned]);
  useEffect(() => { isArchivedRef.current = isArchived; }, [isArchived]);
  useEffect(() => { isSharedRef.current = isShared; }, [isShared]);

  // Ghost-Note-Cleanup: delete silently if closed with no title and no items
  useEffect(() => {
    return () => {
      const id = activeNoteIdRef.current;
      if (id && !titleRef.current.trim() && itemsRef.current.length === 0) {
        applyChange({ collection: 'notes', action: 'delete', id }).catch(() => {});
      }
    };
  }, []);
  const newItemInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const itemInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const registerRef = (id: string, el: HTMLInputElement | null) => {
    itemInputRefs.current[id] = el;
  };

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      Object.values(togglingItems).forEach(t => clearTimeout(t.timer));
    };
  }, [togglingItems]);

  // Focus an item input once it actually exists in the synced list (used by
  // the Enter-insert and Backspace-delete focus chain).
  useEffect(() => {
    if (!pendingFocusId) return;
    const el = itemInputRefs.current[pendingFocusId];
    if (el) {
      el.focus();
      setPendingFocusId(null);
    }
  }, [items, pendingFocusId]);

  // Debounced auto-save for note properties (title, color, pinned, archived).
  // The pending timer lives in a ref so it can be flushed early (see effect
  // below) instead of silently dropping the last edit on a quick close.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const performSave = useCallback(async () => {
    const id = activeNoteIdRef.current;
    if (!id && !titleRef.current.trim()) return;

    const user = pb.authStore.model || pb.authStore.record;
    const data = {
      title: titleRef.current || 'Unbenannte Liste',
      type: 'checklist',
      color: colorRef.current,
      is_pinned: isPinnedRef.current,
      is_archived: isArchivedRef.current,
      is_shared: isSharedRef.current,
      owner: user?.id,
    };

    try {
      setIsSaving(true);
      if (id) {
        await applyChange({ collection: 'notes', action: 'update', id, data });
      } else {
        const record = await applyChange({
          collection: 'notes',
          action: 'create',
          id: newRecordId(),
          data,
        });
        activeNoteIdRef.current = record.id;
        setActiveNoteId(record.id);
      }
    } catch (err) {
      console.error("Failed to auto-save checklist:", err);
    } finally {
      setTimeout(() => setIsSaving(false), 400);
    }
  }, []);

  useEffect(() => {
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      performSave();
    }, 500);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [title, color, isPinned, isArchived, activeNoteId, performSave]);

  // Flush a still-pending save immediately on tab-hide/close/unmount so a
  // quick edit-then-leave doesn't drop the last 500ms of typing.
  useEffect(() => {
    const flushPending = () => {
      if (!saveTimerRef.current) return;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      performSave();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushPending();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flushPending);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flushPending);
      flushPending();
    };
  }, [performSave]);

  const ensureNoteExists = async () => {
    if (activeNoteId) return activeNoteId;

    const user = pb.authStore.model || pb.authStore.record;
    const record = await applyChange({
      collection: 'notes',
      action: 'create',
      id: newRecordId(),
      data: {
        title: title || 'Unbenannte Liste',
        type: 'checklist',
        color,
        is_pinned: isPinned,
        is_archived: isArchived,
        is_shared: isShared,
        owner: user?.id,
      },
    });
    setActiveNoteId(record.id);
    return record.id;
  };

  const nextOrder = () => items.reduce((max, i) => Math.max(max, i.order ?? 0), -1) + 1;

  const handleAddItem = async () => {
    if (!newItemText.trim()) return;
    const noteId = await ensureNoteExists();

    try {
      const record = await applyChange({
        collection: 'checklist_items',
        action: 'create',
        id: newRecordId(),
        data: {
          note: noteId,
          text: newItemText,
          is_completed: false,
          order: nextOrder(),
        },
      });
      setItems(prev => {
        if (prev.some(i => i.id === record.id)) return prev;
        return [...prev, record].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      });
      setNewItemText('');
      setTimeout(() => newItemInputRef.current?.focus(), 50);
    } catch (err) {
      console.error("Failed to add checklist item:", err);
      notifyError("Eintrag konnte nicht hinzugefügt werden.");
    }
  };

  // Enter on an existing item → insert a new empty item directly below it,
  // using a fractional order so no bulk reindex is needed, then focus it.
  const handleInsertBelow = async (currentItem: RecordModel) => {
    const noteId = await ensureNoteExists();
    const idx = activeItems.findIndex(i => i.id === currentItem.id);
    const next = activeItems[idx + 1];
    const curOrder = currentItem.order ?? 0;
    const newOrder = next ? (curOrder + (next.order ?? curOrder + 2)) / 2 : curOrder + 1;

    try {
      const record = await applyChange({
        collection: 'checklist_items',
        action: 'create',
        id: newRecordId(),
        data: {
          note: noteId,
          text: '',
          is_completed: false,
          order: newOrder,
        },
      });
      setItems(prev => {
        if (prev.some(i => i.id === record.id)) return prev;
        return [...prev, record].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      });
      setPendingFocusId(record.id);
    } catch (err) {
      console.error("Failed to insert checklist item:", err);
      notifyError("Eintrag konnte nicht eingefügt werden.");
    }
  };

  // Backspace on an empty item → delete it and focus the previous item.
  const handleBackspaceEmpty = (item: RecordModel) => {
    const idx = activeItems.findIndex(i => i.id === item.id);
    const prev = activeItems[idx - 1];
    handleDeleteItem(item.id);
    if (prev) {
      setPendingFocusId(prev.id);
    } else {
      titleInputRef.current?.focus();
    }
  };

  const handleUpdateItem = async (itemId: string, text: string) => {
    // Optimistic local update keeps the input responsive between realtime echoes.
    setItems(prev => prev.map(i => (i.id === itemId ? { ...i, text } : i)));
    try {
      // `note` is included so offline-merged records always carry the relation.
      await applyChange({
        collection: 'checklist_items',
        action: 'update',
        id: itemId,
        data: { note: activeNoteId, text },
      });
    } catch (err) {
      console.error("Failed to update item text:", err);
      notifyError("Änderung konnte nicht gespeichert werden.");
    }
  };

  // Drag-reorder: optimistic local order update, then persist changed orders.
  const handleReorder = (newOrder: RecordModel[]) => {
    hapticLight();
    setItems(prev => {
      const completed = prev.filter(i => i.is_completed);
      const reordered = newOrder.map((it, idx) => ({ ...it, order: idx }));
      return [...reordered, ...completed];
    });
    let reorderFailed = false;
    newOrder.forEach((it, idx) => {
      if ((it.order ?? -1) !== idx) {
        applyChange({
          collection: 'checklist_items',
          action: 'update',
          id: it.id,
          data: { note: activeNoteId, order: idx },
        })
          .catch(err => {
            console.error("Failed to persist reorder:", err);
            if (!reorderFailed) {
              reorderFailed = true;
              notifyError("Sortierung konnte nicht gespeichert werden.");
            }
          });
      }
    });
  };

  // Commit/undo debounce: tapping the same checkbox again within 450ms
  // cancels the pending change entirely. The visible state (checkmark +
  // which section the item sits in, via visualCompletion below) flips the
  // instant you tap — this timer only delays the actual network write.
  const handleToggleItem = (itemId: string, currentStatus: boolean) => {
    hapticLight();
    if (togglingItems[itemId]) {
      clearTimeout(togglingItems[itemId].timer);
      setTogglingItems(prev => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      return;
    }

    const targetStatus = !currentStatus;

    // Letzter visuell offener Eintrag wird abgehakt → kleine Feier.
    if (targetStatus) {
      const visuallyOpen = activeItems.filter((i) => !togglingItems[i.id]?.is_completed);
      if (visuallyOpen.length === 1 && visuallyOpen[0].id === itemId) {
        hapticHeavy();
        setConfettiKey((k) => k + 1);
      }
    }

    const timer = setTimeout(async () => {
      try {
        await applyChange({
          collection: 'checklist_items',
          action: 'update',
          id: itemId,
          data: { note: activeNoteId, is_completed: targetStatus },
        });

        setTogglingItems(prev => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      } catch (err) {
        setTogglingItems(prev => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
        // Auto-cancelled by a newer request — not a real failure, stay quiet.
        // (Belt-and-suspenders: applyChange's requestKey: null should already
        // prevent this from ever firing for this call.)
        if (isAbortError(err)) return;
        console.error("Failed to save checked status:", err);
        notifyError("Status konnte nicht gespeichert werden.");
      }
    }, 450);

    setTogglingItems(prev => ({
      ...prev,
      [itemId]: { is_completed: targetStatus, timer }
    }));
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await applyChange({ collection: 'checklist_items', action: 'delete', id: itemId });
    } catch (err) {
      console.error("Failed to delete checklist item:", err);
      notifyError("Eintrag konnte nicht gelöscht werden.");
    }
  };

  const handleDeleteNote = () => {
    // Route through the app-level soft-delete + undo toast when available.
    if (activeNoteId && onRequestDelete) {
      onRequestDelete(activeNoteId);
      return;
    }
    if (activeNoteId) {
      applyChange({ collection: 'notes', action: 'delete', id: activeNoteId }).catch(err =>
        console.error("Failed to delete note:", err)
      );
    }
    onClose();
  };

  // BULK ACTIONS
  const handleResetAll = async () => {
    setShowBulkMenu(false);
    if (!activeNoteId) return;
    try {
      const promises = completedItems.map(item =>
        applyChange({
          collection: 'checklist_items',
          action: 'update',
          id: item.id,
          data: { note: activeNoteId, is_completed: false },
        })
      );
      await Promise.all(promises);
    } catch (err) {
      console.error("Failed to reset checklist items:", err);
      notifyError("Haken konnten nicht entfernt werden.");
    }
  };

  // Soft-delete with a 5s undo window before the real PocketBase delete —
  // mirrors page.tsx's requestDeleteNote so "Abgehakte löschen" isn't an
  // irreversible trap for an accidental tap.
  const [pendingDeleteItemIds, setPendingDeleteItemIds] = useState<Set<string>>(new Set());
  const bulkDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDeleteItemIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { pendingDeleteItemIdsRef.current = pendingDeleteItemIds; }, [pendingDeleteItemIds]);

  const commitBulkDelete = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      await Promise.all(
        ids.map(id => applyChange({ collection: 'checklist_items', action: 'delete', id }))
      );
    } catch (err) {
      console.error("Failed to delete completed checklist items:", err);
      notifyError("Abgehakte konnten nicht gelöscht werden.");
    }
    setPendingDeleteItemIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the editor closes (sheet dismissed) while a bulk delete is still
  // pending, commit it immediately instead of losing the timer — the same
  // "phantom revival" bug class just fixed for whole-note deletes.
  useEffect(() => {
    return () => {
      if (bulkDeleteTimerRef.current) {
        clearTimeout(bulkDeleteTimerRef.current);
        bulkDeleteTimerRef.current = null;
        commitBulkDelete(Array.from(pendingDeleteItemIdsRef.current));
      }
    };
  }, [commitBulkDelete]);

  const handleDeleteCompleted = () => {
    setShowBulkMenu(false);
    const ids = completedItems.map(item => item.id);
    if (ids.length === 0) return;

    hapticHeavy();
    setPendingDeleteItemIds(prev => new Set([...prev, ...ids]));

    bulkDeleteTimerRef.current = setTimeout(() => {
      bulkDeleteTimerRef.current = null;
      commitBulkDelete(ids);
    }, UNDO_DELETE_MS);

    showToast({
      message: `${ids.length} abgehakte Einträge gelöscht`,
      actionLabel: "Rückgängig",
      tone: "danger",
      duration: UNDO_DELETE_MS,
      onAction: () => {
        if (bulkDeleteTimerRef.current) {
          clearTimeout(bulkDeleteTimerRef.current);
          bulkDeleteTimerRef.current = null;
        }
        setPendingDeleteItemIds(prev => {
          const next = new Set(prev);
          ids.forEach(id => next.delete(id));
          return next;
        });
        hapticLight();
      },
    });
  };

  // Visual completion respects an in-flight toggle immediately, so an item
  // jumps to the other section the instant it's tapped instead of waiting for
  // the debounced write below to resolve (see handleToggleItem).
  const visualCompletion = (item: RecordModel) =>
    togglingItems[item.id] !== undefined ? togglingItems[item.id].is_completed : item.is_completed;

  const visibleItems = items.filter(i => !pendingDeleteItemIds.has(i.id));
  const activeItems = visibleItems.filter(i => !visualCompletion(i)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const completedItems = visibleItems.filter(i => visualCompletion(i)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const colorStyles = getNoteColorStyles(color);

  return (
    <div
      className="flex flex-col h-full min-h-[60vh] rounded-t-3xl transition-colors duration-300 relative"
      style={colorStyles.style}
    >
      {/* Micro-Delight: Konfetti, wenn der letzte offene Eintrag abgehakt wird */}
      {confettiKey > 0 && <ConfettiBurst key={confettiKey} />}

      {/* Title Header */}
      <div className="p-6 pb-2">
        {/* Realtime presence — shows collaborators currently viewing this list */}
        <AnimatePresence>
          {others.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-center gap-2 mb-2"
            >
              <div className="flex -space-x-2">
                {others.map((p) => {
                  const email: string = p.expand?.user?.email || '?';
                  return (
                    <div
                      key={p.id}
                      title={`${email} bearbeitet gerade`}
                      className="w-6 h-6 rounded-full bg-gradient-to-tr from-primary to-purple-500 text-white flex items-center justify-center text-[10px] font-bold border border-[var(--card-bg)] shadow-sm"
                    >
                      {email[0]?.toUpperCase()}
                    </div>
                  );
                })}
              </div>
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-green-500 uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Bearbeitet gerade
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={titleInputRef}
          type="text"
          placeholder="Titel der Liste"
          className="w-full text-2xl font-extrabold bg-transparent border-none outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)]/40"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              newItemInputRef.current?.focus();
            }
          }}
        />
      </div>

      {/* Checklist Body (Scrollable) */}
      <div className="flex-1 overflow-y-auto px-6 space-y-1 pb-32">

        {/* Active Items list (reorderable) */}
        <Reorder.Group axis="y" values={activeItems} onReorder={handleReorder} className="space-y-1">
          {activeItems.map((item) => {
            const isCompletedVisual = visualCompletion(item);

            return (
              <ActiveChecklistRow
                key={item.id}
                item={item}
                isCompletedVisual={isCompletedVisual}
                iconClass={colorStyles.icon}
                registerRef={registerRef}
                onToggle={handleToggleItem}
                onUpdateText={handleUpdateItem}
                onDelete={handleDeleteItem}
                onEnter={handleInsertBelow}
                onBackspaceEmpty={handleBackspaceEmpty}
              />
            );
          })}
        </Reorder.Group>

        {/* Quick Add Row */}
        <div className="flex items-center gap-3 py-2 border-t border-[var(--border-color)] mt-1">
          <div className="w-5 h-5 flex items-center justify-center text-[var(--text-muted)]/30 shrink-0">
            <Plus className="w-4.5 h-4.5" />
          </div>
          <input
            ref={newItemInputRef}
            type="text"
            placeholder="Neuer Eintrag..."
            className="flex-1 bg-transparent border-none outline-none text-base md:text-lg text-[var(--text-primary)] placeholder-[var(--text-muted)]/40 py-1"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddItem();
              }
            }}
          />
        </div>

        {/* Completed Items Section */}
        {completedItems.length > 0 && (
          <div className="mt-8 pt-4">
            <h4 className="text-[10px] font-extrabold text-[var(--text-muted)] tracking-widest uppercase mb-3 flex items-center gap-2">
              <span className="h-[1px] flex-1 bg-[var(--border-color)]"></span>
              Erledigt ({completedItems.length})
              <span className="h-[1px] flex-1 bg-[var(--border-color)]"></span>
            </h4>

            <div className="space-y-1 opacity-70">
              <AnimatePresence initial={false}>
                {completedItems.map((item) => {
                  const isCompletedVisual = visualCompletion(item);

                  return (
                    <motion.div
                      key={item.id}
                      layoutId={item.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="flex items-center gap-3 py-1.5 group"
                    >
                      <button
                        onClick={() => handleToggleItem(item.id, item.is_completed)}
                        className={`tap-target checkbox-animation transition-colors cursor-pointer shrink-0 ${colorStyles.icon}`}
                        aria-label={isCompletedVisual ? 'Als offen markieren' : 'Als erledigt markieren'}
                      >
                        {isCompletedVisual ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <Circle className="w-5 h-5 text-[var(--text-muted)]/40" />
                        )}
                      </button>

                      <span className={`flex-1 text-base md:text-lg text-[var(--text-primary)] transition-all ${isCompletedVisual ? 'line-through text-[var(--text-muted)]/60' : ''} flex items-center gap-2 min-w-0 overflow-hidden`}>
                        {(() => {
                          const { quantity, text: restText } = parseQuantity(item.text);
                          if (quantity) {
                            return (
                              <>
                                <span className="px-1.5 py-0.5 rounded-md text-xs font-bold bg-[var(--text-primary)]/8 text-[var(--text-secondary)] border border-[var(--border-color)] shrink-0 opacity-60">
                                  {quantity}
                                </span>
                                <span className="truncate">{restText}</span>
                              </>
                            );
                          }
                          return <span className="truncate">{item.text}</span>;
                        })()}
                      </span>

                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="tap-target opacity-100 md:opacity-0 md:group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 active:scale-90 transition-all cursor-pointer"
                        title="Eintrag löschen"
                        aria-label="Eintrag löschen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* Floating Design & Bulk Action Toolbar */}
      <div
        className="absolute bottom-4 left-3 right-3 sm:bottom-6 sm:left-6 sm:right-6 h-14 bg-[var(--card-bg)]/85 backdrop-blur-xl border border-[var(--border-color)] rounded-2xl shadow-[var(--shadow-elevated)] flex items-center justify-between px-2 sm:px-4 z-50"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >

        {/* Left Actions */}
        <div className="flex items-center gap-1 sm:gap-3.5 relative">

          <button
            onClick={() => { setShowPalette(!showPalette); setShowBulkMenu(false); }}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl hover:bg-[var(--background)]/80 flex items-center justify-center transition-colors text-[var(--text-secondary)] cursor-pointer"
            title="Farbe ändern"
          >
            <Palette size={19} />
          </button>

          <AnimatePresence>
            {showPalette && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-16 left-0 bg-[var(--card-bg)] border border-[var(--border-color)] shadow-[var(--shadow-elevated)] rounded-2xl p-3 flex flex-wrap gap-2 max-w-[min(18rem,calc(100vw-1.5rem))] z-[60]"
              >
                {NOTE_COLORS.map(c => (
                  <button
                    key={c.id}
                    className="w-7 h-7 rounded-full border border-black/10 shadow-inner transition-transform hover:scale-115 relative flex items-center justify-center cursor-pointer"
                    style={{ backgroundColor: c.hex }}
                    onClick={() => { setColor(c.hex); setShowPalette(false); }}
                    title={c.label}
                  >
                    {color === c.hex && (
                      <Check className="w-4 h-4 text-slate-800" />
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="h-6 w-px bg-[var(--border-color)] mx-0.5"></div>

          <button
            onClick={() => setIsPinned(!isPinned)}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${isPinned ? 'bg-primary/10 text-primary' : 'text-[var(--text-secondary)] hover:bg-[var(--background)]/80'}`}
            title="Liste anpinnen"
          >
            <Pin size={19} className={isPinned ? 'fill-current' : ''} />
          </button>

          <button
            onClick={() => setIsArchived(!isArchived)}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${isArchived ? 'bg-orange-500/10 text-orange-500' : 'text-[var(--text-secondary)] hover:bg-[var(--background)]/80'}`}
            title="Archivieren"
          >
            <Archive size={19} />
          </button>

          <button
            onClick={() => setIsShared(!isShared)}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${isShared ? 'bg-primary/10 text-primary' : 'text-[var(--text-secondary)] hover:bg-[var(--background)]/80'}`}
            title={isShared ? 'Nicht mehr teilen' : 'Mit Partner teilen'}
          >
            <Users size={19} />
          </button>
        </div>

        {/* Right Actions, Status & Bulk menu */}
        <div className="flex items-center gap-1 sm:gap-3 relative">

          {/* Save status — collapses to an icon on very narrow screens */}
          <div className="hidden xs:flex items-center gap-1.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider bg-[var(--background)]/50 px-2.5 py-1 rounded-full border border-[var(--border-color)]">
            {isSaving ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                <span>Auto-save...</span>
              </>
            ) : (
              <>
                <Check className="w-3 h-3 text-green-500" />
                <span>Gespeichert</span>
              </>
            )}
          </div>

          <div className="hidden xs:block h-6 w-px bg-[var(--border-color)] mx-0.5"></div>

          <button
            onClick={() => { setShowBulkMenu(!showBulkMenu); setShowPalette(false); }}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl hover:bg-[var(--background)]/80 flex items-center justify-center transition-colors cursor-pointer ${showBulkMenu ? 'bg-primary/10 text-primary' : 'text-[var(--text-secondary)]'}`}
            title="Aktionen"
          >
            <MoreVertical size={19} />
          </button>

          <AnimatePresence>
            {showBulkMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-16 right-0 bg-card border border-[var(--border-color)] shadow-2xl rounded-2xl p-2 flex flex-col gap-1 z-[60] min-w-[200px]"
              >
                <button
                  onClick={handleResetAll}
                  disabled={completedItems.length === 0}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--background)]/80 transition-colors cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-4 h-4 text-primary" />
                  <span>Alle Haken entfernen</span>
                </button>

                <button
                  onClick={handleDeleteCompleted}
                  disabled={completedItems.length === 0}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-500/5 transition-colors cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                  <span>Abgehakte löschen</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="hidden xs:block h-6 w-px bg-[var(--border-color)] mx-0.5"></div>

          <button
            onClick={handleDeleteNote}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl hover:bg-red-500/10 flex items-center justify-center text-red-500 transition-colors cursor-pointer"
            title="Liste löschen"
          >
            <Trash2 size={19} />
          </button>
        </div>
      </div>
    </div>
  );
}
