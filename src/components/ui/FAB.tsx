import { Plus } from 'lucide-react';

interface FABProps {
  onClick: () => void;
}

export default function FAB({ onClick }: FABProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-8 right-6 w-14 h-14 bg-[var(--fab-bg)] text-white rounded-2xl shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 z-40 border border-white/10"
      aria-label="Erstellen"
    >
      <Plus size={32} strokeWidth={2.5} />
    </button>
  );
}
