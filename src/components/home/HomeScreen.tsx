"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import Masonry from "react-masonry-css";
import { useRouter } from "next/navigation";
import { RecordModel } from "pocketbase";
import { pb, isOwnedByMe } from "@/lib/pb";
import { useRealtimeNotes, useRealtimeImages } from "@/lib/useRealtime";
import { useChecklistSearchIndex } from "@/lib/useSearch";
import { applyChange } from "@/lib/sync";
import { useKeyboardShortcuts } from "@/lib/useKeyboardShortcuts";
import { useToastStore } from "@/store/useToastStore";
import { usePreferencesStore } from "@/store/usePreferencesStore";
import { getNoteColorStyles } from "@/lib/colors";
import { setNoteThemeColor, syncThemeColor } from "@/lib/themeColor";
import { duplicateNote } from "@/lib/duplicateNote";
import { hapticLight, hapticHeavy } from "@/lib/haptics";
import NoteCard from "@/components/notes/NoteCard";
import NoteCardSkeleton from "@/components/notes/NoteCardSkeleton";
import FAB from "@/components/ui/FAB";
import NoteScreen from "@/components/notes/NoteScreen";
import FilterBar, { type NoteFilter } from "@/components/ui/FilterBar";
import PullToRefresh from "@/components/ui/PullToRefresh";
import Toast from "@/components/ui/Toast";
import NoteEditor from "@/components/notes/NoteEditor";
import ChecklistEditor from "@/components/notes/ChecklistEditor";
import { Layout, SearchX } from "lucide-react";
import Header from "@/components/ui/Header";
import { motion } from "framer-motion";
import { useNoteRoute } from "@/lib/useNoteRoute";
import { adoptCreatedId, resolveSession, type SessionState } from "@/lib/noteRoute";
import { useMediaQuery } from "@/lib/useViewport";

const UNDO_DELETE_MS = 5000;

const breakpointColumnsObj = {
  default: 3,
  1100: 3,
  768: 2,
  500: 1,
};

