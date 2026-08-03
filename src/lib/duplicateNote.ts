import { RecordModel } from 'pocketbase';
import { pb } from '@/lib/pb';
import { applyChange, newRecordId } from '@/lib/sync';
import { cacheItemsByNote, cacheByNote, blobPut, CachedRecord } from '@/lib/offlineDb';
import { imageOriginalUrl } from '@/lib/noteImages';

export interface DuplicateResult {
  record: RecordModel;
  /** Images that couldn't be carried over (see copyImages). */
  skippedImages: number;
}

// Vorlagen-Use-Case (Scope v1.2 Stufe 3): eine Kopie startet unabgehakt,
// nicht angepinnt/archiviert/geteilt. Läuft über applyChange und
// funktioniert damit auch offline (Sync-Queue).
export async function duplicateNote(note: RecordModel): Promise<DuplicateResult> {
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

  const skippedImages = await copyImages(note.id, copy.id);
  return { record: copy, skippedImages };
}

/**
 * PocketBase cannot clone a stored file server-side, so each image has to be
 * downloaded and re-uploaded. That needs the network: offline, the originals
 * are unreachable and the copy goes out without them — the caller reports how
 * many were left behind rather than letting them vanish silently.
 *
 * The bytes are re-uploaded as-is; they went through the downscale/re-encode
 * pipeline once already when they were first attached.
 */
async function copyImages(sourceNoteId: string, targetNoteId: string): Promise<number> {
  let images: CachedRecord[];
  try {
    images = await pb.collection('note_images').getFullList({
      filter: `note = "${sourceNoteId}"`,
      sort: 'order',
      requestKey: null,
    });
  } catch {
    images = await cacheByNote('note_images', sourceNoteId).catch(() => []);
  }
  if (images.length === 0) return 0;

  let skipped = 0;
  for (let i = 0; i < images.length; i++) {
    const image = images[i] as unknown as RecordModel;
    const url = imageOriginalUrl(image);
    const blob = url ? await fetch(url).then((r) => r.blob()).catch(() => undefined) : undefined;
    if (!blob) {
      skipped++;
      continue;
    }

    const id = newRecordId();
    const key = `img_${id}`;
    await blobPut(key, blob);
    await applyChange({
      collection: 'note_images',
      action: 'create',
      id,
      data: {
        note: targetNoteId,
        order: i,
        width: image.width ?? 0,
        height: image.height ?? 0,
        placeholder: image.placeholder ?? '',
      },
      blob: {
        field: 'file',
        key,
        filename: `${id}.${String(image.file || '').split('.').pop() || 'webp'}`,
        type: blob.type,
      },
    });
  }
  return skipped;
}
