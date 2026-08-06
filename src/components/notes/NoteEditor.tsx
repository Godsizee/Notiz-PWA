import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RecordModel } from 'pocketbase';
import { pb, isOwnedByMe } from '@/lib/pb';
import { Palette, Pin, Archive, Trash2, Check, ExternalLink, RefreshCw, Users, ImagePlus, Camera, Images, ClipboardPaste } from 'lucide-react';
import { getNoteColorStyles, NOTE_COLORS } from '@/lib/colors';
import { applyChange, newRecordId } from '@/lib/sync';
import { motion, AnimatePresence } from 'framer-motion';
import { type ImagesByNote } from '@/lib/useRealtime';
import { attachImages, deleteImage, moveImageFirst, MAX_IMAGES_PER_NOTE } from '@/lib/noteImages';
import { useToastStore } from '@/store/useToastStore';
import { hapticLight } from '@/lib/haptics';
import NoteImageGallery from '@/components/notes/NoteImageGallery';
import ImageViewer from '@/components/notes/ImageViewer';

interface NoteEditorProps {
  note?: RecordModel | null; // null if creating a new note
  /**
   * All images keyed by note id. The full map rather than one note's slice,
   * because a new note only gets its id once this editor persists it.
   */
  imagesByNote?: ImagesByNote;
  onClose: () => void;
  /** When provided, deleting routes through the app's soft-delete + undo toast. */
  onRequestDelete?: (noteId: string) => void;
}

export default function NoteEditor({ note, imagesByNote, onClose, onRequestDelete }: NoteEditorProps) {
  const [title, setTitle] = useState(note?.title || '');
  const [content, setContent] = useState(note?.content || '');
  const [color, setColor] = useState(note?.color || 'white');
  const [isPinned, setIsPinned] = useState(note?.is_pinned || false);
  const [isArchived, setIsArchived] = useState(note?.is_archived || false);
  const [isShared, setIsShared] = useState(note?.is_shared || false);
  const [showPalette, setShowPalette] = useState(false);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const showToast = useToastStore((s) => s.showToast);

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

  // Ghost-Note-Cleanup: delete silently if closed while completely empty
  useEffect(() => {
    return () => {
      const id = activeNoteIdRef.current;
      if (id && isEmptyNote()) {
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
    return record.id;
  }, [newNoteData]);

  const performSave = useCallback(async () => {
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
      }
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

  const imageMenuItem =
    'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--background)]/80 transition-colors cursor-pointer text-left whitespace-nowrap';

  return (
    <div
      className="flex flex-col h-full min-h-[55vh] p-6 pb-28 rounded-t-3xl transition-colors duration-300"
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

      {/* Image gallery — above the title, Google Keep style */}
      <NoteImageGallery
        images={images}
        onOpen={(index) => setViewerIndex(index)}
        onDelete={handleDeleteImage}
      />

      {isAttaching && (
        <div className="flex items-center gap-2 mb-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <RefreshCw className="w-3 h-3 animate-spin text-primary" />
          Bild wird vorbereitet...
        </div>
      )}

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
        onPaste={handlePaste}
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

      {/* Desktop drag & drop affordance */}
      {isDropTarget && (
        <div className="absolute inset-3 rounded-3xl border-2 border-dashed border-primary/60 bg-primary/5 flex items-center justify-center pointer-events-none z-40">
          <span className="text-sm font-bold text-primary">Bilder hier ablegen</span>
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
            onClick={() => { setShowPalette(!showPalette); setShowImageMenu(false); }}
            className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl hover:bg-[var(--background)]/80 flex items-center justify-center transition-colors text-[var(--text-secondary)] cursor-pointer"
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

          <div className="h-6 w-px bg-[var(--border-color)] mx-0.5 shrink-0"></div>

          {/* Image button — one slot, a small sheet behind it. Two separate
              buttons (camera + gallery) would not fit next to the existing
              actions on a foldable's cover display. */}
          <button
            onClick={() => { setShowImageMenu(!showImageMenu); setShowPalette(false); }}
            disabled={images.length >= MAX_IMAGES_PER_NOTE}
            className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${showImageMenu ? 'bg-primary/10 text-primary' : 'text-[var(--text-secondary)] hover:bg-[var(--background)]/80'}`}
            title="Bild hinzufügen"
          >
            <ImagePlus size={19} />
          </button>

          <AnimatePresence>
            {showImageMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-16 left-0 bg-[var(--card-bg)] border border-[var(--border-color)] shadow-[var(--shadow-elevated)] rounded-2xl p-1.5 z-[60] min-w-[11rem]"
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
          </AnimatePresence>

          {/* Pin Button */}
          <button
            onClick={() => setIsPinned(!isPinned)}
            className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${isPinned ? 'bg-primary/10 text-primary' : 'text-[var(--text-secondary)] hover:bg-[var(--background)]/80'}`}
            title="Notiz anpinnen"
          >
            <Pin size={19} className={isPinned ? 'fill-current' : ''} />
          </button>

          {/* Archive Button */}
          <button
            onClick={() => setIsArchived(!isArchived)}
            className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${isArchived ? 'bg-orange-500/10 text-orange-500' : 'text-[var(--text-secondary)] hover:bg-[var(--background)]/80'}`}
            title="Archivieren"
          >
            <Archive size={19} />
          </button>

          {/* Share Button */}
          <button
            onClick={() => setIsShared(!isShared)}
            disabled={!canShare}
            className={`shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${isShared ? 'bg-primary/10 text-primary' : 'text-[var(--text-secondary)] hover:bg-[var(--background)]/80'}`}
            title={canShare
              ? (isShared ? 'Nicht mehr teilen' : 'Mit Partner teilen')
              : 'Nur wer die Notiz angelegt hat, kann das Teilen beenden'}
          >
            <Users size={19} />
          </button>
        </div>

        {/* Right Actions & Status */}
        <div className="flex items-center gap-1 sm:gap-3">

          {/* Save Status Indicator — below `xs` (foldable cover display) it
              sheds its chrome and shows the bare icon, to leave room for the
              extra toolbar slot. */}
          <div className="shrink-0 flex items-center gap-1.5 text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider rounded-full px-0 xs:px-2.5 py-1 xs:bg-[var(--background)]/50 xs:border xs:border-[var(--border-color)]">
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
            className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl hover:bg-red-500/10 flex items-center justify-center text-red-500 transition-colors cursor-pointer"
            title="Löschen"
          >
            <Trash2 size={19} />
          </button>
        </div>
      </div>

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
