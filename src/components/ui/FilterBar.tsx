"use client";

import { motion } from 'framer-motion';
import { getNoteColorStyles } from '@/lib/colors';
import { hapticLight } from '@/lib/haptics';

export type NoteFilter = 'all' | 'text' | 'checklist' | 'archived';

const FILTERS: { id: NoteFilter; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'text', label: 'Notizen' },
  { id: 'checklist', label: 'Checklisten' },
  { id: 'archived', label: 'Archiviert' },
];

interface FilterBarProps {
  activeFilter: NoteFilter;
  onFilterChange: (filter: NoteFilter) => void;
  /** Colors actually used by existing notes (raw color values). */
  usedColors: string[];
  activeColor: string | null;
  onColorChange: (color: string | null) => void;
}

export default function FilterBar({
  activeFilter,
  onFilterChange,
  usedColors,
  activeColor,
  onColorChange,
}: FilterBarProps) {
  // Only offer color filters that are non-default ("white") and actually in use.
  const colorChips = usedColors.filter((c) => getNoteColorStyles(c).id !== 'white');

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
      {/* Type filter chips */}
      {FILTERS.map((f) => {
        const isActive = activeFilter === f.id;
        return (
          <button
            key={f.id}
            onClick={() => {
              hapticLight();
              onFilterChange(f.id);
            }}
            className={`relative shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide transition-colors cursor-pointer whitespace-nowrap ${
              isActive
                ? 'text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--card-bg)] border border-[var(--border-color)]'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="filter-pill"
                transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                className="absolute inset-0 bg-primary rounded-full -z-0"
              />
            )}
            <span className="relative z-10">{f.label}</span>
          </button>
        );
      })}

      {/* Color filters (only when colored notes exist) */}
      {colorChips.length > 0 && (
        <>
          <span className="shrink-0 h-5 w-[1px] bg-[var(--border-color)] mx-0.5" />
          {colorChips.map((color) => {
            const styles = getNoteColorStyles(color);
            const isActive = activeColor === color;
            return (
              <button
                key={color}
                onClick={() => {
                  hapticLight();
                  onColorChange(isActive ? null : color);
                }}
                title={`Nach Farbe filtern`}
                className={`shrink-0 w-7 h-7 rounded-full border flex items-center justify-center transition-all cursor-pointer ${styles.bg} ${
                  isActive
                    ? 'ring-2 ring-primary ring-offset-1 ring-offset-[var(--background)] scale-110'
                    : 'border-[var(--border-color)] hover:scale-105'
                }`}
                style={styles.style}
              >
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
