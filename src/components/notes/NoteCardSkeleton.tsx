// Shimmer placeholder card shown during the initial notes load.
// Mirrors the rounded shape / spacing of a real NoteCard so the layout
// does not jump once data arrives.

interface NoteCardSkeletonProps {
  lines?: number;
}

export default function NoteCardSkeleton({ lines = 3 }: NoteCardSkeletonProps) {
  return (
    <div className="mb-4 break-inside-avoid rounded-3xl p-5 border border-[var(--border-color)] bg-[var(--card-bg)] shadow-[var(--shadow-card)] overflow-hidden relative">
      {/* Shimmer sweep */}
      <div className="absolute inset-0 shimmer pointer-events-none" />

      {/* Title placeholder */}
      <div className="h-4 w-2/3 rounded-full bg-[var(--text-muted)]/15 mb-4" />

      {/* Body line placeholders */}
      <div className="space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded-full bg-[var(--text-muted)]/10"
            style={{ width: `${90 - i * 15}%` }}
          />
        ))}
      </div>
    </div>
  );
}
