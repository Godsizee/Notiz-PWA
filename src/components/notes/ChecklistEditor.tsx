import { useState, useEffect, useRef } from 'react';
import { RecordModel } from 'pocketbase';
import { pb } from '@/lib/pb';
import { Palette, Pin, Archive, Trash2, Plus, X, CheckCircle2, Circle, Check, RefreshCw, MoreVertical, Play, RotateCcw, CheckSquare } from 'lucide-react';
import { useRealtimeChecklist } from '@/lib/useRealtime';
import { getNoteColorStyles, NOTE_COLORS } from '@/lib/colors';
import { motion, AnimatePresence } from 'framer-motion';

interface ChecklistEditorProps {
  note?: RecordModel | null;
  onClose: () => void;
}

export default function ChecklistEditor({ note, onClose }: ChecklistEditorProps) {
  const [title, setTitle] = useState(note?.title || '');
  const [color, setColor] = useState(note?.color || 'white');
  const [isPinned, setIsPinned] = useState(note?.is_pinned || false);
  const [isArchived, setIsArchived] = useState(note?.is_archived || false);
  const [showPalette, setShowPalette] = useState(false);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | undefined>(note?.id);
  const [newItemText, setNewItemText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Local state for 450ms Visual Checkbox-Delay Engine
  const [togglingItems, setTogglingItems] = useState<Record<string, { is_completed: boolean; timer: NodeJS.Timeout }>>({});

  const { items } = useRealtimeChecklist(activeNoteId || '');
  const newItemInputRef = useRef<HTMLInputElement>(null);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      Object.values(togglingItems).forEach(t => clearTimeout(t.timer));
    };
  }, [togglingItems]);

  // Debounced auto-save for note properties (title, color, pinned, archived)
  useEffect(() => {
    const saveNote = async () => {
      // Don't save if it's completely empty and hasn't been created yet
      if (!activeNoteId && !title.trim()) return;

      const user = pb.authStore.model || pb.authStore.record;
      const data = {
        title: title || 'Unbenannte Liste',
        type: 'checklist',
        color,
        is_pinned: isPinned,
        is_archived: isArchived,
        owner: user?.id,
      };

      try {
        setIsSaving(true);
        if (activeNoteId) {
          await pb.collection('notes').update(activeNoteId, data);
        } else {
          const record = await pb.collection('notes').create(data);
          setActiveNoteId(record.id);
        }
      } catch (err) {
        console.error("Failed to auto-save checklist:", err);
      } finally {
        setTimeout(() => setIsSaving(false), 400);
      }
    };

    const timer = setTimeout(saveNote, 500);
    return () => clearTimeout(timer);
  }, [title, color, isPinned, isArchived, activeNoteId]);

  const ensureNoteExists = async () => {
    if (activeNoteId) return activeNoteId;
    
    const user = pb.authStore.model || pb.authStore.record;
    const record = await pb.collection('notes').create({
      title: title || 'Unbenannte Liste',
      type: 'checklist',
      color,
      is_pinned: isPinned,
      is_archived: isArchived,
      owner: user?.id,
    });
    setActiveNoteId(record.id);
    return record.id;
  };

  const handleAddItem = async () => {
    if (!newItemText.trim()) return;
    const noteId = await ensureNoteExists();

    try {
      await pb.collection('checklist_items').create({
        note: noteId,
        text: newItemText,
        is_completed: false,
        order: items.length,
      });
      setNewItemText('');
      // Refocus automatically to let mobile/desktop users quickly add more items
      setTimeout(() => {
        newItemInputRef.current?.focus();
      }, 50);
    } catch (err) {
      console.error("Failed to add checklist item:", err);
    }
  };

  const handleUpdateItem = async (itemId: string, text: string) => {
    try {
      await pb.collection('checklist_items').update(itemId, { text });
    } catch (err) {
      console.error("Failed to update item text:", err);
    }
  };

  // 450ms Visual Checkbox-Delay Engine Implementation
  // Instantly marks checked state locally to trigger checkboxes animation and text strikethrough,
  // then schedules a 450ms timeout before updating PocketBase. This halts abrupt list jumps.
  const handleToggleItem = (itemId: string, currentStatus: boolean) => {
    // If already in toggling state, clicking again cancels the timer (reverts instantly)
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
    
    const timer = setTimeout(async () => {
      try {
        await pb.collection('checklist_items').update(itemId, {
          is_completed: targetStatus
        });
        
        // Remove from toggling state once DB is updated and realtime subscription is on its way
        setTogglingItems(prev => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      } catch (err) {
        console.error("Failed to save checked status:", err);
        // Clean up on error to revert visual state
        setTogglingItems(prev => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      }
    }, 450); // 450ms delay for ideal visual transition feel

    setTogglingItems(prev => ({
      ...prev,
      [itemId]: { is_completed: targetStatus, timer }
    }));
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await pb.collection('checklist_items').delete(itemId);
    } catch (err) {
      console.error("Failed to delete checklist item:", err);
    }
  };

  const handleDeleteNote = async () => {
    if (activeNoteId) {
      try {
        await pb.collection('notes').delete(activeNoteId);
      } catch (err) {
        console.error("Failed to delete note:", err);
      }
    }
    onClose();
  };

  // BULK ACTIONS:
  // 1. Alle Haken entfernen (Reset for repetitive shopping trips)
  const handleResetAll = async () => {
    setShowBulkMenu(false);
    if (!activeNoteId) return;
    try {
      const promises = completedItems.map(item => 
        pb.collection('checklist_items').update(item.id, { is_completed: false })
      );
      await Promise.all(promises);
    } catch (err) {
      console.error("Failed to reset checklist items:", err);
    }
  };

  // 2. Abgehakte löschen (Clear away checked items)
  const handleDeleteCompleted = async () => {
    setShowBulkMenu(false);
    if (!activeNoteId) return;
    try {
      const promises = completedItems.map(item => 
        pb.collection('checklist_items').delete(item.id)
      );
      await Promise.all(promises);
    } catch (err) {
      console.error("Failed to delete completed checklist items:", err);
    }
  };

  // Filter items: items remain in their original filtered lists during the 450ms delay,
  // guaranteeing no list-shifting occurs until the database resolves the state.
  const activeItems = items.filter(i => !i.is_completed).sort((a, b) => a.order - b.order);
  const completedItems = items.filter(i => i.is_completed).sort((a, b) => a.order - b.order);
  
  const colorStyles = getNoteColorStyles(color);

  return (
    <div 
      className="flex flex-col h-full min-h-[60vh] rounded-t-3xl transition-colors duration-300 relative"
      style={colorStyles.style}
    >
      {/* Title Header */}
      <div className="p-6 pb-2">
        <input
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
        
        {/* Active Items list */}
        <AnimatePresence initial={false}>
          {activeItems.map((item) => {
            // Read visual status based on toggling state
            const isCompletedVisual = togglingItems[item.id] !== undefined
              ? togglingItems[item.id].is_completed
              : item.is_completed;

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center gap-3 group py-1.5"
              >
                {/* Tactical Checkbox Button */}
                <button 
                  onClick={() => handleToggleItem(item.id, item.is_completed)}
                  className="checkbox-animation text-[var(--text-muted)]/40 hover:text-primary transition-colors cursor-pointer shrink-0"
                >
                  {isCompletedVisual ? (
                    <CheckCircle2 className={`w-5 h-5 ${colorStyles.icon}`} />
                  ) : (
                    <Circle className="w-5 h-5" />
                  )}
                </button>

                {/* Item Text field */}
                <input
                  type="text"
                  className={`flex-1 bg-transparent border-none outline-none text-base md:text-lg text-[var(--text-primary)] transition-all ${isCompletedVisual ? 'line-through text-[var(--text-muted)]/60' : ''}`}
                  value={item.text}
                  onChange={(e) => handleUpdateItem(item.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      newItemInputRef.current?.focus();
                    }
                    if (e.key === 'Backspace' && item.text === '') {
                      e.preventDefault();
                      handleDeleteItem(item.id);
                    }
                  }}
                />

                {/* Single Delete Cross */}
                <button 
                  onClick={() => handleDeleteItem(item.id)}
                  className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 transition-all cursor-pointer p-1"
                  title="Eintrag entfernen"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Quick Add Row */}
        <div className="flex items-center gap-3 py-2 border-t border-[var(--border-color)]">
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
                  const isCompletedVisual = togglingItems[item.id] !== undefined
                    ? togglingItems[item.id].is_completed
                    : item.is_completed;

                  return (
                    <motion.div 
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="flex items-center gap-3 py-1.5 group"
                    >
                      {/* Checkbox */}
                      <button 
                        onClick={() => handleToggleItem(item.id, item.is_completed)} 
                        className={`checkbox-animation transition-colors cursor-pointer shrink-0 ${colorStyles.icon}`}
                      >
                        {isCompletedVisual ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <Circle className="w-5 h-5 text-[var(--text-muted)]/40" />
                        )}
                      </button>
                      
                      {/* Text */}
                      <span className={`flex-1 text-base md:text-lg text-[var(--text-primary)] transition-all ${isCompletedVisual ? 'line-through text-[var(--text-muted)]/60' : ''}`}>
                        {item.text}
                      </span>
                      
                      {/* Delete */}
                      <button 
                        onClick={() => handleDeleteItem(item.id)} 
                        className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)] hover:text-red-500 transition-all cursor-pointer p-1"
                        title="Eintrag löschen"
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
      <div className="absolute bottom-6 left-6 right-6 h-14 bg-card/85 backdrop-blur-xl border border-[var(--border-color)] rounded-2xl shadow-2xl flex items-center justify-between px-4 z-50">
        
        {/* Left Actions */}
        <div className="flex items-center gap-3.5 relative">
          
          {/* Palette button */}
          <button 
            onClick={() => { setShowPalette(!showPalette); setShowBulkMenu(false); }} 
            className="w-10 h-10 rounded-xl hover:bg-[var(--background)]/80 flex items-center justify-center transition-colors text-[var(--text-secondary)] cursor-pointer"
            title="Farbe ändern"
          >
            <Palette size={19} />
          </button>
          
          {/* Color choice popover */}
          <AnimatePresence>
            {showPalette && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-16 left-0 bg-card border border-[var(--border-color)] shadow-2xl rounded-2xl p-3 flex gap-2.5 z-[60]"
              >
                {NOTE_COLORS.map(c => (
                  <button
                    key={c.id}
                    className="w-8 h-8 rounded-full border border-black/5 shadow-inner transition-transform hover:scale-115 relative flex items-center justify-center cursor-pointer"
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

          <div className="h-6 w-[1px] bg-[var(--border-color)] mx-0.5"></div>

          {/* Pin Button */}
          <button 
            onClick={() => setIsPinned(!isPinned)} 
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${isPinned ? 'bg-primary/10 text-primary' : 'text-[var(--text-secondary)] hover:bg-[var(--background)]/80'}`}
            title="Liste anpinnen"
          >
            <Pin size={19} className={isPinned ? 'fill-current' : ''} />
          </button>
          
          {/* Archive Button */}
          <button 
            onClick={() => setIsArchived(!isArchived)} 
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${isArchived ? 'bg-orange-500/10 text-orange-500' : 'text-[var(--text-secondary)] hover:bg-[var(--background)]/80'}`}
            title="Archivieren"
          >
            <Archive size={19} />
          </button>
        </div>

        {/* Right Actions, Status & Bulk menu */}
        <div className="flex items-center gap-3 relative">
          
          {/* Save Status Indicator */}
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider bg-[var(--background)]/50 px-2.5 py-1 rounded-full border border-[var(--border-color)]">
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

          <div className="h-6 w-[1px] bg-[var(--border-color)] mx-0.5"></div>

          {/* Bulk Action Toggle Button */}
          <button 
            onClick={() => { setShowBulkMenu(!showBulkMenu); setShowPalette(false); }}
            className={`w-10 h-10 rounded-xl hover:bg-[var(--background)]/80 flex items-center justify-center transition-colors cursor-pointer ${showBulkMenu ? 'bg-primary/10 text-primary' : 'text-[var(--text-secondary)]'}`}
            title="Aktionen"
          >
            <MoreVertical size={19} />
          </button>

          {/* Bulk Dropdown Popover */}
          <AnimatePresence>
            {showBulkMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-16 right-0 bg-card border border-[var(--border-color)] shadow-2xl rounded-2xl p-2 flex flex-col gap-1 z-[60] min-w-[200px]"
              >
                {/* Reset Action */}
                <button
                  onClick={handleResetAll}
                  disabled={completedItems.length === 0}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--background)]/80 transition-colors cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RotateCcw className="w-4 h-4 text-primary" />
                  <span>Alle Haken entfernen</span>
                </button>

                {/* Delete Checked Action */}
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

          <div className="h-6 w-[1px] bg-[var(--border-color)] mx-0.5"></div>

          {/* Delete List Button */}
          <button 
            onClick={handleDeleteNote} 
            className="w-10 h-10 rounded-xl hover:bg-red-500/10 flex items-center justify-center text-red-500 transition-colors cursor-pointer"
            title="Liste löschen"
          >
            <Trash2 size={19} />
          </button>
        </div>
      </div>
    </div>
  );
}
