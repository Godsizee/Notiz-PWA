"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import Masonry from "react-masonry-css";
import { useRouter } from "next/navigation";
import { RecordModel } from "pocketbase";
import { pb, isOwnedByMe } from "@/lib/pb";
import { useRealtimeNotes, useRealtimeImages } from "@/lib/useRealtime";
import { useChecklistSearchIndex } from "@/lib/useSearch";
import { useChecklistPreviewSync } from "@/lib/useChecklistPreview";
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
import { Layout, SearchX, ListTodo, FileText, Users, Archive } from "lucide-react";
import HomeTopBar from "@/components/home/HomeTopBar";
import SelectionBar from "@/components/home/SelectionBar";
import { useSelectionActive, useSelectionStore } from "@/store/useSelectionStore";
import { useSelectionHistory } from "@/lib/useSelectionHistory";
import { motion } from "framer-motion";
import { useNoteRoute } from "@/lib/useNoteRoute";
import { adoptCreatedId, resolveSession, restartSession, type SessionState } from "@/lib/noteRoute";
import { useMediaQuery, useScrollDirection } from "@/lib/useViewport";

const UNDO_DELETE_MS = 5000;

// Leerzustand je Filter: Symbol, Titel und ein Hinweis, was man tun kann.
const EMPTY_STATES: Record<NoteFilter, { Icon: typeof Layout; title: string; text: string }> = {
  all: { Icon: Layout, title: "Noch nichts hier", text: "Tippe auf + für eine Liste – halte es gedrückt für eine Textnotiz." },
  checklist: { Icon: ListTodo, title: "Keine Listen", text: "Tippe auf +, um eine Liste anzulegen." },
  text: { Icon: FileText, title: "Keine Textnotizen", text: "Halte + gedrückt, um eine Textnotiz anzulegen." },
  shared: { Icon: Users, title: "Noch nichts geteilt", text: "Öffne eine Notiz und tippe oben auf „Mit Partner teilen“." },
  archived: { Icon: Archive, title: "Archiv ist leer", text: "Wische eine Karte nach links, um sie zu archivieren." },
};

// Masonry-Schluessel sind Max-Breiten: bis 359 px eine Spalte, ab 360 px zwei,
// ab 769 px drei.
const breakpointColumnsObj = {
  default: 3,
  1100: 3,
  768: 2,
  359: 1,
};

