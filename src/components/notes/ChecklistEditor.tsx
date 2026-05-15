import { useState, useEffect, useRef } from 'react';
import { RecordModel } from 'pocketbase';
import { pb } from '@/lib/pb';
import { Palette, Pin, Archive, Trash2, Plus, ListTodo } from 'lucide-react';
import { useRealtimeChecklist } from '@/lib/useRealtime';

interface ChecklistEditorProps {
  note?: RecordModel | null; // null if new
  onClose: () => void;
}

const COLORS = [
  '#ffffff', 
  'var(--color-pastel-blue)', 
  'var(--color-pastel-green)', 
  'var(--color-pastel-yellow)', 
  'var(--color-pastel-pink)', 
  'var(--color-pastel-purple)', 
  'var(--color-pastel-orange)'
];

export default function ChecklistEditor({ note, onClose }: ChecklistEditorProps) {
  const [title, setTitle] = useState(note?.title || '');
  const [color, setColor] = useState(note?.color || '#ffffff');
  const [isPinned, setIsPinned] = useState(note?.is_pinned || false);
  const [isArchived, setIsArchived] = useState(note?.is_archived || false);
  const [showPalette, setShowPalette] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | undefined>(note?.id);
  const [newItemText, setNewItemText] = useState('');
  const newItemInputRef = useRef<HTMLInputElement>(null);

  const { items } = useRealtimeChecklist(activeNoteId || '');

  // Debounce save for note properties (title, color, pin, archive)
  useEffect(() => {
    const saveNote = async () => {
      // Create note if it doesn't exist and we have a title or items (handled below)
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
        console.error("Failed to save checklist properties:", err);
      }
    };

    const timer = setTimeout(saveNote, 500);
    return () => clearTimeout(timer);
  }, [title, color, isPinned, isArchived, activeNoteId]);

  const handleAddItem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newItemText.trim()) return;

    let noteId = activeNoteId;
    if (!noteId) {
      // Create note first if we haven't
      const record = await pb.collection('notes').create({
        title,
        type: 'checklist',
        color,
        is_pinned: isPinned,
        is_archived: isArchived,
        owner: pb.authStore.record?.id,
      });
      setActiveNoteId(record.id);
      noteId = record.id;
    }

    try {
      await pb.collection('checklist_items').create({
        note: noteId,
        text: newItemText,
        is_completed: false,
        order: items.length, // simple ordering
      });
      setNewItemText('');
      // Focus stays on input for fast typing
      newItemInputRef.current?.focus();
    } catch (err) {
      console.error("Failed to add item:", err);
    }
  };

  const handleToggleItem = (itemId: string, currentStatus: boolean) => {
    // Optimistic delay logic (400ms delay to prevent misclicks)
    setTimeout(async () => {
      try {
        await pb.collection('checklist_items').update(itemId, {
          is_completed: !currentStatus
        });
      } catch (err) {
        console.error("Failed to toggle item:", err);
      }
    }, 400);
  };

  const handleDelete = async () => {
    if (activeNoteId) {
      await pb.collection('notes').delete(activeNoteId);
    }
    onClose();
  };

  const handleDeleteCompleted = async () => {
    const completed = items.filter(i => i.is_completed);
    for (const item of completed) {
      await pb.collection('checklist_items').delete(item.id);
    }
  };

  const handleUncheckAll = async () => {
    const completed = items.filter(i => i.is_completed);
    for (const item of completed) {
      await pb.collection('checklist_items').update(item.id, { is_completed: false });
    }
  };

  const activeItems = items.filter(i => !i.is_completed);
  const completedItems = items.filter(i => i.is_completed);

  return (
    <div className="flex flex-col h-full min-h-[50vh] max-h-[80vh] overflow-y-auto pb-16" style={{ backgroundColor: color !== '#ffffff' ? color : 'transparent' }}>
      {/* Title */}
      <input
        type="text"
        placeholder="Titel"
        className="w-full text-xl font-bold bg-transparent border-none outline-none mb-4 text-[var(--text-primary)] placeholder-[var(--text-muted)]"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      {/* Active Items */}
      <div className="space-y-2 mb-4">
        {activeItems.map((item) => (
          <div key={item.id} className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={false}
              onChange={() => handleToggleItem(item.id, false)}
              className="w-5 h-5 cursor-pointer accent-blue-600"
            />
            <span className="text-[var(--text-primary)] text-base">{item.text}</span>
          </div>
        ))}

        {/* New Item Input */}
        <form onSubmit={handleAddItem} className="flex items-center gap-3 mt-2 border-t border-[var(--border-color)]/20 pt-2">
          <Plus className="text-[var(--text-muted)] w-5 h-5" />
          <input
            ref={newItemInputRef}
            type="text"
            placeholder="Neuer Eintrag..."
            className="w-full bg-transparent border-none outline-none text-base text-[var(--text-primary)] placeholder-[var(--text-muted)]"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
          />
        </form>
      </div>

      {/* Completed Items */}
      {completedItems.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--border-color)]/30">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-sm font-semibold text-[var(--text-secondary)]">Erledigt ({completedItems.length})</h4>
          </div>
          <div className="space-y-2">
            {completedItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 opacity-60">
                <input
                  type="checkbox"
                  checked={true}
                  onChange={() => handleToggleItem(item.id, true)}
                  className="w-5 h-5 cursor-pointer accent-blue-600"
                />
                <span className="text-[var(--text-secondary)] text-base line-through">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fixed Toolbar at the bottom of the modal */}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--card-bg)] rounded-b-2xl p-4 flex items-center justify-between border-t border-[var(--border-color)] z-50">
        <div className="flex gap-4 relative">
          <button onClick={() => setShowPalette(!showPalette)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <Palette size={20} />
          </button>
          
          {showPalette && (
            <div className="absolute bottom-12 left-0 bg-[var(--card-bg)] shadow-lg rounded-lg p-2 flex gap-2 border border-[var(--border-color)] z-50">
              {COLORS.map(c => (
                <button
                  key={c}
                  className="w-6 h-6 rounded-full border border-gray-300"
                  style={{ backgroundColor: c }}
                  onClick={() => { setColor(c); setShowPalette(false); }}
                />
              ))}
            </div>
          )}

          <button 
            onClick={() => setIsPinned(!isPinned)} 
            className={`${isPinned ? 'text-blue-600' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
          >
            <Pin size={20} />
          </button>
          <button 
            onClick={() => setIsArchived(!isArchived)} 
            className={`${isArchived ? 'text-blue-600' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
          >
            <Archive size={20} />
          </button>
          
          {/* List specific actions */}
          <div className="flex gap-2 ml-4 pl-4 border-l border-[var(--border-color)]">
            <button onClick={handleUncheckAll} className="text-[var(--text-secondary)] hover:text-blue-600 text-sm font-medium" title="Alle Haken entfernen">
              Reset
            </button>
            <button onClick={handleDeleteCompleted} className="text-[var(--text-secondary)] hover:text-red-600 text-sm font-medium" title="Abgehakte löschen">
              Clean
            </button>
          </div>
        </div>

        <button onClick={handleDelete} className="text-red-500 hover:text-red-700">
          <Trash2 size={20} />
        </button>
      </div>
    </div>
  );
}
