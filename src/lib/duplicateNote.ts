import { RecordModel } from 'pocketbase';
import { pb } from '@/lib/pb';
import { applyChange, newRecordId } from '@/lib/sync';
import { cacheItemsByNote, CachedRecord } from '@/lib/offlineDb';

// Vorlagen-Use-Case (Scope v1.2 Stufe 3): eine Kopie startet unabgehakt,
// nicht angepinnt/archiviert/geteilt. Läuft über applyChange und
// funktioniert damit auch offline (Sync-Queue).
export async function duplicateNote(note: RecordModel): Promise<RecordModel> {
  const user = pb.authStore.model || pb.authStore.record;
  const baseTitle = note.title || (note.type === 'checklist' ? 'Unbenannte Liste' : '');
  const copy = await applyChange({
    collection: 'notes',
    action: 'create',
    id: newRecordId(),
    data: {
      title: `${baseTitle} (Kopie)`.trim(),
      type: note.type,
      content: note.content || '',
      color: note.color || 'white',
      is_pinned: false,
      is_archived: false,
      is_shared: false,
      owner: user?.id,
    },
  });

  if (note.type === 'checklist') {
    let items: CachedRecord[];
    try {
      items = await pb.collection('checklist_items').getFullList({
        filter: `note = "${note.id}"`,
        sort: 'order',
        requestKey: null,
      });
    } catch {
      items = await cacheItemsByNote(note.id).catch(() => []);
    }
    for (const item of items) {
      await applyChange({
        collection: 'checklist_items',
        action: 'create',
        id: newRecordId(),
        data: {
          note: copy.id,
          text: item.text,
          is_completed: false,
          order: item.order ?? 0,
        },
      });
    }
  }

  return copy;
}
