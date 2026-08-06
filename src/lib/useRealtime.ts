import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { pb } from '@/lib/pb';
import { RecordModel } from 'pocketbase';
import { onLocalChange, isAbortError } from '@/lib/sync';
import { useSyncStore } from '@/store/useSyncStore';
import {
  cacheGetAll,
  cacheItemsByNote,
  cacheReplaceNotes,
  cacheReplaceItems,
  cacheReplaceImages,
} from '@/lib/offlineDb';

// Network failure (offline / server unreachable) — not an auto-cancel abort.
function isOfflineError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; isAbort?: boolean };
  return e.status === 0 && !e.isAbort;
}

// Shared reducer for realtime echoes AND local offline changes. Creates are
// deduped because an offline-created record can arrive twice (optimistic
// local event + realtime echo after the queue flush).
function applyEvent(
  prev: RecordModel[],
  action: string,
  record: RecordModel,
  sort?: (a: RecordModel, b: RecordModel) => number
): RecordModel[] {
  let next: RecordModel[];
  if (action === 'create' || action === 'update') {
    // Both upsert, and 'update' genuinely needs to insert: PocketBase filters
    // realtime events through the collection's list rule, so a record we were
    // never allowed to see arrives as an *update* the moment it starts
    // matching — which is exactly what happens when the other user flips
    // is_shared. Mapping only over existing records dropped that event on the
    // floor and the note stayed invisible until the next full refetch.
    // Creates are deduped for the same reason they always were: an
    // offline-created record arrives twice (local echo + realtime echo).
    next = prev.some((r) => r.id === record.id)
      ? prev.map((r) => (r.id === record.id ? record : r))
      : [record, ...prev];
  } else if (action === 'delete') {
    next = prev.filter((r) => r.id !== record.id);
  } else {
    return prev;
  }
  return sort ? next.sort(sort) : next;
}

const byOrder = (a: RecordModel, b: RecordModel) => (a.order ?? 0) - (b.order ?? 0);

