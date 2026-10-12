import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RecordModel } from 'pocketbase';
import { pb, isOwnedByMe } from '@/lib/pb';
import { Palette, Pin, Archive, Trash2, Check, ExternalLink, RefreshCw, Users, Plus, MoreVertical, Camera, Images, ClipboardPaste, ListChecks, Copy, Share2, ClipboardCopy, List, ListTodo, Bold } from 'lucide-react';
import { getNoteColorStyles, NOTE_COLORS } from '@/lib/colors';
import { applyChange, newRecordId } from '@/lib/sync';
import { motion, AnimatePresence } from 'framer-motion';
import { type ImagesByNote } from '@/lib/useRealtime';
import { attachImages, deleteImage, moveImageFirst, MAX_IMAGES_PER_NOTE } from '@/lib/noteImages';
import { useToastStore } from '@/store/useToastStore';
import { useSyncStore } from '@/store/useSyncStore';
import { hapticLight } from '@/lib/haptics';
import NoteImageGallery from '@/components/notes/NoteImageGallery';
import ImageViewer from '@/components/notes/ImageViewer';
import { NoteTopBar, NoteBottomBar, BarButton } from '@/components/notes/NoteBars';
import { useEscapeKey } from '@/lib/useEscapeKey';
import { convertTextToChecklist } from '@/lib/convertNote';
import { noteToShareText } from '@/lib/noteText';
import { continueListOnEnter, toggleBold, toggleLineMarker, type LineMarker, type TextEdit } from '@/lib/textFormat';

interface NoteEditorProps {
  note?: RecordModel | null; // null if creating a new note
  /**
   * All images keyed by note id. The full map rather than one note's slice,
   * because a new note only gets its id once this editor persists it.
   */
  imagesByNote?: ImagesByNote;
  onClose: () => void;
  /** Eine neue Notiz wurde zum ersten Mal gespeichert (HomeScreen stellt die URL um). */
  onCreated?: (id: string) => void;
  /** Notiz wurde ueber die Leiste (un)archiviert und gleich geschlossen — HomeScreen zeigt die Snackbar. */
  onArchived?: (id: string, archived: boolean) => void;
  /** Notiz wurde in eine Liste umgewandelt — HomeScreen startet den Listen-Editor. */
  onConverted?: (note: RecordModel) => void;
  /** Kopie anlegen (HomeScreen kennt duplicateNote samt Snackbar). */
  onDuplicate?: (note: RecordModel) => void;
  /** When provided, deleting routes through the app's soft-delete + undo toast. */
  onRequestDelete?: (noteId: string) => void;
}

