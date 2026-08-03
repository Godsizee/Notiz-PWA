import { useState, useEffect, useCallback, useMemo } from 'react';
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
  if (action === 'create') {
    next = prev.some((r) => r.id === record.id)
      ? prev.map((r) => (r.id === record.id ? record : r))
      : [record, ...prev];
  } else if (action === 'update') {
    next = prev.map((r) => (r.id === record.id ? record : r));
  } else if (action === 'delete') {
    next = prev.filter((r) => r.id !== record.id);
  } else {
    return prev;
  }
  return sort ? next.sort(sort) : next;
}

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

  const byOrder = (a: RecordModel, b: RecordModel) => (a.order ?? 0) - (b.order ?? 0);

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

  const byOrder = (a: RecordModel, b: RecordModel) => (a.order ?? 0) - (b.order ?? 0);

  useEffect(() => {
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
        setItems((prev) => applyEvent(prev, e.action, e.record, byOrder));
      })
      .then((fn) => { unsubscribe = fn; })
      .catch((err) => console.error("Failed to subscribe to checklist items:", err));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [noteId, flushSerial]);

  // Offline writes bypass the server → mirror them into the UI immediately.
  useEffect(() => {
    if (!noteId) return;
    return onLocalChange((change) => {
      if (change.collection !== 'checklist_items') return;
      if (change.action !== 'delete' && change.record.note !== noteId) return;
      setItems((prev) => applyEvent(prev, change.action, change.record, byOrder));
    });
  }, [noteId]);

  return { items, setItems };
}
