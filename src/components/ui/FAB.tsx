import { Plus } from 'lucide-react';

interface FABProps {
  onClick: () => void;
}

export default function FAB({ onClick }: FABProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all z-30"
      aria-label="New Note"
    >
      <Plus size={32} />
    </button>
  );
}
