import { useState, useEffect } from 'react';
import { pb } from '@/lib/pb';
import { RecordModel } from 'pocketbase';

export function useRealtimeNotes() {
  const [notes, setNotes] = useState<RecordModel[]>([]);

  useEffect(() => {
    // Initial fetch
    const fetchNotes = async () => {
      try {
        const records = await pb.collection('notes').getFullList({
          sort: '-created',
        });
        setNotes(records);
      } catch (err) {
        console.error("Failed to fetch notes:", err);
      }
    };

    fetchNotes();

    // Subscribe to realtime updates
    pb.collection('notes').subscribe('*', function (e) {
      if (e.action === 'create') {
        setNotes((prev) => [e.record, ...prev]);
      } else if (e.action === 'update') {
        setNotes((prev) => prev.map((n) => (n.id === e.record.id ? e.record : n)));
      } else if (e.action === 'delete') {
        setNotes((prev) => prev.filter((n) => n.id !== e.record.id));
      }
    });

    return () => {
      pb.collection('notes').unsubscribe('*');
    };
  }, []);

  return { notes, setNotes };
}

export function useRealtimeChecklist(noteId: string) {
  const [items, setItems] = useState<RecordModel[]>([]);

  useEffect(() => {
    if (!noteId) return;

    // Initial fetch
    const fetchItems = async () => {
      try {
        const records = await pb.collection('checklist_items').getFullList({
          filter: `note = "${noteId}"`,
          sort: 'order',
        });
        setItems(records);
      } catch (err) {
        console.error("Failed to fetch checklist items:", err);
      }
    };

    fetchItems();

    // Subscribe to realtime updates
    pb.collection('checklist_items').subscribe('*', function (e) {
      if (e.record.note !== noteId) return;

      if (e.action === 'create') {
        setItems((prev) => [...prev, e.record].sort((a, b) => a.order - b.order));
      } else if (e.action === 'update') {
        setItems((prev) =>
          prev.map((i) => (i.id === e.record.id ? e.record : i)).sort((a, b) => a.order - b.order)
        );
      } else if (e.action === 'delete') {
        setItems((prev) => prev.filter((i) => i.id !== e.record.id));
      }
    });

    return () => {
      pb.collection('checklist_items').unsubscribe('*');
    };
  }, [noteId]);

  return { items, setItems };
}
