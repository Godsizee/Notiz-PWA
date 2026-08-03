"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RecordModel } from 'pocketbase';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';
import { X, Share2, Trash2, Download, Star } from 'lucide-react';
import { useImageSrc, imageUrl, shareImage, type ImageVariant } from '@/lib/noteImages';
import { blobGet } from '@/lib/offlineDb';
import { hapticLight, hapticMedium } from '@/lib/haptics';

// Full-screen image viewer.
//
// The app disables browser zoom globally (viewport userScalable: false in
// layout.tsx), so pinch and double-tap zoom have to be implemented here. On a
// foldable's cover display — 22:9, ~350 CSS px wide — a portrait photo shown
// "full screen" is genuinely small, which makes zoom a baseline requirement
// rather than a nicety.

const SWIPE_PAGE_THRESHOLD = 70;   // px of horizontal travel that turns the page
const SWIPE_DISMISS_THRESHOLD = 120; // px of downward travel that closes
const TAP_SLOP = 8;                // px of movement that still counts as a tap
const DOUBLE_TAP_MS = 300;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

interface ImageViewerProps {
  images: RecordModel[];
  startIndex: number;
  onClose: () => void;
  onDelete?: (image: RecordModel) => void;
  onMakeCover?: (image: RecordModel) => void;
}

function Slide({ image, variant }: { image: RecordModel; variant: ImageVariant }) {
  const src = useImageSrc(image, variant);
  const placeholder = String(image.placeholder || '');

  return (
    <div className="w-full h-full shrink-0 flex items-center justify-center overflow-hidden">
      {/* Plain <img> for the same reason as in NoteImageGallery: cross-origin
          PocketBase file, next/image would only add a loader requirement. */}
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt=""
          draggable={false}
          className="max-w-full max-h-full object-contain select-none"
        />
      ) : placeholder ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={placeholder} alt="" className="max-w-full max-h-full object-contain blur-xl" />
      ) : null}
    </div>
  );
}