export function useRealtimeNotes() {
  const [notes, setNotes] = useState<RecordModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const flushSerial = useSyncStore((s) => s.flushSerial);

  // Manual fetch — reused for the initial load and for pull-to-refresh.
  // A stable requestKey lets a fresh refetch supersede an older in-flight one
  // (latest wins) without ever leaving us with the wrong result.
  const refetch = useCallback(async () => {
    try {
      const records = await pb.collection('notes').getFullList({ requestKey: 'notes_list' });
      setNotes(records);
      cacheReplaceNotes(records).catch(() => {});
    } catch (err) {
      if (isOfflineError(err)) {
        // Offline start: hydrate from the snapshot cache (includes queued edits).
        const cached = await cacheGetAll('notes').catch(() => []);
        setNotes(cached as unknown as RecordModel[]);
      } else if (!isAbortError(err)) {
        console.error("Failed to fetch notes:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();

    // Subscribe to realtime updates. Keep the returned unsubscribe handle so
    // cleanup removes only this subscription. flushSerial in the deps forces a
    // refetch + resubscribe after an offline queue flush (the SSE connection
    // may have missed events while the app was offline).
    let unsubscribe: (() => void) | undefined;
    pb.collection('notes')
      .subscribe('*', function (e) {
        setNotes((prev) => applyEvent(prev, e.action, e.record));
      })
      .then((fn) => { unsubscribe = fn; })
      .catch((err) => console.error("Failed to subscribe to notes:", err));

    return () => {
      unsubscribe?.();
    };
  }, [refetch, flushSerial]);

  // Offline writes bypass the server → mirror them into the UI immediately.
  useEffect(() => {
    return onLocalChange((change) => {
      if (change.collection !== 'notes') return;
      setNotes((prev) => applyEvent(prev, change.action, change.record));
    });
  }, []);

  return { notes, setNotes, isLoading, refetch };
}

export type ImagesByNote = Record<string, RecordModel[]>;

/**
 * All note images, loaded once for the whole app rather than per card.
 *
 * useRealtimeChecklist() deliberately fetches per note because a checklist is
 * only ever expanded one at a time — images are different: every card in the
 * overview may show a thumbnail, so a per-card fetch would mean one request
 * per note on every load. One list + a noteId→images map is both cheaper and
 * simpler for the editor to consume.
 */
export function useRealtimeImages() {
  const [images, setImages] = useState<RecordModel[]>([]);
  const flushSerial = useSyncStore((s) => s.flushSerial);

  useEffect(() => {
    let cancelled = false;

    const fetchImages = async () => {
      try {
        const records = await pb
          .collection('note_images')
          .getFullList({ sort: 'order', requestKey: 'note_images_list' });
        if (!cancelled) setImages(records);
        cacheReplaceImages(records).catch(() => {});
      } catch (err) {
        if (isOfflineError(err)) {
          const cached = await cacheGetAll('note_images').catch(() => []);
          if (!cancelled) setImages((cached as unknown as RecordModel[]).sort(byOrder));
        } else if (!isAbortError(err)) {
          console.error('Failed to fetch note images:', err);
        }
      }
    };

    fetchImages();

    let unsubscribe: (() => void) | undefined;
    pb.collection('note_images')
      .subscribe('*', function (e) {
        setImages((prev) => applyEvent(prev, e.action, e.record, byOrder));
      })
      .then((fn) => { unsubscribe = fn; })
      .catch((err) => console.error('Failed to subscribe to note images:', err));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [flushSerial]);

  // Offline writes bypass the server → mirror them into the UI immediately.
  useEffect(() => {
    return onLocalChange((change) => {
      if (change.collection !== 'note_images') return;
      setImages((prev) => applyEvent(prev, change.action, change.record, byOrder));
    });
  }, []);

  const byNote = useMemo(() => {
    const map: ImagesByNote = {};
    for (const image of images) {
      const noteId = String(image.note ?? '');
      if (!noteId) continue;
      (map[noteId] ||= []).push(image);
    }
    return map;
  }, [images]);

  return byNote;
}

export function useRealtimeChecklist(noteId: string) {
  const [items, setItems] = useState<RecordModel[]>([]);
  const flushSerial = useSyncStore((s) => s.flushSerial);

  // While the user drags an item, incoming events must not rewrite the list
  // under their finger. Every setItems re-renders Reorder.Group, which drops
  // the measurement registry it reorders against and re-measures every row —
  // a burst of echoes mid-gesture is what makes dragging feel sticky. Buffer
  // them instead and replay in order once the drag ends.
  const suspendedRef = useRef(false);
  const bufferedRef = useRef<{ action: string; record: RecordModel }[]>([]);

  const setSyncSuspended = useCallback((suspended: boolean) => {
    suspendedRef.current = suspended;
    if (suspended) return;
    const buffered = bufferedRef.current;
    if (buffered.length === 0) return;
    bufferedRef.current = [];
    setItems((prev) =>
      buffered.reduce((acc, e) => applyEvent(acc, e.action, e.record, byOrder), prev)
    );
  }, []);

  const ingest = useCallback((action: string, record: RecordModel) => {
    if (suspendedRef.current) {
      bufferedRef.current.push({ action, record });
      return;
    }
    setItems((prev) => applyEvent(prev, action, record, byOrder));
  }, []);

  useEffect(() => {
    // Anything buffered belongs to the list we're leaving.
    bufferedRef.current = [];

    if (!noteId) {
      setItems([]);
      return;
    }

    let cancelled = false;

    // Initial fetch. requestKey: null disables the SDK's auto-cancellation so
    // that several checklist cards loading their items at the same time (e.g.
    // after a pull-to-refresh / full page reload) don't cancel each other and
    // end up showing an empty list. Without this, all but the last concurrent
    // getFullList('checklist_items') call get aborted and silently render
    // "Leere Checkliste...".
    const fetchItems = async () => {
      try {
        const records = await pb.collection('checklist_items').getFullList({
          filter: `note = "${noteId}"`,
          sort: 'order',
          requestKey: null,
        });
        if (!cancelled) setItems(records);
        cacheReplaceItems(noteId, records).catch(() => {});
      } catch (err) {
        if (isOfflineError(err)) {
          const cached = await cacheItemsByNote(noteId).catch(() => []);
          if (!cancelled) setItems((cached as unknown as RecordModel[]).sort(byOrder));
        } else if (!isAbortError(err)) {
          console.error("Failed to fetch checklist items:", err);
        }
      }
    };

    fetchItems();

    // Subscribe to realtime updates. Keep the per-subscription unsubscribe
    // handle returned by subscribe() — calling unsubscribe('*') here would tear
    // down every other card's subscription to this collection as well.
    let unsubscribe: (() => void) | undefined;
    pb.collection('checklist_items')
      .subscribe('*', function (e) {
        if (e.record.note !== noteId) return;
        ingest(e.action, e.record);
      })
      .then((fn) => { unsubscribe = fn; })
      .catch((err) => console.error("Failed to subscribe to checklist items:", err));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [noteId, flushSerial, ingest]);

  // Offline writes bypass the server → mirror them into the UI immediately.
  useEffect(() => {
    if (!noteId) return;
    return onLocalChange((change) => {
      if (change.collection !== 'checklist_items') return;
      if (change.action !== 'delete' && change.record.note !== noteId) return;
      ingest(change.action, change.record);
    });
  }, [noteId, ingest]);

  return { items, setItems, setSyncSuspended };
}
