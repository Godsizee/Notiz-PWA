"use client";

import { useEffect } from 'react';
import { create } from 'zustand';
import { RecordModel } from 'pocketbase';
import { pb } from '@/lib/pb';
import { onLocalChange, isAbortError } from '@/lib/sync';
import { cacheGetAll, cacheReplaceAllItems } from '@/lib/offlineDb';
import { useSyncStore } from '@/store/useSyncStore';
import { applyEvent, byOrder } from '@/lib/useRealtime';

// Checklisten-Vorschau fuer die Karten der Uebersicht. Vorher lud und
// abonnierte jede Karte ihre Eintraege einzeln (1 + N Requests, N Abos). Jetzt
// gibt es EIN getFullList und EIN subscribe fuer die ganze Uebersicht; die
// Karten lesen nur noch ihren Eimer aus diesem Store. Der Editor behaelt
// useRealtimeChecklist (Drag-Puffer, setSyncSuspended).

interface PreviewStore {
  itemsByNote: Record<string, RecordModel[]>;
  replaceAll: (items: readonly RecordModel[]) => void;
  apply: (action: string, record: RecordModel) => void;
}

const EMPTY: RecordModel[] = [];

function group(items: readonly RecordModel[]): Record<string, RecordModel[]> {
  const map: Record<string, RecordModel[]> = {};
  for (const item of items) {
    const noteId = String(item.note ?? '');
    if (noteId) (map[noteId] ||= []).push(item);
  }
  for (const list of Object.values(map)) list.sort(byOrder);
  return map;
}

const usePreviewStore = create<PreviewStore>((set) => ({
  itemsByNote: {},
  replaceAll: (items) => set({ itemsByNote: group(items) }),
  apply: (action, record) =>
    set((state) => {
      const noteId = String(record.note ?? '');
      if (noteId) {
        return { itemsByNote: { ...state.itemsByNote, [noteId]: applyEvent(state.itemsByNote[noteId] ?? [], action, record, byOrder) } };
      }
      // Lokales Loeschen traegt nur die id: aus dem Eimer entfernen, der sie enthaelt.
      if (action !== 'delete') return state;
      const next: Record<string, RecordModel[]> = {};
      for (const [id, list] of Object.entries(state.itemsByNote)) {
        next[id] = list.some((i) => i.id === record.id) ? list.filter((i) => i.id !== record.id) : list;
      }
      return { itemsByNote: next };
    }),
}));

/** Eintraege einer Liste fuer die Kartenvorschau. Leere ID (Textnotiz) → leere Liste. */
export function useChecklistPreview(noteId: string): RecordModel[] {
  return usePreviewStore((s) => (noteId ? s.itemsByNote[noteId] ?? EMPTY : EMPTY));
}

/**
 * Laedt die Eintraege aller Listen einmal und haelt sie per Realtime und
 * lokalen Aenderungen aktuell. Genau einmal in der Uebersicht einhaengen.
 */
export function useChecklistPreviewSync() {
  const flushSerial = useSyncStore((s) => s.flushSerial);
  const replaceAll = usePreviewStore((s) => s.replaceAll);
  const apply = usePreviewStore((s) => s.apply);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const records = await pb.collection('checklist_items').getFullList({ sort: 'order', requestKey: 'preview_items' });
        if (!cancelled) replaceAll(records);
        // Auch ohne Abbruch sichern: der Snapshot gehoert dem Geraet, nicht diesem Effekt.
        cacheReplaceAllItems(records).catch(() => {});
      } catch (err) {
        const e = err as { status?: number; isAbort?: boolean } | null;
        if (e && e.status === 0 && !e.isAbort) {
          // Offline-Start: aus dem Snapshot (enthaelt auch gequeuete Aenderungen).
          const cached = await cacheGetAll('checklist_items').catch(() => []);
          if (!cancelled) replaceAll(cached as unknown as RecordModel[]);
        } else if (!isAbortError(err)) {
          console.error('Failed to fetch checklist preview:', err);
        }
      }
    };
    load();

    let unsubscribe: (() => void) | undefined;
    pb.collection('checklist_items')
      .subscribe('*', (e) => apply(e.action, e.record))
      .then((fn) => { unsubscribe = fn; })
      .catch((err) => console.error('Failed to subscribe to checklist preview:', err));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [flushSerial, replaceAll, apply]);

  // Offline- und lokale Schreibzugriffe sofort spiegeln.
  useEffect(() => {
    return onLocalChange((change) => {
      if (change.collection !== 'checklist_items') return;
      apply(change.action, change.record);
    });
  }, [apply]);
}
