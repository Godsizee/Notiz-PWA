"use client";

import { useState, useEffect } from "react";
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
import { FileText, ListTodo, Layout } from "lucide-react";
import Header from "@/components/ui/Header";
import { motion } from "framer-motion";

export default function Home() {
  const { notes } = useRealtimeNotes();
  const router = useRouter();

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [activeNote, setActiveNote] = useState<RecordModel | null>(null);
  const [editorType, setEditorType] = useState<'text' | 'checklist' | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Corrected Auth Check via useEffect lifecycle
  useEffect(() => {
    if (!pb.authStore.isValid) {
      router.push("/login");
    } else if (pb.authStore.model?.needs_password_change) {
      router.push("/change-password");
    } else {
      setIsCheckingAuth(false);
    }
  }, [router]);

  if (isCheckingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--background)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest animate-pulse">
            Sitzung wird geladen...
          </p>
        </div>
      </div>
    );
  }

  // Responsive breakpoints for masonry grid
  const breakpointColumnsObj = {
    default: 3,
    1100: 3,
    768: 2,
    500: 1
  };

  const openNote = (note: RecordModel) => {
    setActiveNote(note);
    setEditorType(note.type as 'text' | 'checklist');
    setIsSheetOpen(true);
  };

  const closeSheet = () => {
    setIsSheetOpen(false);
    // Slight delay before resetting state to allow bottom sheet slide-down animation to complete smoothly
    setTimeout(() => {
      setActiveNote(null);
      setEditorType(null);
    }, 300);
  };

  // Sort notes: pinned notes always first, then by creation date. Hide archived notes.
  const visibleNotes = notes
    .filter(n => !n.is_archived)
    .sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.created).getTime() - new Date(a.created).getTime();
    });

  const pinnedNotesCount = visibleNotes.filter(n => n.is_pinned).length;
  const regularNotesCount = visibleNotes.length - pinnedNotesCount;

  return (
    <main className="min-h-screen bg-[var(--background)] pb-28 relative overflow-hidden transition-colors duration-300">
      {/* Dynamic ambient color glows */}
      <div className="absolute top-[-30%] right-[-10%] w-[600px] h-[600px] rounded-full bg-primary/3 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-20%] w-[600px] h-[600px] rounded-full bg-purple-500/3 blur-[140px] pointer-events-none" />

      <Header />

      <div className="max-w-4xl mx-auto px-4 md:px-6 relative z-10 animate-fade-in-up">
        
        {/* Render Notes Section */}
        {visibleNotes.length > 0 ? (
          <div className="space-y-8">
            
            {/* Pinned Notes Section */}
            {pinnedNotesCount > 0 && (
              <div className="space-y-3">
                <h4 className="text-[10px] font-extrabold text-[var(--text-muted)] tracking-widest uppercase pl-1 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                  Angepinnt ({pinnedNotesCount})
                </h4>
                <Masonry
                  breakpointCols={breakpointColumnsObj}
                  className="my-masonry-grid"
                  columnClassName="my-masonry-grid_column"
                >
                  {visibleNotes
                    .filter(n => n.is_pinned)
                    .map((note) => (
                      <NoteCard 
                        key={note.id} 
                        note={note} 
                        onClick={() => openNote(note)} 
                      />
                    ))}
                </Masonry>
              </div>
            )}

            {/* Other Notes Section */}
            {regularNotesCount > 0 && (
              <div className="space-y-3">
                {pinnedNotesCount > 0 && (
                  <h4 className="text-[10px] font-extrabold text-[var(--text-muted)] tracking-widest uppercase pl-1 pt-2">
                    Weitere Notizen ({regularNotesCount})
                  </h4>
                )}
                <Masonry
                  breakpointCols={breakpointColumnsObj}
                  className="my-masonry-grid"
                  columnClassName="my-masonry-grid_column"
                >
                  {visibleNotes
                    .filter(n => !n.is_pinned)
                    .map((note) => (
                      <NoteCard 
                        key={note.id} 
                        note={note} 
                        onClick={() => openNote(note)} 
                      />
                    ))}
                </Masonry>
              </div>
            )}
          </div>
        ) : (
          /* Empty State */
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center justify-center py-20 text-center px-4"
          >
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary mb-6 border border-primary/15 shadow-inner">
              <Layout className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-[var(--text-primary)]">
              Keine Notizen oder Checklisten
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-sm leading-relaxed">
              Erstelle deine erste Notiz oder einen gemeinsamen Einkaufszettel durch Klicken auf das Plus-Symbol unten rechts.
            </p>
          </motion.div>
        )}
      </div>

      {/* FAB Floating Action Button */}
      <FAB onClick={() => {
        if (!isSheetOpen) {
          setActiveNote(null);
          setEditorType(null);
          setIsSheetOpen(true);
        }
      }} />

      {/* Slide-Up Bottom Sheet */}
      <BottomSheet isOpen={isSheetOpen} onClose={closeSheet}>
        {!editorType ? (
          /* High-Fidelity Creation Picker */
          <div className="py-6 px-4 md:px-6">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-1.5 h-6 bg-primary rounded-full"></div>
              <h2 className="text-xl font-black text-[var(--text-primary)]">
                Erstellen
              </h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-4 p-5 bg-[var(--background)] hover:bg-[var(--primary-light)] rounded-2xl transition-all text-left border border-[var(--border-color)] hover:border-primary/20 group cursor-pointer"
                onClick={() => setEditorType('text')}
              >
                <div className="w-12 h-12 bg-blue-500/10 text-blue-500 rounded-xl flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-all shadow-sm">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-[var(--text-primary)] text-base">
                    Freitext-Notiz
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-snug">
                    Gedanken festhalten, Texte, klickbare Links.
                  </p>
                </div>
              </motion.button>

              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-4 p-5 bg-[var(--background)] hover:bg-[var(--primary-light)] rounded-2xl transition-all text-left border border-[var(--border-color)] hover:border-primary/20 group cursor-pointer"
                onClick={() => setEditorType('checklist')}
              >
                <div className="w-12 h-12 bg-green-500/10 text-green-500 rounded-xl flex items-center justify-center group-hover:bg-green-500 group-hover:text-white transition-all shadow-sm">
                  <ListTodo className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-[var(--text-primary)] text-base">
                    Gemeinsame Checkliste
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-snug">
                    Einkaufszettel, Aufgaben – synchron in Echtzeit.
                  </p>
                </div>
              </motion.button>
            </div>
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
