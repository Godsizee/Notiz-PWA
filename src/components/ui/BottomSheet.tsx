"use client";

import { motion, AnimatePresence, useDragControls, type PanInfo } from 'framer-motion';
import { hapticLight } from '@/lib/haptics';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

// Distance / velocity past which a downward drag dismisses the sheet.
const DISMISS_OFFSET = 150;
const DISMISS_VELOCITY = 600;

export default function BottomSheet({ isOpen, onClose, children }: BottomSheetProps) {
  // Drag is started only from the handle (dragListener={false}) so that
  // scrollable content / inputs inside the sheet are not hijacked.
  const dragControls = useDragControls();

  const handleDragEnd = (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) {
      hapticLight();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 1 }}
            onDragEnd={handleDragEnd}
            className="fixed bottom-0 left-0 right-0 bg-[var(--card-bg)] rounded-t-3xl p-4 z-50 shadow-[var(--shadow-elevated)] border-t border-[var(--border-color)] max-w-4xl mx-auto max-h-[92vh] overflow-hidden"
          >
            {/* Drag Handle — the only drag-initiating surface */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="w-full flex justify-center pt-1 pb-3 -mt-1 cursor-grab active:cursor-grabbing touch-none"
            >
              <div className="w-12 h-1.5 bg-[var(--text-muted)]/40 rounded-full transition-colors" />
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
