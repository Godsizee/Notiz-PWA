"use client";

import { RecordModel } from 'pocketbase';
import { NoteImageTile } from '@/components/notes/NoteImageGallery';

// Card preview. Bleeds to the card's edges at the top, Google Keep style, with
// the title and text below it.
//
// Every tile has a fixed aspect ratio. That is load-bearing rather than
// cosmetic: the overview renders through react-masonry-css (CSS columns), so
// an image that only claims its height once it has downloaded makes the whole
// column reflow under the reader's thumb.

const MAX_TILES = 4;

export default function NoteImageCollage({ images }: { images: RecordModel[] }) {
  if (images.length === 0) return null;

  const visible = images.slice(0, MAX_TILES);
  const overflow = images.length - visible.length;

  if (images.length === 1) {
    const image = images[0];
    const width = Number(image.width) || 4;
    const height = Number(image.height) || 3;
    return (
      <div className="-mx-5 -mt-5 mb-3.5">
        <NoteImageTile
          image={image}
          className="w-full rounded-t-3xl max-h-56"
          style={{ aspectRatio: `${width} / ${height}` }}
        />
      </div>
    );
  }

  // 2 → side by side, 3 → a row of three, 4+ → a 2×2 block.
  const columns = visible.length === 3 ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className={`-mx-5 -mt-5 mb-3.5 grid ${columns} gap-0.5 overflow-hidden rounded-t-3xl`}>
      {visible.map((image, i) => (
        <div key={image.id} className="relative">
          <NoteImageTile image={image} className="w-full aspect-square" />
          {overflow > 0 && i === visible.length - 1 && (
            <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] flex items-center justify-center text-white font-bold text-lg">
              +{overflow}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
