import { RecordModel } from 'pocketbase';
import { Pin, Circle, CheckCircle2 } from 'lucide-react';
import { useRealtimeChecklist } from '@/lib/useRealtime';
import { motion } from 'framer-motion';

interface NoteCardProps {
  note: RecordModel;
  onClick: () => void;
}

export default function NoteCard({ note, onClick }: NoteCardProps) {
  const { items } = useRealtimeChecklist(note.type === 'checklist' ? note.id : '');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      onClick={onClick}
      className="mb-4 break-inside-avoid cursor-pointer rounded-3xl p-5 shadow-sm hover:shadow-xl transition-all duration-300 border border-border/50 group relative overflow-hidden"
      style={{ backgroundColor: note.color || 'var(--card-bg)' }}
    >
      {note.is_pinned && (
        <div className="absolute top-3 right-3 p-1.5 bg-background/50 backdrop-blur-sm rounded-lg text-primary shadow-sm border border-border/20">
          <Pin className="w-3.5 h-3.5 fill-current" />
        </div>
      )}
      
      {note.title && (
        <h3 className="font-bold text-lg mb-3 text-foreground leading-tight group-hover:text-primary transition-colors">
          {note.title}
        </h3>
      )}
      
      {note.type === 'text' && note.content && (
        <p className="text-muted-foreground text-sm whitespace-pre-wrap line-clamp-6 leading-relaxed">
          {note.content}
        </p>
      )}

      {note.type === 'checklist' && (
        <div className="space-y-2">
          {items.slice(0, 5).map(item => (
            <div key={item.id} className="flex items-center gap-2.5">
              {item.is_completed ? (
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-muted-foreground/30 shrink-0" />
              )}
              <span className={`text-sm font-medium ${item.is_completed ? 'line-through text-muted-foreground/50' : 'text-foreground/80'} line-clamp-1`}>
                {item.text}
              </span>
            </div>
          ))}
          
          {items.length > 5 && (
            <div className="pt-2 flex items-center gap-2">
              <div className="h-[1px] flex-1 bg-border/20"></div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                + {items.length - 5} weitere
              </p>
              <div className="h-[1px] flex-1 bg-border/20"></div>
            </div>
          )}

          {items.length === 0 && (
            <p className="text-xs italic text-muted-foreground/50">Leere Liste...</p>
          )}
        </div>
      )}
    </motion.div>
  );
}
