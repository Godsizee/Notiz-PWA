import { useState, useEffect, useRef } from 'react';
import { RecordModel } from 'pocketbase';
import { pb } from '@/lib/pb';
import { Palette, Pin, Archive, Trash2, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { getNoteColorStyles, NOTE_COLORS } from '@/lib/colors';
import { motion, AnimatePresence } from 'framer-motion';

interface NoteEditorProps {
  note?: RecordModel | null; // null if creating a new note
  onClose: () => void;
  /** When provided, deleting routes through the app's soft-delete + undo toast. */
  onRequestDelete?: (noteId: string) => void;
}

export default function NoteEditor({ note, onClose, onRequestDelete }: NoteEditorProps) {
  const [title, setTitle] = useState(note?.title || '');
  const [content, setContent] = useState(note?.content || '');
  const [color, setColor] = useState(note?.color || 'white');
  const [isPinned, setIsPinned] = useState(note?.is_pinned || false);
  const [isArchived, setIsArchived] = useState(note?.is_archived || false);
  const [showPalette, setShowPalette] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Track active ID to differentiate between updates and first-time creation
  const [activeNoteId, setActiveNoteId] = useState<string | undefined>(note?.id);

  // Auto-expand textarea height as content changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [content]);

  // Debounced auto-save (500ms)
  useEffect(() => {
    const saveNote = async () => {
      // Don't save if it's completely empty and hasn't been created yet
      if (!activeNoteId && !title.trim() && !content.trim()) return;

      const user = pb.authStore.model || pb.authStore.record;
      const data = {
        title,
        content,
        type: 'text',
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
        console.error("Failed to auto-save note:", err);
      } finally {
        // keep saving state visible slightly longer for smooth visual transitions
        setTimeout(() => setIsSaving(false), 400);
      }
    };

    const timer = setTimeout(saveNote, 500);
    return () => clearTimeout(timer);
  }, [title, content, color, isPinned, isArchived, activeNoteId]);

  const handleDelete = () => {
    // Route through the app-level soft-delete + undo toast when available.
    if (activeNoteId && onRequestDelete) {
      onRequestDelete(activeNoteId);
      return;
    }
    if (activeNoteId) {
      pb.collection('notes').delete(activeNoteId).catch(err =>
        console.error("Failed to delete note:", err)
      );
    }
    onClose();
  };

  // URL link extractor for mobile-friendly tactile link-pills
  const getExtractedLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = text.match(urlRegex) || [];
    // Filter out duplicates
    return Array.from(new Set(matches));
  };

  const extractedLinks = getExtractedLinks(content);
  const colorStyles = getNoteColorStyles(color);

  return (
    <div 
      className="flex flex-col h-full min-h-[55vh] p-6 pb-28 rounded-t-3xl transition-colors duration-300"
      style={colorStyles.style}
    >
      {/* Title Textarea */}
      <textarea
        placeholder="Titel"
        className="w-full text-2xl font-extrabold bg-transparent border-none focus:outline-none resize-none mb-4 text-[var(--text-primary)] placeholder-[var(--text-muted)]/40 leading-snug"
        rows={1}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            textareaRef.current?.focus();
          }
        }}
      />

      {/* Content Textarea */}
      <textarea
        ref={textareaRef}
        placeholder="Notiz schreiben..."
        className="w-full flex-grow bg-transparent border-none focus:outline-none resize-none text-base md:text-lg text-[var(--text-secondary)] placeholder-[var(--text-muted)]/30 min-h-[20vh] leading-relaxed"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />

      {/* Tactile URL Link Pills (Touch-first link interaction) */}
      {extractedLinks.length > 0 && (
        <div className="mt-8 pt-4 border-t border-[var(--border-color)]">
          <p className="text-[10px] font-extrabold text-[var(--text-muted)] tracking-wider uppercase mb-3 flex items-center gap-1">
            <ExternalLink className="w-3.5 h-3.5" />
            Gefundene Links
          </p>
          <div className="flex flex-wrap gap-2">
            {extractedLinks.map((url, i) => (
              <motion.a
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-background/50 border border-[var(--border-color)] text-xs font-semibold text-primary rounded-xl backdrop-blur-sm max-w-xs transition-all hover:bg-background/80"
              >
                <span className="truncate flex-1">{url.replace(/(https?:\/\/)?(www\.)?/, '')}</span>
                <ExternalLink className="w-3 h-3 shrink-0 opacity-80" />
              </motion.a>
            ))}
          </div>
        </div>
      )}

      {/* Floating Design Toolbar */}
      <div
        className="absolute bottom-4 left-3 right-3 sm:bottom-6 sm:left-6 sm:right-6 h-14 bg-[var(--card-bg)]/85 backdrop-blur-xl border border-[var(--border-color)] rounded-2xl shadow-[var(--shadow-elevated)] flex items-center justify-between px-2 sm:px-4 z-50"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >

        {/* Left Actions */}
        <div className="flex items-center gap-1 sm:gap-3.5 relative">

          {/* Palette button */}
          <button
            onClick={() => setShowPalette(!showPalette)}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl hover:bg-[var(--background)]/80 flex items-center justify-center transition-colors text-[var(--text-secondary)] cursor-pointer"
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
                className="absolute bottom-16 left-0 bg-[var(--card-bg)] border border-[var(--border-color)] shadow-[var(--shadow-elevated)] rounded-2xl p-3 flex flex-wrap gap-2 max-w-[min(18rem,calc(100vw-1.5rem))] z-[60]"
              >
                {NOTE_COLORS.map(c => {
                  return (
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
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="h-6 w-px bg-[var(--border-color)] mx-0.5"></div>

          {/* Pin Button */}
          <button
            onClick={() => setIsPinned(!isPinned)}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${isPinned ? 'bg-primary/10 text-primary' : 'text-[var(--text-secondary)] hover:bg-[var(--background)]/80'}`}
            title="Notiz anpinnen"
          >
            <Pin size={19} className={isPinned ? 'fill-current' : ''} />
          </button>

          {/* Archive Button */}
          <button
            onClick={() => setIsArchived(!isArchived)}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${isArchived ? 'bg-orange-500/10 text-orange-500' : 'text-[var(--text-secondary)] hover:bg-[var(--background)]/80'}`}
            title="Archivieren"
          >
            <Archive size={19} />
          </button>
        </div>

        {/* Right Actions & Status */}
        <div className="flex items-center gap-1 sm:gap-3">

          {/* Save Status Indicator — collapses to an icon on very narrow screens */}
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider bg-[var(--background)]/50 px-2 sm:px-2.5 py-1 rounded-full border border-[var(--border-color)]">
            {isSaving ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin text-primary" />
                <span className="hidden xs:inline">Auto-save...</span>
              </>
            ) : (
              <>
                <Check className="w-3 h-3 text-green-500" />
                <span className="hidden xs:inline">Gespeichert</span>
              </>
            )}
          </div>

          <div className="hidden xs:block h-6 w-px bg-[var(--border-color)] mx-0.5"></div>

          {/* Delete Button */}
          <button
            onClick={handleDelete}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl hover:bg-red-500/10 flex items-center justify-center text-red-500 transition-colors cursor-pointer"
            title="Löschen"
          >
            <Trash2 size={19} />
          </button>
        </div>
      </div>
    </div>
  );
}
