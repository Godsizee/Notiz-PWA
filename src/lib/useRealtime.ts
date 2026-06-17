import { useState, useEffect, useCallback } from 'react';
import { pb } from '@/lib/pb';
import { RecordModel } from 'pocketbase';

// PocketBase aborts a request (rejecting with isAbort) when it is auto-cancelled
// by a newer same-key request. Such aborts are expected and must not be treated
// as real errors that clear the UI.
function isAbortError(err: unknown): boolean {
  return !!(err && typeof err === 'object' && (err as { isAbort?: boolean }).isAbort);
}

export function useRealtimeNotes() {
  const [notes, setNotes] = useState<RecordModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Manual fetch — reused for the initial load and for pull-to-refresh.
  // A stable requestKey lets a fresh refetch supersede an older in-flight one
  // (latest wins) without ever leaving us with the wrong result.
  const refetch = useCallback(async () => {
    try {
      const records = await pb.collection('notes').getFullList({ requestKey: 'notes_list' });
      setNotes(records);
    } catch (err) {
      if (!isAbortError(err)) console.error("Failed to fetch notes:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();

    // Subscribe to realtime updates. Keep the returned unsubscribe handle so
    // cleanup removes only this subscription.
    let unsubscribe: (() => void) | undefined;
    pb.collection('notes')
      .subscribe('*', function (e) {
        if (e.action === 'create') {
          setNotes((prev) => [e.record, ...prev]);
        } else if (e.action === 'update') {
          setNotes((prev) => prev.map((n) => (n.id === e.record.id ? e.record : n)));
        } else if (e.action === 'delete') {
          setNotes((prev) => prev.filter((n) => n.id !== e.record.id));
        }
      })
      .then((fn) => { unsubscribe = fn; })
      .catch((err) => console.error("Failed to subscribe to notes:", err));

    return () => {
      unsubscribe?.();
    };
  }, [refetch]);

  return { notes, setNotes, isLoading, refetch };
}

export function useRealtimeChecklist(noteId: string) {
  const [items, setItems] = useState<RecordModel[]>([]);

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
      } catch (err) {
        if (!isAbortError(err)) console.error("Failed to fetch checklist items:", err);
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

        if (e.action === 'create') {
          setItems((prev) => {
            if (prev.some(i => i.id === e.record.id)) return prev;
            return [...prev, e.record].sort((a, b) => a.order - b.order);
          });
        } else if (e.action === 'update') {
          setItems((prev) =>
            prev.map((i) => (i.id === e.record.id ? e.record : i)).sort((a, b) => a.order - b.order)
          );
        } else if (e.action === 'delete') {
          setItems((prev) => prev.filter((i) => i.id !== e.record.id));
        }
      })
      .then((fn) => { unsubscribe = fn; })
      .catch((err) => console.error("Failed to subscribe to checklist items:", err));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [noteId]);

  return { items, setItems };
}
