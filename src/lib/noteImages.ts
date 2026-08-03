import { useEffect, useState } from 'react';
import { RecordModel } from 'pocketbase';
import { pb } from '@/lib/pb';
import { applyChange, newRecordId } from '@/lib/sync';
import { blobPut, blobGet, blobDelete } from '@/lib/offlineDb';
import { processImages } from '@/lib/images';

// Write path and source resolution for note images. Everything goes through
// applyChange(), so attaching a photo behaves exactly like any other edit:
// online it hits PocketBase directly, offline it lands in the sync queue and
// replays later — including from the service worker with the app closed.

/** Keeps a single note (and its card preview) from turning into an album. */
export const MAX_IMAGES_PER_NOTE = 12;

export type ImageVariant = 'thumb' | 'full';

const THUMB_SPEC: Record<ImageVariant, string> = {
  // Square crop for the gallery grid, width-preserving for the viewer.
  thumb: '400x400',
  full: '1200x0',
};

/** Server URL for an already-uploaded image, or null while it's still local. */
export function imageUrl(record: RecordModel, variant: ImageVariant): string | null {
  const filename = String(record.file ?? '');
  if (!filename || !record.collectionId) return null;
  return pb.files.getURL(record, filename, { thumb: THUMB_SPEC[variant] });
}

/** Full-resolution URL, no thumb transform — used when copying bytes around. */
export function imageOriginalUrl(record: RecordModel): string | null {
  const filename = String(record.file ?? '');
  if (!filename || !record.collectionId) return null;
  return pb.files.getURL(record, filename);
}

/** True while the image exists only in IndexedDB and hasn't synced yet. */
export function isPendingUpload(record: RecordModel): boolean {
  return !record.file && !!record._blobKey;
}

/**
 * Resolves an image to something an <img src> can use: the PocketBase URL once
 * uploaded, otherwise an object URL over the locally queued blob so a photo
 * taken offline is visible immediately.
 */
export function useImageSrc(record: RecordModel, variant: ImageVariant): string | null {
  const remote = imageUrl(record, variant);
  const blobKey = String(record._blobKey ?? '');
  const [src, setSrc] = useState<string | null>(remote);

  useEffect(() => {
    if (remote) {
      setSrc(remote);
      return;
    }
    if (!blobKey) {
      setSrc(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | undefined;
    blobGet(blobKey)
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [remote, blobKey]);

  return src;
}

export interface AttachResult {
  processed: number;
  failed: number;
  /** Files rejected because the note is already at MAX_IMAGES_PER_NOTE. */
  skipped: number;
}

/**
 * Downscale, store and queue a batch of picked files as images of `noteId`.
 * Processing is sequential (see processImages) and each image is queued as
 * soon as it's ready, so the gallery fills in one by one instead of after the
 * whole batch.
 */
export async function attachImages(
  noteId: string,
  files: (File | Blob)[],
  existingCount: number
): Promise<AttachResult> {
  const room = Math.max(0, MAX_IMAGES_PER_NOTE - existingCount);
  const accepted = files.slice(0, room);
  const skipped = files.length - accepted.length;

  const { processed, failed } = await processImages(accepted, async (result, index) => {
    const id = newRecordId();
    const key = `img_${id}`;
    // Bytes first: if the app dies between here and the queue write we leak one
    // blob (swept on next start), whereas the reverse order would leave a
    // queued op pointing at nothing.
    await blobPut(key, result.blob);
    await applyChange({
      collection: 'note_images',
      action: 'create',
      id,
      data: {
        note: noteId,
        order: existingCount + index,
        width: result.width,
        height: result.height,
        placeholder: result.placeholder,
      },
      blob: {
        field: 'file',
        key,
        filename: `${id}.${result.extension}`,
        type: result.blob.type,
      },
    });
  });

  return { processed, failed, skipped };
}

export async function deleteImage(record: RecordModel): Promise<void> {
  await applyChange({ collection: 'note_images', action: 'delete', id: record.id });
  const blobKey = String(record._blobKey ?? '');
  if (blobKey) await blobDelete(blobKey).catch(() => {});
}

/** Moves an image to the front — it becomes the card's cover thumbnail. */
export async function moveImageFirst(record: RecordModel, all: RecordModel[]): Promise<void> {
  const reordered = [record, ...all.filter((r) => r.id !== record.id)];
  for (let i = 0; i < reordered.length; i++) {
    if ((reordered[i].order ?? 0) === i) continue;
    await applyChange({
      collection: 'note_images',
      action: 'update',
      id: reordered[i].id,
      data: { order: i },
    });
  }
}

/** Native Android/iOS share sheet for a single image. */
export async function shareImage(record: RecordModel): Promise<boolean> {
  const url = imageUrl(record, 'full');
  const blobKey = String(record._blobKey ?? '');
  const blob = url
    ? await fetch(url).then((r) => r.blob()).catch(() => undefined)
    : blobKey
      ? await blobGet(blobKey).catch(() => undefined)
      : undefined;
  if (!blob) return false;

  const extension = blob.type.split('/')[1] || 'jpg';
  const file = new File([blob], `${record.id}.${extension}`, { type: blob.type });
  if (!navigator.canShare?.({ files: [file] })) return false;

  try {
    await navigator.share({ files: [file] });
    return true;
  } catch {
    // User dismissed the sheet — not an error worth surfacing.
    return false;
  }
}
