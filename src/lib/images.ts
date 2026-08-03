// Client-side image preparation before anything touches the sync queue.
//
// A phone photo straight out of the Galaxy camera is 8–12 MB — far past
// PocketBase's 5 MB field limit and painful to upload over mobile data. Every
// picked image is therefore decoded, downscaled and re-encoded here first.
//
// Two deliberate side effects of going through a canvas:
//   - EXIF is dropped, GPS coordinates included. For an app that shares notes
//     between two people that's the right default.
//   - Camera rotation has to be applied explicitly (imageOrientation), or
//     portrait shots come out sideways.

/** Longest edge after downscaling. Plenty for a full-screen phone view. */
const MAX_EDGE = 2048;
/** Width of the blur placeholder baked into the record. */
const PLACEHOLDER_WIDTH = 16;
/** Anything past this is refused outright rather than OOM-ing the tab. */
const MAX_INPUT_BYTES = 25 * 1024 * 1024;
/** Mirrors the note_images file field's maxSize in the PocketBase migration. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export interface ProcessedImage {
  blob: Blob;
  /** Extension matching blob.type, for the upload filename. */
  extension: string;
  width: number;
  height: number;
  /** Tiny base64 data URL (~400 B) rendered while the real file loads. */
  placeholder: string;
}

export class ImageTooLargeError extends Error {}
export class ImageDecodeError extends Error {}

function extensionFor(mime: string): string {
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/gif') return 'gif';
  return 'jpg';
}

/**
 * Decode to a bitmap-like source. createImageBitmap is the fast path and the
 * only one that applies EXIF orientation for us; the <img> fallback covers
 * browsers without it (and is what Safari needed for a long time).
 */
async function decode(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Unsupported format (HEIC) or an option this browser doesn't know —
      // fall through and let the <img> decoder have a go.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new ImageDecodeError('Bild konnte nicht gelesen werden.'));
      img.src = url;
    });
  } finally {
    // Safe to revoke once decoding settled: the bitmap/image keeps its own copy.
    URL.revokeObjectURL(url);
  }
}

function scaledSize(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const factor = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}

function drawTo(
  source: CanvasImageSource,
  width: number,
  height: number
): HTMLCanvasElement | OffscreenCanvas {
  const canvas =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });

  const ctx = (canvas as HTMLCanvasElement).getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new ImageDecodeError('Canvas nicht verfügbar.');

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function encode(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  mime: string,
  quality: number
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: mime, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImageDecodeError('Kodierung fehlgeschlagen.'))),
      mime,
      quality
    );
  });
}

async function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Downscale, re-encode and derive a blur placeholder.
 *
 * Animated GIFs are passed through untouched — a canvas would silently flatten
 * them to their first frame, which is worse than shipping the original bytes.
 */
export async function processImage(file: File | Blob): Promise<ProcessedImage> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageTooLargeError('Bild ist größer als 25 MB.');
  }

  const source = await decode(file);
  const naturalWidth = Number(source.width);
  const naturalHeight = Number(source.height);
  if (!naturalWidth || !naturalHeight) {
    throw new ImageDecodeError('Bild hat keine lesbaren Abmessungen.');
  }

  const target = scaledSize(naturalWidth, naturalHeight, MAX_EDGE);

  // Placeholder first — it needs the source before we potentially close it.
  const thumbHeight = Math.max(
    1,
    Math.round((PLACEHOLDER_WIDTH * naturalHeight) / naturalWidth)
  );
  const placeholder = await toDataUrl(
    await encode(drawTo(source, PLACEHOLDER_WIDTH, thumbHeight), 'image/jpeg', 0.5)
  ).catch(() => '');

  let blob: Blob;
  if (file.type === 'image/gif') {
    blob = file;
  } else {
    // WebP is supported everywhere this PWA runs and is markedly smaller than
    // JPEG at the same perceived quality; fall back if the encoder declines.
    blob = await encode(drawTo(source, target.width, target.height), 'image/webp', 0.82);
    if (!blob.type.startsWith('image/webp')) {
      blob = await encode(drawTo(source, target.width, target.height), 'image/jpeg', 0.85);
    }
  }

  if ('close' in source && typeof source.close === 'function') source.close();

  // Downscaled output lands far below this; an animated GIF passed through
  // untouched is the one case that can still exceed the field limit. Catch it
  // here rather than letting the upload dead-letter after the fact.
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new ImageTooLargeError('Bild ist auch nach der Komprimierung größer als 5 MB.');
  }

  return {
    blob,
    extension: extensionFor(blob.type),
    width: target.width,
    height: target.height,
    placeholder,
  };
}

/**
 * Process a batch strictly one at a time. Five 12-MP bitmaps decoded in
 * parallel is a reliable way to get the tab killed on a mid-range phone.
 */
export async function processImages(
  files: (File | Blob)[],
  onEach?: (result: ProcessedImage, index: number) => Promise<void> | void
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  for (let i = 0; i < files.length; i++) {
    try {
      const result = await processImage(files[i]);
      await onEach?.(result, i);
      processed++;
    } catch (err) {
      console.error('Bild konnte nicht verarbeitet werden:', err);
      failed++;
    }
  }
  return { processed, failed };
}
