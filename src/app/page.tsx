"use client";

import { useState } from "react";
import Masonry from "react-masonry-css";
import { useRouter } from "next/navigation";
import { RecordModel } from "pocketbase";
import { pb } from "@/lib/pb";
import { useRealtimeNotes } from "@/lib/useRealtime";
import NoteCard from "@/components/notes/NoteCard";
import FAB from "@/components/ui/FAB";
import BottomSheet from "@/components/ui/BottomSheet";
import NoteEditor from "@/components/notes/NoteEditor";
import ChecklistEditor from "@/components/notes/ChecklistEditor";
import { FileText, ListTodo, LogOut } from "lucide-react";

export default function Home() {
  const { notes } = useRealtimeNotes();
  const router = useRouter();

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [activeNote, setActiveNote] = useState<RecordModel | null>(null);
  const [editorType, setEditorType] = useState<'text' | 'checklist' | null>(null);

  // Breakpoints for masonry grid
  const breakpointColumnsObj = {
    default: 4,
    1100: 3,
    700: 2,
    500: 1
  };

  const handleLogout = () => {
    pb.authStore.clear();
    document.cookie = "pb_auth=; path=/; max-age=0";
    router.push("/login");
  };

  const openNote = (note: RecordModel) => {
    setActiveNote(note);
    setEditorType(note.type as 'text' | 'checklist');
    setIsSheetOpen(true);
  };

  const createNew = (type: 'text' | 'checklist') => {
    setActiveNote(null);
    setEditorType(type);
    setIsSheetOpen(true);
  };

  const closeSheet = () => {
    setIsSheetOpen(false);
    // slight delay before clearing to allow slide-down animation to finish smoothly
    setTimeout(() => {
      setActiveNote(null);
      setEditorType(null);
    }, 300);
  };

  // Sort notes: pinned first, then by creation date. Filter out archived ones.
  const visibleNotes = notes.filter(n => !n.is_archived).sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.created).getTime() - new Date(a.created).getTime();
  });

  return (
    <main className="min-h-screen bg-[var(--background)] p-4 pt-8">
      {/* Header */}
      <header className="flex justify-between items-center mb-8 px-2">
        <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">Notiz</h1>
        <button 
          onClick={handleLogout} 
          className="p-2 text-[var(--text-secondary)] hover:bg-[var(--border-color)] rounded-full transition-colors"
          aria-label="Logout"
        >
          <LogOut size={20} />
        </button>
      </header>

      {/* Masonry Grid */}
      <Masonry
        breakpointCols={breakpointColumnsObj}
        className="my-masonry-grid"
        columnClassName="my-masonry-grid_column"
      >
        {visibleNotes.map((note) => (
          <NoteCard 
            key={note.id} 
            note={note} 
            onClick={() => openNote(note)} 
          />
        ))}
      </Masonry>

      {visibleNotes.length === 0 && (
        <div className="text-center mt-20 text-[var(--text-muted)]">
          <p>Keine Notizen vorhanden.</p>
          <p className="text-sm mt-2">Klicke auf das + um eine Notiz zu erstellen.</p>
        </div>
      )}

      {/* FAB */}
      <FAB onClick={() => {
        // If sheet is open, do nothing. Otherwise open it without an active editor type yet, 
        // to show the selection menu.
        if (!isSheetOpen) {
          setActiveNote(null);
          setEditorType(null);
          setIsSheetOpen(true);
        }
      }} />

      {/* Bottom Sheet */}
      <BottomSheet isOpen={isSheetOpen} onClose={closeSheet}>
        {!editorType ? (
          // Selection Menu
          <div className="py-6 px-4 space-y-4">
            <h2 className="text-lg font-bold text-[var(--foreground)] mb-6">Erstellen</h2>
            <button 
              className="w-full flex items-center gap-4 p-4 bg-[var(--background)] hover:bg-[var(--border-color)] rounded-xl transition-colors text-left"
              onClick={() => setEditorType('text')}
            >
              <FileText className="text-blue-600" size={24} />
              <div>
                <h3 className="font-semibold text-[var(--text-primary)]">Freitext Notiz</h3>
                <p className="text-sm text-[var(--text-secondary)]">Einfacher Text, Links etc.</p>
              </div>
            </button>
            <button 
              className="w-full flex items-center gap-4 p-4 bg-[var(--background)] hover:bg-[var(--border-color)] rounded-xl transition-colors text-left"
              onClick={() => setEditorType('checklist')}
            >
              <ListTodo className="text-blue-600" size={24} />
              <div>
                <h3 className="font-semibold text-[var(--text-primary)]">Checkliste</h3>
                <p className="text-sm text-[var(--text-secondary)]">Gemeinsamer Einkaufszettel</p>
              </div>
            </button>
          </div>
        ) : editorType === 'text' ? (
          <NoteEditor note={activeNote} onClose={closeSheet} />
        ) : (
          <ChecklistEditor note={activeNote} onClose={closeSheet} />
        )}
      </BottomSheet>
    </main>
  );
}