export default function HomeScreen() {
  const { notes, isLoading, refetch } = useRealtimeNotes();
  // Loaded once for the whole overview rather than per card — see the hook.
  const imagesByNote = useRealtimeImages();
  // Eintraege aller Listen fuer die Kartenvorschau: ein Request, ein Abo.
  useChecklistPreviewSync();
  const router = useRouter();
  const showToast = useToastStore((s) => s.showToast);
  const viewMode = usePreferencesStore((s) => s.viewMode);
  const sortMode = usePreferencesStore((s) => s.sortMode);

  // Welche Notiz offen ist, steht in der URL (/?note=<id>, /?new=text|checklist),
  // siehe src/lib/noteRoute.ts. Daraus wird die Editor-Sitzung abgeleitet.
  const { route, openNote: pushNote, openNew, replaceWithId, close: closeNote } = useNoteRoute();
  const [sessionState, setSessionState] = useState<SessionState>({ status: "closed" });
  const sessionSeq = useRef(0);
  // Ab 1024 px Liste und Notiz nebeneinander statt Vollbild-Overlay (U40).
  const isWide = useMediaQuery("(min-width: 1024px)");
  // Beim Runterscrollen schrumpft der Plus-Knopf auf das Symbol.
  const fabCompact = useScrollDirection() === "down";
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

  // Mehrfachauswahl (lange druecken). Zurueck/Escape/✕ beenden sie, siehe
  // useSelectionHistory; ausgewaehlte, inzwischen verschwundene Notizen zaehlen nicht.
  const { exit: exitSelection } = useSelectionHistory();
  const selecting = useSelectionActive();
  const selectedIds = useSelectionStore((s) => s.ids);
  const selectedNotes = notes.filter((n) => selectedIds.has(n.id) && !pendingDeleteIds.has(n.id));
  const selectedCount = selectedNotes.length;
  useEffect(() => {
    if (selecting && !isLoading && selectedCount === 0) exitSelection();
  }, [selecting, isLoading, selectedCount, exitSelection]);

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

  // Snackbar ueber der unteren Leiste der Notiz statt ueber dem Plus-Knopf.
  const setToastOffset = useToastStore((s) => s.setOffset);
  useEffect(() => {
    setToastOffset(isNoteOpen ? "bar" : "fab");
  }, [isNoteOpen, setToastOffset]);

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
  const openNote = (note: RecordModel) => {
    hapticLight();
    pushNote(note.id);
  };

  // Liste <-> Textnotiz umgewandelt: anderer Editor fuer dieselbe Notiz. Der neue
  // Sitzungs-key erzwingt den frischen Mount (resolveSession aendert bei gleicher
  // ID bewusst nichts).
  const handleConverted = (note: RecordModel) =>
    setSessionState(restartSession(note, () => `editor-${++sessionSeq.current}`));

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

  // Der Editor hat die Notiz bereits (un)archiviert und sich geschlossen — hier
  // nur die Snackbar mit Rueckgaengig.
  const handleArchivedFromEditor = (id: string, archived: boolean) => {
    showToast({
      message: archived ? "Archiviert" : "Aus dem Archiv geholt",
      actionLabel: "Rückgängig",
      duration: UNDO_DELETE_MS,
      onAction: () => {
        hapticLight();
        applyChange({ collection: "notes", action: "update", id, data: { is_archived: !archived } }).catch((err) => {
          console.error("Failed to undo archive:", err);
          notifyError("Rückgängig fehlgeschlagen.");
        });
      },
    });
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

  // Soft-delete with a 5s undo window before the real PocketBase delete. Mehrere
  // Notizen (Mehrfachauswahl) teilen sich eine Snackbar und ein Rueckgaengig.
  const requestDeleteNotes = (noteIds: string[], message?: string) => {
    hapticHeavy();
    setPendingDeleteIds((prev) => new Set([...prev, ...noteIds]));

    const unpend = (id: string) =>
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

    for (const noteId of noteIds) {
      deleteTimers.current[noteId] = setTimeout(async () => {
        try {
          await applyChange({ collection: "notes", action: "delete", id: noteId });
        } catch (err) {
          console.error("Failed to delete note:", err);
        }
        delete deleteTimers.current[noteId];
        unpend(noteId);
      }, UNDO_DELETE_MS);
    }

    showToast({
      message: message ?? (noteIds.length === 1 ? "Notiz gelöscht" : `${noteIds.length} Notizen gelöscht`),
      actionLabel: "Rückgängig",
      tone: "danger",
      duration: UNDO_DELETE_MS,
      onAction: () => {
        for (const noteId of noteIds) {
          const t = deleteTimers.current[noteId];
          if (t) {
            clearTimeout(t);
            delete deleteTimers.current[noteId];
          }
          unpend(noteId);
        }
        hapticLight();
      },
    });
  };
  const requestDeleteNote = (noteId: string) => requestDeleteNotes([noteId]);

  // --- Mehrfachauswahl: Aktionen auf alle ausgewaehlten Notizen ---

  // Setzt `patch` auf alle Ziele und merkt sich die vorigen Werte fuer ein
  // gemeinsames Rueckgaengig.
  const bulkUpdate = async (targets: RecordModel[], patch: Record<string, unknown>, message: string) => {
    if (targets.length === 0) {
      exitSelection();
      return;
    }
    const previous = targets.map((n) => ({
      id: n.id,
      data: Object.fromEntries(Object.keys(patch).map((k) => [k, n[k]])),
    }));
    try {
      await Promise.all(
        targets.map((n) => applyChange({ collection: "notes", action: "update", id: n.id, data: patch }))
      );
    } catch (err) {
      console.error("Bulk update failed:", err);
      notifyError("Aktion fehlgeschlagen.");
      return;
    }
    exitSelection();
    showToast({
      message,
      actionLabel: "Rückgängig",
      duration: UNDO_DELETE_MS,
      onAction: () => {
        hapticLight();
        Promise.all(
          previous.map((p) => applyChange({ collection: "notes", action: "update", id: p.id, data: p.data }))
        ).catch((err) => {
          console.error("Bulk undo failed:", err);
          notifyError("Rückgängig fehlgeschlagen.");
        });
      },
    });
  };

  const handleBulkPin = () => {
    // Sind alle angepinnt → alle lösen, sonst alle anpinnen.
    const pin = !selectedNotes.every((n) => n.is_pinned);
    bulkUpdate(
      selectedNotes.filter((n) => !!n.is_pinned !== pin),
      { is_pinned: pin },
      pin ? "Angepinnt" : "Anpinnen aufgehoben"
    );
  };

  const handleBulkArchive = () => {
    const archive = !selectedNotes.every((n) => n.is_archived);
    const n = selectedNotes.length;
    bulkUpdate(
      selectedNotes.filter((note) => !!note.is_archived !== archive),
      { is_archived: archive },
      archive
        ? n === 1 ? "Archiviert" : `${n} Notizen archiviert`
        : n === 1 ? "Aus dem Archiv geholt" : `${n} Notizen aus dem Archiv geholt`
    );
  };

  const handleBulkColor = (color: string) => {
    bulkUpdate(
      selectedNotes.filter((n) => getNoteColorStyles(n.color).id !== getNoteColorStyles(color).id),
      { color },
      "Farbe geändert"
    );
  };

  const handleBulkDuplicate = async () => {
    const targets = selectedNotes;
    let skippedImages = 0;
    let failed = 0;
    for (const n of targets) {
      try {
        skippedImages += (await duplicateNote(n)).skippedImages;
      } catch (err) {
        console.error("Failed to duplicate note:", err);
        failed++;
      }
    }
    exitSelection();
    if (failed === targets.length) {
      notifyError("Duplizieren fehlgeschlagen.");
      return;
    }
    hapticLight();
    const done = targets.length - failed;
    showToast({
      message:
        (done === 1 ? "Notiz dupliziert" : `${done} Notizen dupliziert`) +
        (skippedImages > 0 ? ` – ${skippedImages} Bild${skippedImages === 1 ? "" : "er"} fehlt${skippedImages === 1 ? "" : "en"} (offline)` : ""),
      duration: skippedImages > 0 ? 4000 : 3000,
    });
  };

  // Loeschen nur fuer eigene Notizen: eine geteilte Notiz darf nur der Besitzer loeschen.
  const handleBulkDelete = () => {
    const mine = selectedNotes.filter((n) => isOwnedByMe(n));
    const skipped = selectedNotes.length - mine.length;
    if (mine.length === 0) {
      notifyError("Nur eigene Notizen können gelöscht werden.");
      return;
    }
    requestDeleteNotes(mine.map((n) => n.id), skipped > 0 ? `${mine.length} gelöscht, ${skipped} nicht deine` : undefined);
    exitSelection();
  };

  // Delete requested from inside an open editor → close the note then soft-delete.
  const requestDeleteFromEditor = (noteId: string) => {
    closeNote();
    requestDeleteNote(noteId);
  };

  // Keyboard shortcuts (desktop)
  useKeyboardShortcuts({
    // Bei offener Vollbild-Notiz sind N/L gesperrt (die Uebersicht ist inert);
    // in der Liste-Detail-Ansicht ab 1024 px bleiben sie erlaubt.
    onNewNote: () => { if (!isNoteOpen || isWide) openText(); },
    onNewChecklist: () => { if (!isNoteOpen || isWide) openChecklist(); },
    onEscape: () => {
      if (isNoteOpen) closeNote();
      else if (selecting) exitSelection();
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
      if (activeFilter === "shared") return n.is_shared;
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
    // Angepinnte zuerst. Die Sortierung nach Datum gibt es nicht: notes hat kein
    // created/updated (der frueher hier stehende Vergleich ergab immer NaN), also
    // bleibt bei "Standard" die Reihenfolge der Datenbank (Array.sort ist stabil).
    .sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      if (sortMode === "title") return String(a.title || "").localeCompare(String(b.title || ""), "de");
      return 0;
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
        breakpointCols={isWide ? 1 : breakpointColumnsObj}
        className="my-masonry-grid"
        columnClassName="my-masonry-grid_column"
      >
        {children}
      </Masonry>
    );

  // main nutzt overflow-clip statt -hidden: schneidet die Glow-Flaechen ab, macht
  // main aber nicht zum Scroll-Container — sonst haftet die sticky Suchleiste
  // nicht am Fenster.
  return (
    <main className="min-h-screen bg-[var(--background)] relative overflow-clip transition-colors duration-300">
      {/* Uebersicht bleibt gemountet (Scrollposition, Realtime), ist aber bei
          offener Vollbild-Notiz fuer Tastatur und Screenreader gesperrt. */}
      {/* Ab 1024 px: links die Uebersicht (420 px), rechts die Notiz als Spalte. */}
      <div className={isWide ? "mx-auto flex min-h-screen max-w-7xl" : undefined}>
      <div inert={isNoteOpen && !isWide} className={isWide ? "w-[420px] shrink-0 pb-28" : "pb-28"}>
      {/* Dynamic ambient color glows */}
      <div className="absolute top-[-30%] right-[-10%] w-[600px] h-[600px] rounded-full blur-[140px] pointer-events-none" style={{ background: "var(--glow-a)" }} />
      <div className="absolute bottom-[-10%] left-[-20%] w-[600px] h-[600px] rounded-full blur-[140px] pointer-events-none" style={{ background: "var(--glow-b)" }} />

      {selecting ? (
        <SelectionBar
          count={selectedCount}
          allPinned={selectedNotes.length > 0 && selectedNotes.every((n) => n.is_pinned)}
          allArchived={selectedNotes.length > 0 && selectedNotes.every((n) => n.is_archived)}
          onExit={exitSelection}
          onTogglePin={handleBulkPin}
          onToggleArchive={handleBulkArchive}
          onChangeColor={handleBulkColor}
          onDuplicate={handleBulkDuplicate}
          onDelete={handleBulkDelete}
        />
      ) : (
        <HomeTopBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      )}

      <div className="max-w-4xl mx-auto px-4 md:px-6 mt-2 relative z-10 animate-fade-in-up">
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
          ) : (
            /* Nichts zu zeigen: Suche ohne Treffer, Farbfilter oder ein leerer Filter */
            (() => {
              const noMatch = !!searchTerm || (hasAnyNotes && !!activeColor);
              const empty = EMPTY_STATES[activeFilter];
              const Icon = noMatch ? SearchX : empty.Icon;
              return (
                <motion.div
                  key={noMatch ? "no-match" : activeFilter}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-20 text-center px-4"
                >
                  <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 border ${
                    noMatch
                      ? "bg-[var(--card-bg)] text-[var(--text-muted)] border-[var(--border-color)]"
                      : "bg-primary/10 text-primary border-primary/15 shadow-inner"
                  }`}>
                    <Icon className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-bold text-[var(--text-primary)]">
                    {noMatch ? "Keine Treffer" : empty.title}
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-sm leading-relaxed">
                    {searchTerm
                      ? `Nichts zu „${searchQuery.trim()}" gefunden – weder in Titeln, Inhalten noch Checklisten.`
                      : noMatch
                        ? "Für diese Farbe gibt es keine Notizen. Passe den Filter an."
                        : empty.text}
                  </p>
                </motion.div>
              );
            })()
          )}
        </PullToRefresh>
      </div>

      {/* FAB: tap = checklist, long-press = type picker */}
      {!selecting && (
        <FAB onCreateText={openText} onCreateChecklist={openChecklist} compact={fabCompact} anchor={isWide ? "column" : "screen"} />
      )}
      </div>

      {/* Geoeffnete Notiz als eigenes Vollbild (Telefon) bzw. rechte Spalte (ab 1024 px).
          Bestehende Notizen morphen aus ihrer Karte (shared element). Der Rahmen
          steht in beiden Modi an derselben Stelle im Baum, damit der Editor beim
          Wechsel der Fensterbreite nicht neu gemountet wird. */}
      <div className={isWide ? "sticky top-0 h-dvh min-w-0 flex-1 border-l border-[var(--border-color)]" : undefined}>
      <NoteScreen
        open={isNoteOpen}
        variant={isWide ? "pane" : "overlay"}
        // Nur bestehende Notizen morphen aus ihrer Karte. Eine neue Notiz bekommt
        // ihre ID erst beim Speichern; liefe sie dann mit derselben layoutId wie
        // die frisch angelegte Karte, bliebe der Crossfade bei ~98 % haengen und
        // die Uebersicht schimmerte durch.
        layoutId={session?.note ? `note-${session.note.id}` : undefined}
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
            onArchived={handleArchivedFromEditor}
            onConverted={handleConverted}
            onDuplicate={handleDuplicate}
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
            onArchived={handleArchivedFromEditor}
            onConverted={handleConverted}
            onDuplicate={handleDuplicate}
            onRequestDelete={requestDeleteFromEditor}
          />
        )}
      </NoteScreen>

      {/* Rechte Spalte ohne offene Notiz: Platzhalter hinter dem (ausblendenden) NoteScreen */}
      {isWide && (
        <div inert={isNoteOpen} className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/15 bg-primary/10 text-primary">
            <FileText className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Wähle eine Notiz</h2>
          <p className="max-w-xs text-sm text-[var(--text-secondary)]">Oder lege eine neue an.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={openChecklist}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary-strong px-4 text-sm font-bold text-white cursor-pointer"
            >
              <ListTodo className="h-4 w-4" />
              Neue Liste
            </button>
            <button
              onClick={openText}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] px-4 text-sm font-bold text-[var(--text-primary)] cursor-pointer"
            >
              <FileText className="h-4 w-4" />
              Neue Notiz
            </button>
          </div>
        </div>
      )}
      </div>
      </div>

      {/* Global toast host (undo-delete, etc.) */}
      <Toast />
    </main>
  );
}
