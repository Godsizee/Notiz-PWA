"use client";

import { useEffect, useState } from 'react';
import { pb } from '@/lib/pb';
import { cacheGetAll } from '@/lib/offlineDb';
import type { HistoryEntry } from '@/lib/suggestions';

/**
 * Alle Checklisten-Eintraege aller Listen, fuer die Vorschlaege beim Tippen.
 * Wird erst geladen, wenn `active` true wird (Eingabefeld fokussiert), und
 * faellt offline auf den Snapshot zurueck — gleiches Muster wie
 * useChecklistSearchIndex (src/lib/useSearch.ts).
 */
export function useItemHistory(active: boolean): HistoryEntry[] {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      let records: { id: string; text?: unknown; updated?: unknown }[];
      try {
        records = await pb
          .collection('checklist_items')
          .getFullList({ fields: 'text,updated', requestKey: 'item_history' });
      } catch {
        records = await cacheGetAll('checklist_items').catch(() => []);
      }
      if (cancelled) return;
      setEntries(
        records
          .map((r) => ({ text: String(r.text ?? ''), updated: typeof r.updated === 'string' ? r.updated : '' }))
          .filter((e) => e.text.trim())
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  return entries;
}
