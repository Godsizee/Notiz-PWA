"use client";

import { useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { hapticMedium } from '@/lib/haptics';

const THRESHOLD = 80; // px pulled (after resistance) needed to trigger a refresh
const MAX_PULL = 120;
const RESISTANCE = 0.5;

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
}

// Touch-only pull-to-refresh. On non-touch devices the handlers simply
// never fire, so children render normally.
export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const reachedThreshold = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY > 0 || refreshing) {
      startY.current = null;
      return;
    }
    startY.current = e.touches[0].clientY;
    reachedThreshold.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    // Bail out if the user scrolled away from the top or is pulling up.
    if (delta <= 0 || window.scrollY > 0) {
      setPull(0);
      return;
    }
    const dist = Math.min(delta * RESISTANCE, MAX_PULL);
    setPull(dist);
    if (dist >= THRESHOLD && !reachedThreshold.current) {
      reachedThreshold.current = true;
      hapticMedium();
    } else if (dist < THRESHOLD) {
      reachedThreshold.current = false;
    }
  };

  const handleTouchEnd = async () => {
    if (startY.current === null) return;
    startY.current = null;
    if (pull >= THRESHOLD) {
      setRefreshing(true);
      setPull(THRESHOLD * 0.6); // hold indicator visible during refresh
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  };

  const progress = Math.min(pull / THRESHOLD, 1);

  return (
    <div onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      {/* Spinner indicator that follows the pull */}
      <div className="relative">
        <div
          className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none"
          style={{ top: pull - 44, opacity: progress }}
        >
          <div className="w-9 h-9 rounded-full bg-[var(--card-bg)] border border-[var(--border-color)] shadow-lg flex items-center justify-center">
            <RefreshCw
              className={`w-4 h-4 text-primary ${refreshing ? 'animate-spin' : ''}`}
              style={!refreshing ? { transform: `rotate(${progress * 270}deg)` } : undefined}
            />
          </div>
        </div>
      </div>

      <motion.div
        animate={{ y: pull }}
        transition={
          refreshing || pull === 0
            ? { type: 'spring', damping: 30, stiffness: 300 }
            : { duration: 0 }
        }
      >
        {children}
      </motion.div>
    </div>
  );
}