export default function HomeScreen() {
  const { notes, isLoading, refetch } = useRealtimeNotes();
  // Loaded once for the whole overview rather than per card — see the hook.
  const imagesByNote = useRealtimeImages();
  const router = useRouter();
  const showToast = useToastStore((s) => s.showToast);
  const viewMode = usePreferencesStore((s) => s.viewMode);

  // Welche Notiz offen ist, steht in der URL (/?note=<id>, /?new=text|checklist),
  // siehe src/lib/noteRoute.ts. Daraus wird die Editor-Sitzung abgeleitet.
  const { route, openNote: pushNote, openNew, replaceWithId, close: closeNote } = useNoteRoute();
  const [sessionState, setSessionState] = useState<SessionState>({ status: "closed" });
  const sessionSeq = useRef(0);
  // Ab 1024 px Liste und Notiz nebeneinander statt Vollbild-Overlay (U40).
  const isWide = useMediaQuery("(min-width: 1024px)");
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const [activeFilter, setActiveFilter] = useState<NoteFilter>("all");
  const [activeColor, setActiveColor] = useState<string | null>(null);

  // Client-side full-text search (title, content, checklist items).
  // An active search overrides the type/color filters and spans all notes.
  const [searchQuery, setSearchQuery] = useState("");
  const searchTerm = searchQuery.trim().toLowerCase();
  const checklistIndex = useChecklistSearchIndex(searchTerm.length > 0);

  // Soft-delete: ids hidden from the UI while their undo window is open.
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
  const deleteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Auth check
  useEffect(() => {
    if (!pb.authStore.isValid) {
      pb.authStore.clear(); // drop stale/expired token + cookie so we don't loop back here
      router.push("/login");
    } else if (pb.authStore.model?.needs_password_change) {
      router.push("/change-password");
    } else {
      setIsCheckingAuth(false);
    }
  }, [router]);

  // URL → Editor-Sitzung. Die App-Shortcuts aus dem Manifest (/?new=text|checklist)
  // laufen ueber denselben Weg wie ein Tipp auf das Plus.
  useEffect(() => {
    if (isCheckingAuth) return;
    setSessionState((current) =>
      resolveSession(current, route, isLoading ? null : notes, () => `editor-${++sessionSeq.current}`)
    );
  }, [isCheckingAuth, route, notes, isLoading]);

  // Deep-Link auf eine Notiz, die es (fuer dieses Konto) nicht gibt.
  useEffect(() => {
    if (sessionState.status !== "missing") return;
    showToast({ message: "Diese Notiz gibt es nicht mehr.", tone: "danger", duration: 3500 });
    closeNote();
  }, [sessionState, showToast, closeNote]);

  const session = sessionState.status === "open" ? sessionState.session : null;
  const isNoteOpen = sessionState.status === "open" || sessionState.status === "loading";

  // Statusleiste in der Farbe der offenen Notiz, sonst in der des Themes.
  useEffect(() => {
    if (session?.note) setNoteThemeColor(session.note.color);
    else syncThemeColor();
  }, [session]);

  // Clear any outstanding delete timers on unmount.
  useEffect(() => {
    const timers = deleteTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const openText = () => openNew("text");
  const openChecklist = () => openNew("checklist");
  const openNote = (note: RecordModel) => pushNote(note.id);

  // Eine neue Notiz wurde zum ersten Mal gespeichert: ID in die Sitzung (damit
  // der Editor NICHT neu gemountet wird) und in die URL (Reload/Teilen-Link).
  // Reihenfolge wichtig: erst der State, dann replaceState — Next verarbeitet
  // die URL-Aenderung als Transition, also nach diesem State-Update.
  const handleCreated = (id: string) => {
    setSessionState((current) => adoptCreatedId(current, id));
    replaceWithId(id);
  };

  // --- Note mutations (used by swipe + context menu) ---
  const notifyError = (message: string) => {
    showToast({ message, tone: "danger", duration: 3500 });
  };

  const handleTogglePin = async (note: RecordModel) => {
    try {
      await applyChange({
        collection: "notes",
        action: "update",
        id: note.id,
        data: { is_pinned: !note.is_pinned },
      });
    } catch (err) {
      console.error("Failed to toggle pin:", err);
      notifyError("Anpinnen fehlgeschlagen.");
    }
  };

  const handleToggleArchive = async (note: RecordModel) => {
    const archived = !note.is_archived;
    try {
      await applyChange({ collection: "notes", action: "update", id: note.id, data: { is_archived: archived } });
      showToast({
        message: archived ? "Archiviert" : "Aus dem Archiv geholt",
        actionLabel: "Rückgängig",
        duration: UNDO_DELETE_MS,
        onAction: () => {
          hapticLight();
          applyChange({ collection: "notes", action: "update", id: note.id, data: { is_archived: !archived } })
            .catch((err) => {
              console.error("Failed to undo archive:", err);
              notifyError("Rückgängig fehlgeschlagen.");
            });
        },
      });
    } catch (err) {
      console.error("Failed to toggle archive:", err);
      notifyError("Archivieren fehlgeschlagen.");
    }
  };

  const handleToggleShare = async (note: RecordModel) => {
    try {
      await applyChange({
        collection: "notes",
        action: "update",
        id: note.id,
        data: { is_shared: !note.is_shared },
      });
    } catch (err) {
      console.error("Failed to toggle share:", err);
      notifyError("Teilen fehlgeschlagen.");
    }
  };

  const handleDuplicate = async (note: RecordModel) => {
    try {
      const { skippedImages } = await duplicateNote(note);
      hapticLight();
      showToast({
        message:
          skippedImages > 0
            ? `Notiz dupliziert – ${skippedImages} Bild${skippedImages === 1 ? "" : "er"} fehlt${skippedImages === 1 ? "" : "en"} (offline)`
            : "Notiz dupliziert",
        duration: skippedImages > 0 ? 4000 : 3000,
      });
    } catch (err) {
      console.error("Failed to duplicate note:", err);
      notifyError("Duplizieren fehlgeschlagen.");
    }
  };

  const handleChangeColor = async (note: RecordModel, color: string) => {
    try {
      await applyChange({
        collection: "notes",
        action: "update",
        id: note.id,
        data: { color },
      });
    } catch (err) {
      console.error("Failed to change color:", err);
      notifyError("Farbe konnte nicht geändert werden.");
    }
  };

  // Soft-delete with a 5s undo window before the real PocketBase delete.
  const requestDeleteNote = (noteId: string) => {
    hapticHeavy();
    setPendingDeleteIds((prev) => new Set(prev).add(noteId));

    const timer = setTimeout(async () => {
      try {
        await applyChange({ collection: "notes", action: "delete", id: noteId });
      } catch (err) {
        console.error("Failed to delete note:", err);
      }
      delete deleteTimers.current[noteId];
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
    }, UNDO_DELETE_MS);
    deleteTimers.current[noteId] = timer;

    showToast({
      message: "Notiz gelöscht",
      actionLabel: "Rückgängig",
      tone: "danger",
      duration: UNDO_DELETE_MS,
      onAction: () => {
        const t = deleteTimers.current[noteId];
        if (t) {
          clearTimeout(t);
          delete deleteTimers.current[noteId];
        }
        setPendingDeleteIds((prev) => {
          const next = new Set(prev);
          next.delete(noteId);
          return next;
        });
        hapticLight();
      },
    });
  };

  // Delete requested from inside an open editor → close the note then soft-delete.
  const requestDeleteFromEditor = (noteId: string) => {
    closeNote();
    requestDeleteNote(noteId);
  };

  // Keyboard shortcuts (desktop)
  useKeyboardShortcuts({
    onNewNote: openText,
    onNewChecklist: openChecklist,
    onEscape: () => {
      if (isNoteOpen) closeNote();
    },
    onDeleteInEditor: () => {
      if (session?.note && isOwnedByMe(session.note)) requestDeleteFromEditor(session.note.id);
    },
    isEditing: !!session?.id,
  });

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

  // Colors actually used (for the color filter chips).
  const usedColors = Array.from(
    new Set(
      notes
        .filter((n) => !pendingDeleteIds.has(n.id) && n.color)
        .map((n) => n.color as string)
    )
  );

  // Apply filters. An active search spans everything (incl. archived notes)
  // and replaces the type/color filters.
  const filteredNotes = notes
    .filter((n) => !pendingDeleteIds.has(n.id))
    .filter((n) => {
      if (searchTerm) return true;
      if (activeFilter === "archived") return n.is_archived;
      if (n.is_archived) return false;
      if (activeFilter === "text") return n.type === "text";
      if (activeFilter === "checklist") return n.type === "checklist";
      return true;
    })
    .filter((n) => {
      if (searchTerm || !activeColor) return true;
      return getNoteColorStyles(n.color).id === getNoteColorStyles(activeColor).id;
    })
    .filter((n) => {
      if (!searchTerm) return true;
      if (String(n.title || "").toLowerCase().includes(searchTerm)) return true;
      if (n.type === "text" && String(n.content || "").toLowerCase().includes(searchTerm)) return true;
      if (n.type === "checklist") return (checklistIndex[n.id] || "").includes(searchTerm);
      return false;
    })
    .sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.created).getTime() - new Date(a.created).getTime();
    });

  const pinnedNotes = filteredNotes.filter((n) => n.is_pinned);
  const regularNotes = filteredNotes.filter((n) => !n.is_pinned);
  const hasAnyNotes = notes.filter((n) => !pendingDeleteIds.has(n.id)).length > 0;

  const renderCard = (note: RecordModel) => (
    <NoteCard
      key={note.id}
      note={note}
      images={imagesByNote[note.id]}
      layout={viewMode}
      onClick={() => openNote(note)}
      onTogglePin={() => handleTogglePin(note)}
      onToggleArchive={() => handleToggleArchive(note)}
      onToggleShare={() => handleToggleShare(note)}
      onDuplicate={() => handleDuplicate(note)}
      onChangeColor={(color) => handleChangeColor(note, color)}
      onDelete={() => requestDeleteNote(note.id)}
    />
  );

  // Grid → masonry columns; list → stacked single-column rows.
  const renderCollection = (children: ReactNode) =>
    viewMode === "list" ? (
      <div className="space-y-2.5">{children}</div>
    ) : (
      <Masonry
        breakpointCols={breakpointColumnsObj}
        className="my-masonry-grid"
        columnClassName="my-masonry-grid_column"
      >
        {children}
      </Masonry>
    );

  return (
    <main className="min-h-screen bg-[var(--background)] pb-28 relative overflow-hidden transition-colors duration-300">
      {/* Uebersicht bleibt gemountet (Scrollposition, Realtime), ist aber bei
          offener Vollbild-Notiz fuer Tastatur und Screenreader gesperrt. */}
      <div inert={isNoteOpen && !isWide}>
      {/* Dynamic ambient color glows */}
      <div className="absolute top-[-30%] right-[-10%] w-[600px] h-[600px] rounded-full blur-[140px] pointer-events-none" style={{ background: "var(--glow-a)" }} />
      <div className="absolute bottom-[-10%] left-[-20%] w-[600px] h-[600px] rounded-full blur-[140px] pointer-events-none" style={{ background: "var(--glow-b)" }} />

      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <div className="max-w-4xl mx-auto px-4 md:px-6 relative z-10 animate-fade-in-up">
        {/* Filter bar (only once notes exist; hidden while searching) */}
        {!isLoading && hasAnyNotes && !searchTerm && (
          <div className="mb-6">
            <FilterBar
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              usedColors={usedColors}
              activeColor={activeColor}
              onColorChange={setActiveColor}
            />
          </div>
        )}

        <PullToRefresh onRefresh={refetch}>
          {isLoading ? (
            /* Skeleton loading state */
            renderCollection(
              Array.from({ length: 6 }).map((_, i) => (
                <NoteCardSkeleton key={i} lines={2 + (i % 3)} />
              ))
            )
          ) : filteredNotes.length > 0 ? (
            <div className="space-y-8">
              {/* Pinned Notes Section */}
              {pinnedNotes.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-[11px] font-extrabold text-[var(--text-muted)] tracking-widest uppercase pl-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                    Angepinnt ({pinnedNotes.length})
                  </h4>
                  {renderCollection(pinnedNotes.map(renderCard))}
                </div>
              )}

              {/* Other Notes Section */}
              {regularNotes.length > 0 && (
                <div className="space-y-3">
                  {pinnedNotes.length > 0 && (
                    <h4 className="text-[11px] font-extrabold text-[var(--text-muted)] tracking-widest uppercase pl-1 pt-2">
                      Weitere Notizen ({regularNotes.length})
                    </h4>
                  )}
                  {renderCollection(regularNotes.map(renderCard))}
                </div>
              )}
            </div>
          ) : hasAnyNotes ? (
            /* Filter returned nothing */
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-20 text-center px-4"
            >
              <div className="w-20 h-20 bg-[var(--card-bg)] rounded-3xl flex items-center justify-center text-[var(--text-muted)] mb-6 border border-[var(--border-color)]">
                <SearchX className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-bold text-[var(--text-primary)]">
                Keine Treffer
              </h3>
              <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-sm leading-relaxed">
                {searchTerm
                  ? `Nichts zu „${searchQuery.trim()}" gefunden – weder in Titeln, Inhalten noch Checklisten.`
                  : "Für diesen Filter gibt es keine Notizen. Passe den Filter an oder erstelle etwas Neues."}
              </p>
            </motion.div>
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
                Tippe auf das Plus für eine neue Liste – halte es gedrückt für eine Textnotiz.
              </p>
            </motion.div>
          )}
        </PullToRefresh>
      </div>

      {/* FAB: tap = checklist, long-press = type picker */}
      <FAB onCreateText={openText} onCreateChecklist={openChecklist} />
      </div>

      {/* Geoeffnete Notiz als eigenes Vollbild (Telefon) bzw. rechte Spalte (ab 1024 px).
          Bestehende Notizen morphen aus ihrer Karte (shared element). */}
      <NoteScreen
        open={isNoteOpen}
        variant={isWide ? "pane" : "overlay"}
        layoutId={session?.id ? `note-${session.id}` : undefined}
        label={session?.type === "checklist" ? "Liste bearbeiten" : "Notiz bearbeiten"}
      >
        {!session ? (
          <div className="flex flex-1 items-center justify-center" role="status" aria-label="Notiz wird geladen">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : session.type === "checklist" ? (
          <ChecklistEditor
            key={session.key}
            note={session.note}
            onClose={closeNote}
            onCreated={handleCreated}
            onRequestDelete={requestDeleteFromEditor}
          />
        ) : (
          /* The whole map, not one note's slice: a brand-new note only gets
             its id once the editor persists it, and it needs to pick up its
             images from that moment on. */
          <NoteEditor
            key={session.key}
            note={session.note}
            imagesByNote={imagesByNote}
            onClose={closeNote}
            onCreated={handleCreated}
            onRequestDelete={requestDeleteFromEditor}
          />
        )}
      </NoteScreen>

      {/* Global toast host (undo-delete, etc.) */}
      <Toast />
    </main>
  );
}
