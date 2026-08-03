"use client";

import { RecordModel } from 'pocketbase';
import { motion } from 'framer-motion';
import { CloudUpload, X } from 'lucide-react';
import { useImageSrc, isPendingUpload, type ImageVariant } from '@/lib/noteImages';

/**
 * A single image. The stored blur placeholder sits underneath as a background
 * so the tile is never a blank hole — it renders instantly from the record
 * itself, before any network request, and doubles as the loading state.
 */
export function NoteImageTile({
  image,
  variant = 'thumb',
  className = '',
  style,
  onClick,
  layoutId,
}: {
  image: RecordModel;
  variant?: ImageVariant;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  layoutId?: string;
}) {
  const src = useImageSrc(image, variant);
  const placeholder = String(image.placeholder || '');
  const pending = isPendingUpload(image);

  return (
    <motion.div
      layoutId={layoutId}
      onClick={onClick}
      className={`relative overflow-hidden bg-[var(--text-primary)]/5 ${className}`}
      style={{
        ...style,
        ...(placeholder
          ? {
              backgroundImage: `url(${placeholder})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : null),
      }}
    >
      {/* Plain <img>, not next/image: PocketBase serves these from another
          origin, so next/image would need a custom loader plus remotePatterns
          for no gain — the thumbnails are already generated server-side. */}
      {src && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="w-full h-full object-cover select-none"
        />
      )}

      {/* Not uploaded yet — mirrors the pending badge in the header. */}
      {pending && (
        <div className="absolute bottom-1 right-1 p-1 rounded-md bg-black/45 backdrop-blur-sm text-white/90">
          <CloudUpload className="w-3 h-3" />
        </div>
      )}
    </motion.div>
  );
}

interface NoteImageGalleryProps {
  images: RecordModel[];
  onOpen: (index: number) => void;
  onDelete?: (image: RecordModel) => void;
}

/**
 * Editor gallery, rendered above the title — the Google Keep placement. Two
 * columns below the `xs` breakpoint (24rem): on a foldable's cover display a
 * three-column grid would leave ~100px tiles, which is below a comfortable
 * tap target.
 */
export default function NoteImageGallery({ images, onOpen, onDelete }: NoteImageGalleryProps) {
  if (images.length === 0) return null;

  const single = images.length === 1;

  return (
    <div className={single ? 'mb-4' : 'grid grid-cols-2 xs:grid-cols-3 gap-1.5 mb-4'}>
      {images.map((image, index) => {
        const width = Number(image.width) || 4;
        const height = Number(image.height) || 3;

        return (
          <div key={image.id} className="relative group/tile">
            <NoteImageTile
              image={image}
              layoutId={`note-image-${image.id}`}
              onClick={() => onOpen(index)}
              className={
                single
                  ? 'rounded-2xl w-full max-h-[45vh] cursor-pointer'
                  : 'rounded-xl aspect-square cursor-pointer'
              }
              style={single ? { aspectRatio: `${width} / ${height}` } : undefined}
            />

            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(image);
                }}
                aria-label="Bild entfernen"
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center transition-transform active:scale-90 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
