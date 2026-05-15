import { useState, useEffect, useRef, useCallback } from 'react';
import { RecordModel } from 'pocketbase';
import { pb } from '@/lib/pb';
import { Palette, Pin, Archive, Trash2 } from 'lucide-react';

interface NoteEditorProps {
  note?: RecordModel | null; // null if creating a new note
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

export default function NoteEditor({ note, onClose }: NoteEditorProps) {
  const [title, setTitle] = useState(note?.title || '');
  const [content, setContent] = useState(note?.content || '');
  const [color, setColor] = useState(note?.color || '#ffffff');
  const [isPinned, setIsPinned] = useState(note?.is_pinned || false);
  const [isArchived, setIsArchived] = useState(note?.is_archived || false);
  const [showPalette, setShowPalette] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Track original ID or new ID if we created it during this session
  const [activeNoteId, setActiveNoteId] = useState<string | undefined>(note?.id);

  // Auto-expand textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [content]);

  // Debounced save
  useEffect(() => {
    const saveNote = async () => {
      // Don't save if empty and new
      if (!activeNoteId && !title.trim() && !content.trim()) return;

      const data = {
        title,
        content,
        type: 'text',
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
        console.error("Failed to save note:", err);
      }
    };

    const timer = setTimeout(saveNote, 500);
    return () => clearTimeout(timer);
  }, [title, content, color, isPinned, isArchived, activeNoteId]);

  const handleDelete = async () => {
    if (activeNoteId) {
      await pb.collection('notes').delete(activeNoteId);
    }
    onClose();
  };

  return (
    <div className="flex flex-col h-full min-h-[50vh]" style={{ backgroundColor: color !== '#ffffff' ? color : 'transparent' }}>
      {/* Title */}
      <textarea
        placeholder="Titel"
        className="w-full text-2xl font-bold bg-transparent border-none focus:outline-none resize-none mb-4 text-[var(--foreground)]"
        rows={1}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      {/* Content */}
      <textarea
        placeholder="Notiz schreiben..."
        className="w-full flex-grow bg-transparent border-none focus:outline-none resize-none text-lg text-[var(--text-primary)]"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--border-color)]">
        <div className="flex gap-4 relative">
          <button onClick={() => setShowPalette(!showPalette)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <Palette size={20} />
          </button>
          
          {showPalette && (
            <div className="absolute bottom-8 left-0 bg-[var(--card-bg)] shadow-lg rounded-lg p-2 flex gap-2 border border-[var(--border-color)] z-50">
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
          <button onClick={handleDelete} className="text-red-500 hover:text-red-700">
            <Trash2 size={20} />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs text-[var(--text-muted)]">
            {isSaving ? "Wird gespeichert..." : "Gespeichert"}
          </span>
          <button 
            onClick={onClose}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold"
          >
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
}
