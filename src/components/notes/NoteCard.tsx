import { RecordModel } from 'pocketbase';
import { Pin, Circle, CheckCircle2, ListTodo, FileText } from 'lucide-react';
import { useRealtimeChecklist } from '@/lib/useRealtime';
import { motion } from 'framer-motion';
import { getNoteColorStyles } from '@/lib/colors';

interface NoteCardProps {
  note: RecordModel;
  onClick: () => void;
}

export default function NoteCard({ note, onClick }: NoteCardProps) {
  const { items } = useRealtimeChecklist(note.type === 'checklist' ? note.id : '');
  const colorStyles = getNoteColorStyles(note.color);

  // Filter items to show inside card
  const visibleItems = items.slice(0, 5);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -5, boxShadow: '0 12px 24px -10px rgba(0, 0, 0, 0.15)' }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`mb-4 break-inside-avoid cursor-pointer rounded-3xl p-5 border shadow-sm transition-all duration-300 relative overflow-hidden group ${colorStyles.bg}`}
      style={colorStyles.style}
    >
      {/* Glow Effect on Hover */}
      <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      {/* Pin Icon */}
      {note.is_pinned && (
        <div className="absolute top-3.5 right-3.5 p-1.5 bg-background/60 backdrop-blur-md rounded-lg text-primary shadow-sm border border-[var(--border-color)] z-10 transition-transform group-hover:scale-110">
          <Pin className="w-3.5 h-3.5 fill-current" />
        </div>
      )}
      
      {/* Title */}
      {note.title ? (
        <h3 className="font-bold text-base md:text-lg mb-3 pr-6 text-[var(--text-primary)] leading-snug group-hover:text-primary transition-colors duration-200">
          {note.title}
        </h3>
      ) : (
        // Render a faint type-indicator if title is missing to balance card layout
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
          {visibleItems.map(item => (
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
          
          {/* Custom Faint Separator & Counter */}
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
    </motion.div>
  );
}