export default function ImageViewer({
  images,
  startIndex,
  onClose,
  onDelete,
  onMakeCover,
}: ImageViewerProps) {
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);

  // Recomputed on resize — a foldable unfolding mid-view changes the page
  // width by a factor of ~2.5, and a stale value would leave the track
  // parked between two slides.
  const [pageWidth, setPageWidth] = useState(() =>
    typeof window === 'undefined' ? 0 : window.innerWidth
  );

  const trackX = useMotionValue(0);
  const zoomScale = useMotionValue(1);
  const zoomX = useMotionValue(0);
  const zoomY = useMotionValue(0);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({
    startX: 0,
    startY: 0,
    originTrack: 0,
    originZoomX: 0,
    originZoomY: 0,
    startDistance: 0,
    startScale: 1,
    moved: false,
    pinched: false,
  });
  const lastTapAt = useRef(0);
  const indexRef = useRef(startIndex);

  const current = images[Math.min(index, images.length - 1)];

  useEffect(() => { indexRef.current = index; }, [index]);

  const resetZoom = useCallback(() => {
    animate(zoomScale, 1, { type: 'spring', damping: 30, stiffness: 300 });
    animate(zoomX, 0, { type: 'spring', damping: 30, stiffness: 300 });
    animate(zoomY, 0, { type: 'spring', damping: 30, stiffness: 300 });
    setZoomed(false);
  }, [zoomScale, zoomX, zoomY]);

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(images.length - 1, next));
      if (clamped !== indexRef.current) {
        hapticLight();
        resetZoom();
      }
      indexRef.current = clamped;
      setIndex(clamped);
      animate(trackX, -clamped * pageWidth, { type: 'spring', damping: 30, stiffness: 260 });
    },
    [images.length, pageWidth, trackX, resetZoom]
  );

  // Keep the track aligned when the viewport changes (fold/unfold, rotation).
  useEffect(() => {
    const onResize = () => {
      const width = window.innerWidth;
      setPageWidth(width);
      trackX.set(-indexRef.current * width);
    };
    onResize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, [trackX]);

  // Keyboard support for the desktop case.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goTo(indexRef.current + 1);
      if (e.key === 'ArrowLeft') goTo(indexRef.current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, goTo]);

  // Closing the last image leaves nothing to show.
  useEffect(() => {
    if (images.length === 0) onClose();
  }, [images.length, onClose]);

  const distanceBetweenPointers = () => {
    const [a, b] = Array.from(pointers.current.values());
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      gesture.current.startX = e.clientX;
      gesture.current.startY = e.clientY;
      gesture.current.originTrack = trackX.get();
      gesture.current.originZoomX = zoomX.get();
      gesture.current.originZoomY = zoomY.get();
      gesture.current.moved = false;
      gesture.current.pinched = false;
    } else if (pointers.current.size === 2) {
      gesture.current.startDistance = distanceBetweenPointers();
      gesture.current.startScale = zoomScale.get();
      gesture.current.pinched = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2) {
      const distance = distanceBetweenPointers();
      if (gesture.current.startDistance > 0) {
        const next = Math.min(
          MAX_SCALE,
          Math.max(1, (gesture.current.startScale * distance) / gesture.current.startDistance)
        );
        zoomScale.set(next);
      }
      return;
    }

    const dx = e.clientX - gesture.current.startX;
    const dy = e.clientY - gesture.current.startY;
    if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) gesture.current.moved = true;

    if (zoomScale.get() > 1.02) {
      // Zoomed in: one finger pans the image instead of turning the page.
      zoomX.set(gesture.current.originZoomX + dx);
      zoomY.set(gesture.current.originZoomY + dy);
    } else {
      trackX.set(gesture.current.originTrack + dx);
      zoomY.set(dy > 0 ? dy : 0); // downward drag lifts the image for dismissal
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;

    const wasPinching = gesture.current.pinched;
    const settledScale = zoomScale.get();

    if (wasPinching) {
      if (settledScale <= 1.02) resetZoom();
      else setZoomed(true);
      return;
    }

    if (settledScale > 1.02) {
      // Panning while zoomed — nothing further to settle.
      return;
    }

    const dx = e.clientX - gesture.current.startX;
    const dy = e.clientY - gesture.current.startY;

    if (!gesture.current.moved) {
      const now = Date.now();
      if (now - lastTapAt.current < DOUBLE_TAP_MS) {
        lastTapAt.current = 0;
        hapticLight();
        if (settledScale > 1.02) {
          resetZoom();
        } else {
          animate(zoomScale, DOUBLE_TAP_SCALE, { type: 'spring', damping: 30, stiffness: 300 });
          setZoomed(true);
        }
      } else {
        lastTapAt.current = now;
        setChromeVisible((v) => !v);
      }
      animate(zoomY, 0, { type: 'spring', damping: 30, stiffness: 300 });
      return;
    }

    if (dy > SWIPE_DISMISS_THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
      hapticLight();
      onClose();
      return;
    }

    animate(zoomY, 0, { type: 'spring', damping: 30, stiffness: 300 });

    if (dx < -SWIPE_PAGE_THRESHOLD) goTo(indexRef.current + 1);
    else if (dx > SWIPE_PAGE_THRESHOLD) goTo(indexRef.current - 1);
    else goTo(indexRef.current);
  };

  const handleDownload = async () => {
    // Not yet uploaded → the only copy is the queued blob in IndexedDB.
    const remote = imageUrl(current, 'full');
    const blobKey = String(current._blobKey ?? '');
    const localUrl = !remote && blobKey
      ? await blobGet(blobKey).then((b) => (b ? URL.createObjectURL(b) : '')).catch(() => '')
      : '';
    const href = remote || localUrl;
    if (!href) return;

    const link = document.createElement('a');
    link.href = href;
    link.download = `${current.id}.${(String(current.file || '').split('.').pop() || 'webp')}`;
    link.rel = 'noopener';
    link.click();
    if (localUrl) URL.revokeObjectURL(localUrl);
  };

  if (typeof document === 'undefined' || !current) return null;

  const actionButton =
    'w-11 h-11 rounded-full bg-white/10 backdrop-blur-md text-white flex items-center justify-center transition-transform active:scale-90 cursor-pointer';

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-100 bg-black h-dvh overflow-hidden select-none"
      >
        {/* Gesture surface. touch-action: none because every gesture here is
            handled manually — the app has browser zoom switched off. */}
        <div
          className="absolute inset-0 touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <motion.div className="absolute inset-0 flex" style={{ x: trackX }}>
            {images.map((image, i) => (
              <div
                key={image.id}
                className="h-full shrink-0"
                style={{ width: pageWidth || '100vw' }}
              >
                {/* Only the current slide carries the zoom/drag transform, so a
                    page turn can't leave a stale one behind on its neighbour.
                    Neighbours are pre-rendered one deep; everything further out
                    stays unmounted rather than downloading the whole album. */}
                {i === index ? (
                  <motion.div
                    className="w-full h-full"
                    style={{ scale: zoomScale, x: zoomX, y: zoomY }}
                  >
                    <Slide image={image} variant="full" />
                  </motion.div>
                ) : Math.abs(i - index) === 1 ? (
                  <Slide image={image} variant="full" />
                ) : null}
              </div>
            ))}
          </motion.div>
        </div>

        {/* Chrome — tap the image to toggle, so a photo can be seen unobstructed */}
        <AnimatePresence>
          {chromeVisible && (
            <>
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 pt-3 pb-6 bg-linear-to-b from-black/70 to-transparent pointer-events-none"
                style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
              >
                <button onClick={onClose} aria-label="Schließen" className={`${actionButton} pointer-events-auto`}>
                  <X className="w-5 h-5" />
                </button>
                {images.length > 1 && (
                  <span className="text-xs font-bold text-white/80 tracking-widest tabular-nums">
                    {index + 1} / {images.length}
                  </span>
                )}
                <div className="w-11" />
              </motion.div>

              {/* Actions sit at the bottom: on a 22:9 cover display the top of
                  the screen is out of thumb reach. */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 px-4 pt-8 pb-4 bg-linear-to-t from-black/70 to-transparent"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
              >
                <button
                  onClick={async () => {
                    const shared = await shareImage(current);
                    if (shared) hapticLight();
                  }}
                  aria-label="Teilen"
                  className={actionButton}
                >
                  <Share2 className="w-5 h-5" />
                </button>

                <button onClick={handleDownload} aria-label="Herunterladen" className={actionButton}>
                  <Download className="w-5 h-5" />
                </button>

                {onMakeCover && images.length > 1 && index !== 0 && (
                  <button
                    onClick={() => {
                      hapticLight();
                      onMakeCover(current);
                      goTo(0);
                    }}
                    aria-label="Als Titelbild"
                    className={actionButton}
                  >
                    <Star className="w-5 h-5" />
                  </button>
                )}

                {onDelete && (
                  <button
                    onClick={() => {
                      hapticMedium();
                      onDelete(current);
                      if (images.length <= 1) onClose();
                      else goTo(Math.max(0, index - 1));
                    }}
                    aria-label="Löschen"
                    className={`${actionButton} text-red-400`}
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {zoomed && (
          <button
            onClick={resetZoom}
            className="absolute left-1/2 -translate-x-1/2 bottom-24 text-[10px] font-bold uppercase tracking-widest text-white/60 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md cursor-pointer"
          >
            Zoom zurücksetzen
          </button>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