export default function NoteEditor({ note, imagesByNote, onClose, onCreated, onArchived, onConverted, onDuplicate, onRequestDelete }: NoteEditorProps) {
  const [title, setTitle] = useState(note?.title || '');
  const [content, setContent] = useState(note?.content || '');
  const [color, setColor] = useState(note?.color || 'white');
  const [isPinned, setIsPinned] = useState(note?.is_pinned || false);
  const [isArchived, setIsArchived] = useState(note?.is_archived || false);
  const [isShared, setIsShared] = useState(note?.is_shared || false);
  const [showPalette, setShowPalette] = useState(false);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [contentFocused, setContentFocused] = useState(false);
  const contentBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleFieldRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const showToast = useToastStore((s) => s.showToast);
  // ensureNoteId/performSave sind stabile Callbacks — onCreated ueber eine Ref lesen.
  const onCreatedRef = useRef(onCreated);
  useEffect(() => { onCreatedRef.current = onCreated; }, [onCreated]);
  const isOnline = useSyncStore((s) => s.isOnline);

  // Track active ID to differentiate between updates and first-time creation
  const [activeNoteId, setActiveNoteId] = useState<string | undefined>(note?.id);

  // Memoised so the identity is stable across renders — it feeds an effect.
  const images = useMemo(
    () => (activeNoteId && imagesByNote?.[activeNoteId]) || [],
    [activeNoteId, imagesByNote]
  );

  // Refs for unmount-cleanup (always hold latest values without re-registering the effect)
  const activeNoteIdRef = useRef<string | undefined>(note?.id);
  const titleRef = useRef(note?.title || '');
  const contentRef = useRef(note?.content || '');
  const colorRef = useRef(note?.color || 'white');
  const isPinnedRef = useRef(note?.is_pinned || false);
  const isArchivedRef = useRef(note?.is_archived || false);
  const isSharedRef = useRef(note?.is_shared || false);
  const imagesRef = useRef<RecordModel[]>(images);
  // Set the moment an attach starts, before the new record has round-tripped
  // back through the images map — otherwise closing right after picking a
  // photo would look like an empty note to the ghost-note cleanup below.
  const hasAttachedRef = useRef(false);
  useEffect(() => { activeNoteIdRef.current = activeNoteId; }, [activeNoteId]);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { contentRef.current = content; }, [content]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { isPinnedRef.current = isPinned; }, [isPinned]);
  useEffect(() => { isArchivedRef.current = isArchived; }, [isArchived]);
  useEffect(() => { isSharedRef.current = isShared; }, [isShared]);
  useEffect(() => {
    imagesRef.current = images;
    // Keep the bridging flag honest in both directions: once the records have
    // arrived it's redundant, and once the last image is deleted again the
    // note really is empty and should be cleaned up on close as before.
    if (images.length > 0) hasAttachedRef.current = true;
    else if (!isAttaching) hasAttachedRef.current = false;
  }, [images, isAttaching]);

  /** True when the note carries nothing worth keeping — text *or* images. */
  const isEmptyNote = useCallback(
    () =>
      !titleRef.current.trim() &&
      !contentRef.current.trim() &&
      imagesRef.current.length === 0 &&
      !hasAttachedRef.current,
    []
  );

  // Nach einer Umwandlung darf dieser Editor nichts mehr schreiben: performSave
  // wuerde `type` zurueckdrehen, die Ghost-Bereinigung die Notiz loeschen.
  const persistLockedRef = useRef(false);

  // Ghost-Note-Cleanup: delete silently if closed while completely empty
  useEffect(() => {
    return () => {
      const id = activeNoteIdRef.current;
      if (!persistLockedRef.current && id && isEmptyNote()) {
        applyChange({ collection: 'notes', action: 'delete', id }).catch(() => {});
      }
    };
  }, [isEmptyNote]);

  // Auto-expand textarea height as content changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [content]);

  // Debounced auto-save (500ms). The pending timer lives in a ref so it can be
  // flushed early (see effect below) instead of silently dropping the last
  // edit when the sheet closes faster than the debounce window.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `owner` is deliberately absent: on a shared note the other user's
  // auto-save would otherwise rewrite owner to *themselves*, silently
  // transferring the note — and locking the original owner out the moment
  // sharing is switched off again. It is only set when creating (newNoteData).
  const noteData = useCallback(() => {
    return {
      title: titleRef.current,
      content: contentRef.current,
      type: 'text',
      color: colorRef.current,
      is_pinned: isPinnedRef.current,
      is_archived: isArchivedRef.current,
      is_shared: isSharedRef.current,
    };
  }, []);

  const newNoteData = useCallback(() => {
    const user = pb.authStore.model || pb.authStore.record;
    return { ...noteData(), owner: user?.id };
  }, [noteData]);

  /**
   * Guarantees a persisted note to hang images off. A new note is normally
   * only created once there is text; attaching a photo is just as much a
   * reason to create it, so this bypasses that check.
   */
  const ensureNoteId = useCallback(async (): Promise<string> => {
    const existing = activeNoteIdRef.current;
    if (existing) return existing;

    const record = await applyChange({
      collection: 'notes',
      action: 'create',
      id: newRecordId(),
      data: newNoteData(),
    });
    activeNoteIdRef.current = record.id;
    setActiveNoteId(record.id);
    onCreatedRef.current?.(record.id);
    return record.id;
  }, [newNoteData]);

  const performSave = useCallback(async () => {
    if (persistLockedRef.current) return;
    const id = activeNoteIdRef.current;
    // Nothing meaningful to persist — also avoids racing the ghost-note
    // cleanup, which deletes an emptied note on close instead. An image-only
    // note is *not* empty, but it always has an id already (see ensureNoteId),
    // so it takes the update branch.
    if (isEmptyNote()) return;

    try {
      setIsSaving(true);
      if (id) {
        await applyChange({ collection: 'notes', action: 'update', id, data: noteData() });
      } else {
        const record = await applyChange({
          collection: 'notes',
          action: 'create',
          id: newRecordId(),
          data: newNoteData(),
        });
        activeNoteIdRef.current = record.id;
        setActiveNoteId(record.id);
        onCreatedRef.current?.(record.id);
      }
      setLastSavedAt(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.error("Failed to auto-save note:", err);
    } finally {
      // keep saving state visible slightly longer for smooth visual transitions
      setTimeout(() => setIsSaving(false), 400);
    }
  }, [isEmptyNote, noteData, newNoteData]);

  useEffect(() => {
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      performSave();
    }, 500);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
    // NB: none of these are read in the effect body — performSave() goes
    // through refs. This list *is* the "what should schedule a save" set, so
    // every piece of note state with its own toolbar button has to appear
    // here. `isShared` was missing, which is why tapping Teilen on a note
    // never persisted unless some other edit happened to save it along.
  }, [title, content, color, isPinned, isArchived, isShared, activeNoteId, performSave]);

  // Flush a still-pending save immediately on tab-hide/close/unmount so a
  // quick edit-then-leave doesn't drop the last 500ms of typing.
  useEffect(() => {
    const flushPending = () => {
      if (!saveTimerRef.current) return;
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      performSave();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushPending();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flushPending);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flushPending);
      flushPending();
    };
  }, [performSave]);

  const handleDelete = () => {
    // Route through the app-level soft-delete + undo toast when available.
    if (activeNoteId && onRequestDelete) {
      onRequestDelete(activeNoteId);
      return;
    }
    if (activeNoteId) {
      applyChange({ collection: 'notes', action: 'delete', id: activeNoteId }).catch(err =>
        console.error("Failed to delete note:", err)
      );
    }
    onClose();
  };

  // Archivieren schliesst die Notiz (Keep-Verhalten); HomeScreen zeigt die
  // Snackbar "Archiviert · Rueckgaengig".
  const handleArchiveAndClose = () => {
    const id = activeNoteIdRef.current;
    if (!id) return;
    const next = !isArchivedRef.current;
    // Direkt speichern statt auf den Debounce zu hoffen: der Editor wird gleich
    // unmountet, und das Flushen beim Unmount greift nur bei laufendem Timer.
    isArchivedRef.current = next;
    setIsArchived(next);
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void performSave();
    onArchived?.(id, next);
    onClose();
  };

  // --- Formatierung: Muster, die NoteContent schon darstellt ---

  // Aendert den Text und setzt danach die Auswahl neu — ein kontrolliertes
  // textarea springt nach setContent mit dem Cursor ans Ende.
  const applyTextEdit = (edit: TextEdit) => {
    setContent(edit.value);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(edit.start, edit.end);
    });
  };

  const formatLines = (marker: LineMarker) => {
    const el = textareaRef.current;
    if (!el) return;
    applyTextEdit(toggleLineMarker(contentRef.current, el.selectionStart, el.selectionEnd, marker));
  };

  const formatBold = () => {
    const el = textareaRef.current;
    if (!el) return;
    applyTextEdit(toggleBold(contentRef.current, el.selectionStart, el.selectionEnd));
  };

  // Enter in einer Aufzaehlungs-/Kaestchen-Zeile setzt das Muster fort; in einer
  // leeren Musterzeile beendet es die Liste.
  const handleContentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const edit = continueListOnEnter(contentRef.current, el.selectionStart);
    if (!edit) return;
    e.preventDefault();
    applyTextEdit(edit);
  };

  // Blur verzoegert, damit ein Tipp auf einen Formatierknopf die Leiste nicht vorher ausblendet.
  const handleContentFocus = () => {
    if (contentBlurTimer.current) clearTimeout(contentBlurTimer.current);
    setContentFocused(true);
  };
  const handleContentBlur = () => {
    contentBlurTimer.current = setTimeout(() => setContentFocused(false), 150);
  };
  useEffect(() => () => {
    if (contentBlurTimer.current) clearTimeout(contentBlurTimer.current);
  }, []);

  // --- Umwandeln, Teilen, Kopieren, Duplizieren (Mehr-Menue) ---

  const flushPendingSave = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await performSave();
  };

  const handleConvertToChecklist = async () => {
    closePopovers();
    if (!window.confirm('In eine Liste umwandeln? Jede Zeile wird ein Eintrag.')) return;
    try {
      // Eine neue, noch nie gespeicherte Notiz braucht erst eine ID.
      const id = await ensureNoteId();
      // Letzte Eingaben sichern, dann jedes weitere Schreiben dieses Editors sperren.
      await flushPendingSave();
      persistLockedRef.current = true;
      const updated = await convertTextToChecklist(id, contentRef.current);
      onConverted?.({ ...updated, title: titleRef.current || updated.title } as RecordModel);
    } catch (err) {
      persistLockedRef.current = false;
      console.error('Failed to convert note:', err);
      showToast({ message: 'Umwandeln fehlgeschlagen.', tone: 'danger', duration: 3500 });
    }
  };

  const shareText = () => noteToShareText(titleRef.current, contentRef.current, null);

  const handleCopyText = async () => {
    closePopovers();
    try {
      await navigator.clipboard.writeText(shareText());
      showToast({ message: 'Text kopiert', duration: 2500 });
    } catch {
      showToast({ message: 'Kopieren nicht möglich.', tone: 'danger', duration: 3500 });
    }
  };

  const handleShareText = async () => {
    closePopovers();
    if (navigator.share) {
      try {
        await navigator.share({ title: titleRef.current || undefined, text: shareText() });
      } catch {
        // abgebrochen
      }
    } else {
      await handleCopyText();
    }
  };

  const handleDuplicateNote = async () => {
    closePopovers();
    await flushPendingSave();
    const id = activeNoteIdRef.current;
    if (!id || !onDuplicate) return;
    onDuplicate({ ...(note ?? {}), id, type: 'text', title: titleRef.current, content: contentRef.current, color: colorRef.current } as RecordModel);
  };

  // Titel in der oberen Leiste erst zeigen, wenn der grosse Titel weggescrollt ist.
  const [titleHidden, setTitleHidden] = useState(false);
  useEffect(() => {
    const el = titleFieldRef.current;
    const root = scrollRef.current;
    if (!el || !root) return;
    const io = new IntersectionObserver(([e]) => setTitleHidden(!e.isIntersecting), { root, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const closePopovers = () => {
    setShowPalette(false);
    setShowImageMenu(false);
    setShowMoreMenu(false);
  };
  // Escape schliesst das offene Popover, nicht die Notiz (useEscapeKey).
  useEscapeKey(showPalette || showImageMenu || showMoreMenu, closePopovers);

  // --- Images ---

  const addFiles = useCallback(async (files: File[]) => {
    const pictures = files.filter((f) => f.type.startsWith('image/'));
    if (pictures.length === 0) return;

    hasAttachedRef.current = true;
    setIsAttaching(true);
    try {
      const noteId = await ensureNoteId();
      const result = await attachImages(noteId, pictures, imagesRef.current.length);

      if (result.processed > 0) hapticLight();
      if (result.skipped > 0) {
        showToast({
          message: `Maximal ${MAX_IMAGES_PER_NOTE} Bilder pro Notiz.`,
          tone: 'danger',
          duration: 3500,
        });
      } else if (result.failed > 0) {
        showToast({
          message: `${result.failed} Bild${result.failed === 1 ? '' : 'er'} konnte${result.failed === 1 ? '' : 'n'} nicht gelesen werden.`,
          tone: 'danger',
          duration: 3500,
        });
      }
      if (result.processed === 0) hasAttachedRef.current = imagesRef.current.length > 0;
    } catch (err) {
      console.error('Failed to attach images:', err);
      showToast({ message: 'Bild konnte nicht angehängt werden.', tone: 'danger', duration: 3500 });
    } finally {
      setIsAttaching(false);
    }
  }, [ensureNoteId, showToast]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    // Reset so picking the same file twice in a row still fires a change event.
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    addFiles(files);
  };

  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        files.push(new File([blob], `clipboard.${type.split('/')[1] || 'png'}`, { type }));
      }
      if (files.length === 0) {
        showToast({ message: 'Kein Bild in der Zwischenablage.', duration: 3000 });
        return;
      }
      addFiles(files);
    } catch {
      showToast({ message: 'Zugriff auf die Zwischenablage nicht möglich.', tone: 'danger', duration: 3000 });
    }
  };

  const handleDeleteImage = async (image: RecordModel) => {
    try {
      await deleteImage(image);
      hapticLight();
    } catch (err) {
      console.error('Failed to delete image:', err);
      showToast({ message: 'Bild konnte nicht gelöscht werden.', tone: 'danger', duration: 3500 });
    }
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
  const canShare = isOwnedByMe(note);
  const canDelete = isOwnedByMe(note);

  const imageMenuItem =
    'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--background)]/80 transition-colors cursor-pointer text-left whitespace-nowrap';

  // Obere Leiste: die Zustands-Aktionen der Notiz (wie in Keep).
  const topActions = (
    <>
      <BarButton
        label={canShare ? (isShared ? 'Nicht mehr teilen' : 'Mit Partner teilen') : 'Nur wer die Notiz angelegt hat, kann das Teilen beenden'}
        pressed={isShared}
        disabled={!canShare}
        onClick={() => setIsShared(!isShared)}
      >
        <Users size={20} />
      </BarButton>
      <BarButton label={isPinned ? 'Anpinnen aufheben' : 'Anpinnen'} pressed={isPinned} onClick={() => setIsPinned(!isPinned)}>
        <Pin size={20} className={isPinned ? 'fill-current' : ''} />
      </BarButton>
      <BarButton
        label={isArchived ? 'Aus dem Archiv holen' : 'Archivieren'}
        pressed={isArchived}
        disabled={!activeNoteId}
        onClick={handleArchiveAndClose}
      >
        <Archive size={20} />
      </BarButton>
    </>
  );

  // Untere Leiste links: Bild hinzufuegen und Farbe. Die Popover haengen an der
  // Leiste selbst (sticky = Bezugsrahmen) und bleiben so ueber der Tastatur,
  // auch wenn iOS die Leiste per Transform nach oben schiebt.
  const bottomLeading = (
    <>
      <BarButton
        label="Bild hinzufügen"
        expanded={showImageMenu}
        disabled={images.length >= MAX_IMAGES_PER_NOTE}
        onClick={() => { const next = !showImageMenu; closePopovers(); setShowImageMenu(next); }}
      >
        <Plus size={22} />
      </BarButton>
      <BarButton
        label="Farbe ändern"
        expanded={showPalette}
        onClick={() => { const next = !showPalette; closePopovers(); setShowPalette(next); }}
      >
        <Palette size={20} />
      </BarButton>

      {/* Formatierung, solange der Cursor im Text steht */}
      {contentFocused && (
        <>
          <BarButton label="Aufzählung" keepFocus onClick={() => formatLines('bullet')}>
            <List size={20} />
          </BarButton>
          <BarButton label="Kästchen" keepFocus onClick={() => formatLines('checkbox')}>
            <ListTodo size={20} />
          </BarButton>
          <BarButton label="Fett" keepFocus onClick={formatBold}>
            <Bold size={20} />
          </BarButton>
        </>
      )}

      <AnimatePresence>
        {showImageMenu && (
          <motion.div
            key="image-menu"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full left-2 mb-2 z-30 bg-[var(--card-bg)] border border-[var(--border-color)] shadow-[var(--shadow-elevated)] rounded-2xl p-1.5 min-w-[11rem]"
          >
            <button
              className={imageMenuItem}
              onClick={() => { setShowImageMenu(false); cameraInputRef.current?.click(); }}
            >
              <Camera className="w-4 h-4 text-primary" /> Foto aufnehmen
            </button>
            <button
              className={imageMenuItem}
              onClick={() => { setShowImageMenu(false); galleryInputRef.current?.click(); }}
            >
              <Images className="w-4 h-4 text-primary" /> Aus Galerie
            </button>
            <button
              className={imageMenuItem}
              onClick={() => { setShowImageMenu(false); pasteFromClipboard(); }}
            >
              <ClipboardPaste className="w-4 h-4 text-primary" /> Einfügen
            </button>
          </motion.div>
        )}

        {showPalette && (
          <motion.div
            key="palette"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full left-2 mb-2 z-30 bg-[var(--card-bg)] border border-[var(--border-color)] shadow-[var(--shadow-elevated)] rounded-2xl p-3 flex flex-wrap gap-2 max-w-[min(18rem,calc(100vw-1rem))]"
          >
            {NOTE_COLORS.map(c => (
              <button
                key={c.id}
                className="w-9 h-9 rounded-full border border-black/10 shadow-inner transition-transform hover:scale-110 relative flex items-center justify-center cursor-pointer"
                style={{ backgroundColor: c.hex }}
                onClick={() => { setColor(c.hex); setShowPalette(false); }}
                title={c.label}
                aria-label={c.label}
                aria-pressed={color === c.hex}
              >
                {color === c.hex && (
                  <Check className="w-4 h-4 text-slate-800" />
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  const statusText = isSaving || isAttaching
    ? 'Speichert…'
    : !isOnline
      ? 'Lokal gespeichert'
      : lastSavedAt
        ? `Bearbeitet ${lastSavedAt}`
        : 'Gespeichert';

  const menuItemClass =
    'flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--background)]/80 transition-colors cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed';

  // Untere Leiste rechts: Mehr-Menue (Popover geht nach oben auf).
  const bottomTrailing = (
    <>
      <BarButton
        label="Mehr"
        expanded={showMoreMenu}
        onClick={() => { const next = !showMoreMenu; closePopovers(); setShowMoreMenu(next); }}
      >
        <MoreVertical size={20} />
      </BarButton>

      <AnimatePresence>
        {showMoreMenu && (
          <motion.div
            key="more-menu"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-full right-2 mb-2 z-30 bg-card border border-[var(--border-color)] shadow-2xl rounded-2xl p-2 flex flex-col gap-1 min-w-[200px]"
          >
            {/* Bilder haengen an der Notiz, der Listen-Editor zeigt sie nicht: nicht umwandeln. */}
            <button
              onClick={handleConvertToChecklist}
              disabled={images.length > 0}
              title={images.length > 0 ? 'Notizen mit Bildern lassen sich nicht in eine Liste umwandeln' : undefined}
              className={menuItemClass}
            >
              <ListChecks className="w-4 h-4 text-primary" />
              <span>In Liste umwandeln</span>
            </button>
            <button onClick={handleDuplicateNote} disabled={!activeNoteId} className={menuItemClass}>
              <Copy className="w-4 h-4 text-primary" />
              <span>Duplizieren</span>
            </button>
            <button onClick={handleShareText} className={menuItemClass}>
              <Share2 className="w-4 h-4 text-primary" />
              <span>Teilen</span>
            </button>
            <button onClick={handleCopyText} className={menuItemClass}>
              <ClipboardCopy className="w-4 h-4 text-primary" />
              <span>Text kopieren</span>
            </button>
            <div className="h-px bg-[var(--border-color)] my-1 mx-2" />
            <button
              onClick={() => { setShowMoreMenu(false); handleDelete(); }}
              disabled={!canDelete}
              title={canDelete ? undefined : 'Nur wer die Notiz angelegt hat, kann sie löschen'}
              className="flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-500/5 transition-colors cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              <span>Notiz löschen</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  return (
    <div
      className={`relative flex min-h-0 flex-1 flex-col transition-colors duration-300 ${colorStyles.bg}`}
      style={colorStyles.style}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setIsDropTarget(true);
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setIsDropTarget(false);
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {/* Hidden pickers. Two inputs rather than one, because `capture` is what
          makes Android open the camera directly instead of the file chooser. */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onInputChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onInputChange}
        className="hidden"
      />

      <NoteTopBar
        onBack={onClose}
        title={title || 'Notiz'}
        showTitle={titleHidden}
        scrollRef={scrollRef}
        actions={topActions}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
      <div className="flex min-h-full flex-col">
      {/* Image gallery — above the title, Google Keep style */}
      <NoteImageGallery
        images={images}
        onOpen={(index) => setViewerIndex(index)}
        onDelete={handleDeleteImage}
      />

      {isAttaching && (
        <div className="flex items-center gap-2 mb-3 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <RefreshCw className="w-3 h-3 animate-spin text-primary" />
          Bild wird vorbereitet...
        </div>
      )}

      {/* Title Textarea */}
      <div className="mb-4 pt-1">
        <textarea
          ref={titleFieldRef}
          placeholder="Titel"
          className="w-full text-2xl font-extrabold bg-transparent border-none focus:outline-none resize-none text-[var(--text-primary)] placeholder-[var(--text-muted)]/40 leading-snug"
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
      </div>

      {/* Content Textarea */}
      <textarea
        ref={textareaRef}
        placeholder="Notiz schreiben..."
        className="w-full flex-grow bg-transparent border-none focus:outline-none resize-none text-base md:text-lg text-[var(--text-secondary)] placeholder-[var(--text-muted)]/30 min-h-[20vh] leading-relaxed"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={handleContentKeyDown}
        onFocus={handleContentFocus}
        onBlur={handleContentBlur}
      />

      {/* Tactile URL Link Pills (Touch-first link interaction) */}
      {extractedLinks.length > 0 && (
        <div className="mt-8 pt-4 border-t border-[var(--border-color)]">
          <p className="text-[11px] font-extrabold text-[var(--text-muted)] tracking-wider uppercase mb-3 flex items-center gap-1">
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

      </div>
      </div>

      {/* Desktop drag & drop affordance */}
      {isDropTarget && (
        <div className="absolute inset-3 rounded-3xl border-2 border-dashed border-primary/60 bg-primary/5 flex items-center justify-center pointer-events-none z-40">
          <span className="text-sm font-bold text-primary">Bilder hier ablegen</span>
        </div>
      )}

      <NoteBottomBar leading={bottomLeading} status={contentFocused ? '' : statusText} trailing={bottomTrailing} />

      {viewerIndex !== null && images.length > 0 && (
        <ImageViewer
          images={images}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onDelete={handleDeleteImage}
          onMakeCover={(image) => moveImageFirst(image, imagesRef.current).catch(() => {})}
        />
      )}
    </div>
  );
}
