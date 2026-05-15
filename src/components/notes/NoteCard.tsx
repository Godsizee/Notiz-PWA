import { RecordModel } from 'pocketbase';
import { Pin } from 'lucide-react';
import { useRealtimeChecklist } from '@/lib/useRealtime';

interface NoteCardProps {
  note: RecordModel;
  onClick: () => void;
}

export default function NoteCard({ note, onClick }: NoteCardProps) {
  const { items } = useRealtimeChecklist(note.type === 'checklist' ? note.id : '');

  const bgStyle = note.color && note.color !== '#ffffff' 
    ? { backgroundColor: note.color }
    : { backgroundColor: 'var(--card-bg)' };

  return (
    <div 
      onClick={onClick}
      className="rounded-xl border border-[var(--border-color)] p-4 mb-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer relative"
      style={bgStyle}
    >
      {note.is_pinned && (
        <Pin className="absolute top-2 right-2 text-[var(--text-muted)] w-4 h-4" />
      )}
      
      {note.title && (
        <h3 className="font-semibold text-lg mb-2 text-[var(--text-primary)] pr-6">{note.title}</h3>
      )}
      
      {note.type === 'text' && note.content && (
        <p className="text-[var(--text-secondary)] whitespace-pre-wrap line-clamp-6">
          {note.content}
        </p>
      )}

      {note.type === 'checklist' && (
        <div className="space-y-1">
          {items.slice(0, 5).map(item => (
            <div key={item.id} className="flex items-start gap-2">
              <input 
                type="checkbox" 
                checked={item.is_completed} 
                readOnly 
                className="mt-1"
              />
              <span className={`text-sm ${item.is_completed ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'} line-clamp-1`}>
                {item.text}
              </span>
            </div>
          ))}
          {items.length > 5 && (
            <p className="text-xs text-[var(--text-muted)] italic pt-1">
              + {items.length - 5} weitere Einträge
            </p>
          )}
        </div>
      )}
    </div>
  );
}
