import { RecordModel } from 'pocketbase';
import { applyChange, newRecordId } from '@/lib/sync';
import type { MergeRow } from '@/lib/scan/merge';

// Schreibt die im Review-Sheet bestaetigten Zeilen in die Checkliste.
// Alles laeuft ueber applyChange(): online direkt nach PocketBase, offline in
// die Sync-Queue — ein Verbindungsabbruch zwischen Scan und "Übernehmen"
// verliert also nichts.

export interface ScanCommit {
  /** Neu angelegte bzw. reaktivierte Records, fuer das sofortige setItems(). */
  records: RecordModel[];
  createdIds: string[];
  reopened: { id: string; previousText: string }[];
  failed: number;
}

// Vier parallele Writes: 30 Eintraege sequenziell kosten online 3–6 s, alle
// auf einmal erzeugen einen Echo-Sturm auf der geteilten Liste.
const CONCURRENCY = 4;

export async function commitScanRows(
  noteId: string,
  rows: MergeRow[],
  startOrder: number,
  existingTextById: Map<string, string>
): Promise<ScanCommit> {
  const commit: ScanCommit = { records: [], createdIds: [], reopened: [], failed: 0 };

  // `order` wird vorab vergeben, damit die Reihenfolge des Fotos erhalten
  // bleibt, egal in welcher Reihenfolge die parallelen Writes fertig werden.
  const jobs = rows
    .filter((row) => row.selected && row.text.trim())
    .map((row, index) => ({ row, text: row.text.trim(), order: startOrder + index }));

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    await Promise.all(
      jobs.slice(i, i + CONCURRENCY).map(async ({ row, text, order }) => {
        try {
          if (row.action === 'reopen' && row.targetId) {
            const record = await applyChange({
              collection: 'checklist_items',
              action: 'update',
              id: row.targetId,
              data: { note: noteId, text, is_completed: false, order },
            });
            commit.records.push(record);
            commit.reopened.push({ id: row.targetId, previousText: existingTextById.get(row.targetId) ?? text });
          } else {
            const id = newRecordId();
            const record = await applyChange({
              collection: 'checklist_items',
              action: 'create',
              id,
              data: { note: noteId, text, is_completed: false, order },
            });
            commit.records.push(record);
            commit.createdIds.push(id);
          }
        } catch (err) {
          console.error('Scan-Eintrag konnte nicht gespeichert werden:', err);
          commit.failed++;
        }
      })
    );
  }

  return commit;
}

/** Macht einen Commit rueckgaengig: neue Eintraege loeschen, reaktivierte wieder abhaken. */
export async function undoScanCommit(noteId: string, commit: ScanCommit): Promise<void> {
  await Promise.all([
    ...commit.createdIds.map((id) =>
      applyChange({ collection: 'checklist_items', action: 'delete', id }).catch(() => {})
    ),
    ...commit.reopened.map(({ id, previousText }) =>
      applyChange({
        collection: 'checklist_items',
        action: 'update',
        id,
        data: { note: noteId, text: previousText, is_completed: true },
      }).catch(() => {})
    ),
  ]);
}
