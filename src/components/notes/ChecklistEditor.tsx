import { useState, useEffect, useRef } from 'react';
import { RecordModel } from 'pocketbase';
import { pb } from '@/lib/pb';
import { Palette, Pin, Archive, Trash2, Plus, X, CheckCircle2, Circle } from 'lucide-react';
import { useRealtimeChecklist } from '@/lib/useRealtime';
import { motion, AnimatePresence } from 'framer-motion';

interface ChecklistEditorProps {
  note?: RecordModel | null;
  onClose: () => void;
}

const COLORS = [
  '#ffffff', 
  '#E3F2FD', // Pastel Blue
  '#E8F5E9', // Pastel Green
  '#FFFDE7', // Pastel Yellow
  '#FCE4EC', // Pastel Pink
  '#F3E5F5', // Pastel Purple
  '#FFF3E0'  // Pastel Orange
];

export default function ChecklistEditor({ note, onClose }: ChecklistEditorProps) {
  const [title, setTitle] = useState(note?.title || '');
  const [color, setColor] = useState(note?.color || '#ffffff');
  const [isPinned, setIsPinned] = useState(note?.is_pinned || false);
  const [isArchived, setIsArchived] = useState(note?.is_archived || false);
  const [showPalette, setShowPalette] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | undefined>(note?.id);
  const [newItemText, setNewItemText] = useState('');
  
  const { items } = useRealtimeChecklist(activeNoteId || '');

  // Debounce save for note properties
  useEffect(() => {
    const saveNote = async () => {
      if (!activeNoteId && !title.trim()) return;

      const data = {
        title,
        type: 'checklist',
        color,
        is_pinned: isPinned,
        is_archived: isArchived,
        owner: pb.authStore.record?.id,
      };

      try {
        if (activeNoteId) {
          await pb.collection('notes').update(activeNoteId, data);
        } else {
          const record = await pb.collection('notes').create(data);
          setActiveNoteId(record.id);
        }
      } catch (err) {
        console.error("Failed to save checklist:", err);
      }
    };

    const timer = setTimeout(saveNote, 500);
    return () => clearTimeout(timer);
  }, [title, color, isPinned, isArchived, activeNoteId]);

  const ensureNoteExists = async () => {
    if (activeNoteId) return activeNoteId;
    
    const record = await pb.collection('notes').create({
      title: title || 'Unbenannte Liste',
      type: 'checklist',
      color,
      is_pinned: isPinned,
      is_archived: isArchived,
      owner: pb.authStore.record?.id,
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
    } catch (err) {
      console.error("Failed to add item:", err);
    }
  };

  const handleUpdateItem = async (itemId: string, text: string) => {
    try {
      await pb.collection('checklist_items').update(itemId, { text });
    } catch (err) {
      console.error("Failed to update item:", err);
    }
  };

  const handleToggleItem = async (itemId: string, currentStatus: boolean) => {
    try {
      await pb.collection('checklist_items').update(itemId, {
        is_completed: !currentStatus
      });
    } catch (err) {
      console.error("Failed to toggle item:", err);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await pb.collection('checklist_items').delete(itemId);
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  };

  const handleDeleteNote = async () => {
    if (activeNoteId) {
      await pb.collection('notes').delete(activeNoteId);
    }
    onClose();
  };

  const activeItems = items.filter(i => !i.is_completed).sort((a, b) => a.order - b.order);
  const completedItems = items.filter(i => i.is_completed).sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col h-full bg-background" style={{ backgroundColor: color !== '#ffffff' ? color : undefined }}>
      {/* Header Area */}
      <div className="p-6 pb-2">
        <input
          type="text"
          placeholder="Titel der Liste"
          className="w-full text-2xl font-bold bg-transparent border-none outline-none text-foreground placeholder-muted-foreground/50"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-6 space-y-1 pb-24">
        {/* Active Items */}
        <AnimatePresence initial={false}>
          {activeItems.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-center gap-3 group py-1"
            >
              <button 
                onClick={() => handleToggleItem(item.id, false)}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <Circle className="w-5 h-5" />
              </button>
              <input
                type="text"
                className="flex-1 bg-transparent border-none outline-none text-foreground text-lg"
                value={item.text}
                onChange={(e) => handleUpdateItem(item.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    // Just focus the "new item" input if possible or add one
                    document.getElementById('new-item-input')?.focus();
                  }
                  if (e.key === 'Backspace' && item.text === '') {
                    handleDeleteItem(item.id);
                  }
                }}
              />
              <button 
                onClick={() => handleDeleteItem(item.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* New Item Row */}
        <div className="flex items-center gap-3 py-2 border-t border-border/10">
          <Plus className="w-5 h-5 text-muted-foreground/50" />
          <input
            id="new-item-input"
            type="text"
            placeholder="Punkt hinzufügen..."
            className="flex-1 bg-transparent border-none outline-none text-foreground text-lg placeholder-muted-foreground/30"
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

        {/* Completed Items */}
        {completedItems.length > 0 && (
          <div className="mt-8">
            <h4 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
              <span className="h-[1px] flex-1 bg-border/20"></span>
              Erledigt ({completedItems.length})
              <span className="h-[1px] flex-1 bg-border/20"></span>
            </h4>
            <div className="space-y-1">
              {completedItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-1 opacity-50 grayscale-[0.5]">
                  <button onClick={() => handleToggleItem(item.id, true)} className="text-primary">
                    <CheckCircle2 className="w-5 h-5" />
                  </button>
                  <span className="flex-1 text-foreground text-lg line-through">{item.text}</span>
                  <button onClick={() => handleDeleteItem(item.id)} className="text-muted-foreground hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modern Floating Toolbar */}
      <div className="absolute bottom-6 left-6 right-6 h-14 bg-card/80 backdrop-blur-xl border border-border rounded-2xl shadow-2xl flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-4 relative">
          <button 
            onClick={() => setShowPalette(!showPalette)} 
            className="w-10 h-10 rounded-xl hover:bg-muted flex items-center justify-center transition-colors text-muted-foreground"
          >
            <Palette size={20} />
          </button>
          
          {showPalette && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-16 left-0 bg-card/95 backdrop-blur-xl border border-border shadow-2xl rounded-2xl p-3 flex gap-3 z-[60]"
            >
              {COLORS.map(c => (
                <button
                  key={c}
                  className="w-8 h-8 rounded-full border border-black/5 shadow-inner transition-transform hover:scale-110"
                  style={{ backgroundColor: c }}
                  onClick={() => { setColor(c); setShowPalette(false); }}
                />
              ))}
            </motion.div>
          )}

          <div className="h-6 w-[1px] bg-border mx-1"></div>

          <button 
            onClick={() => setIsPinned(!isPinned)} 
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isPinned ? 'bg-blue-500/10 text-blue-500' : 'text-muted-foreground hover:bg-muted'}`}
          >
            <Pin size={20} className={isPinned ? 'fill-current' : ''} />
          </button>
          
          <button 
            onClick={() => setIsArchived(!isArchived)} 
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isArchived ? 'bg-orange-500/10 text-orange-500' : 'text-muted-foreground hover:bg-muted'}`}
          >
            <Archive size={20} className={isArchived ? 'fill-current' : ''} />
          </button>
        </div>

        <button 
          onClick={handleDeleteNote}
          className="w-10 h-10 rounded-xl hover:bg-red-500/10 flex items-center justify-center text-red-500 transition-colors"
        >
          <Trash2 size={20} />
        </button>
      </div>
    </div>
  );
}
