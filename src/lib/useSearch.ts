import { useState, useEffect } from 'react';
import { pb } from '@/lib/pb';
import { cacheGetAll } from '@/lib/offlineDb';

// Client-side full-text search support: builds a noteId → lowercased item
// text index so checklist contents are searchable from the overview. Loaded
// lazily when a search becomes active; falls back to the offline snapshot
// cache when the network is unavailable.
export function useChecklistSearchIndex(active: boolean): Record<string, string> {
  const [index, setIndex] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    (async () => {
      let records: { id: string; note?: unknown; text?: unknown }[];
      try {
        records = await pb
          .collection('checklist_items')
          .getFullList({ requestKey: 'search_items' });
      } catch {
        records = await cacheGetAll('checklist_items').catch(() => []);
      }
      if (cancelled) return;

      const map: Record<string, string> = {};
      for (const r of records) {
        const noteId = String(r.note ?? '');
        if (!noteId) continue;
        map[noteId] = (map[noteId] ? map[noteId] + '\n' : '') + String(r.text ?? '').toLowerCase();
      }
      setIndex(map);
    })();

    return () => {
      cancelled = true;
    };
  }, [active]);

  return index;
}
