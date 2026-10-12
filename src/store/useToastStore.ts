import { create } from 'zustand';

export interface ToastData {
  /** Unique id so re-triggering replaces the current toast cleanly. */
  id: number;
  message: string;
  /** Optional action button label (e.g. "Rückgängig"). */
  actionLabel?: string;
  /** Callback fired when the action button is pressed. */
  onAction?: () => void;
  /** Auto-dismiss duration in ms. */
  duration: number;
  /** Visual tone of the toast. */
  tone?: 'default' | 'danger';
}

interface ToastStore {
  toast: ToastData | null;
  /**
   * Wo die Snackbar steht: 'fab' ueber dem Plus-Knopf der Uebersicht, 'bar' ueber
   * der unteren Leiste einer offenen Notiz. Gesetzt von HomeScreen.
   */
  offset: 'fab' | 'bar';
  setOffset: (offset: 'fab' | 'bar') => void;
  showToast: (toast: Omit<ToastData, 'id'>) => void;
  dismiss: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toast: null,
  offset: 'fab',
  setOffset: (offset) => set({ offset }),
  showToast: (toast) =>
    set({ toast: { ...toast, id: Date.now() } }),
  dismiss: () => set({ toast: null }),
}));
