import type { RecordModel } from 'pocketbase';
import { applyChange, newRecordId } from '@/lib/sync';
import { linesToItems } from '@/lib/checklistPaste';
import { checklistToContent } from '@/lib/noteText';

// Liste ↔ Textnotiz umwandeln. Nutzt nur vorhandene Felder (notes.type,
// notes.content, checklist_items) — keine Schemaaenderung. Alles ueber
// applyChange(), also auch offline (Queue) und mit den Zugriffsregeln des
// angemeldeten Nutzers.
//
// ACHTUNG beim Aufrufer (Editor): vorher den Debounce-Save flushen und danach
// jedes weitere Speichern sperren. performSave() schreibt `type` mit — ein
// Flush beim Unmount wuerde die Umwandlung sofort zurueckdrehen, und die
// Ghost-Note-Bereinigung der Checkliste wuerde die Notiz loeschen, sobald
// ihre Eintraege weg sind (Plan U32).

/** Textnotiz → Liste: jede Zeile ein Eintrag, "- [x]" wird abgehakt. Gibt den aktualisierten Record zurueck. */
export async function convertTextToChecklist(noteId: string, content: string): Promise<RecordModel> {
  const items = linesToItems(content);
  // Erst die Eintraege, dann der Typwechsel: bricht es dazwischen ab, bleibt
  // eine Textnotiz mit ihrem Inhalt uebrig statt einer leeren Liste.
  for (let i = 0; i < items.length; i++) {
    await applyChange({
      collection: 'checklist_items',
      action: 'create',
      id: newRecordId(),
      data: { note: noteId, text: items[i].text, is_completed: items[i].done, order: i },
    });
  }
  return applyChange({ collection: 'notes', action: 'update', id: noteId, data: { type: 'checklist', content: '' } });
}

/** Liste → Textnotiz: Eintraege werden "- [ ] …"-Zeilen, danach geloescht. Gibt den aktualisierten Record zurueck. */
export async function convertChecklistToText(noteId: string, items: readonly RecordModel[]): Promise<RecordModel> {
  const content = checklistToContent(
    items.map((i) => ({ text: String(i.text ?? ''), is_completed: !!i.is_completed, order: Number(i.order ?? 0) }))
  );
  const note = await applyChange({ collection: 'notes', action: 'update', id: noteId, data: { type: 'text', content } });
  await Promise.all(
    items.map((i) => applyChange({ collection: 'checklist_items', action: 'delete', id: i.id }).catch(() => {}))
  );
  return note;
}
