import { create } from 'zustand';

interface SyncStore {
  /** Browser connectivity (navigator.onLine + online/offline events). */
  isOnline: boolean;
  /** True while the offline queue is being replayed against PocketBase. */
  isSyncing: boolean;
  /** Number of queued offline changes waiting for sync. */
  pendingCount: number;
  /** Number of offline changes that failed permanently (validation/permission) and won't be retried. */
  deadLetterCount: number;
  /** Bumped after every completed flush so data hooks can refetch. */
  flushSerial: number;
  setOnline: (isOnline: boolean) => void;
  setSyncing: (isSyncing: boolean) => void;
  setPendingCount: (pendingCount: number) => void;
  setDeadLetterCount: (deadLetterCount: number) => void;
  bumpFlushSerial: () => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  deadLetterCount: 0,
  flushSerial: 0,
  setOnline: (isOnline) => set({ isOnline }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setDeadLetterCount: (deadLetterCount) => set({ deadLetterCount }),
  bumpFlushSerial: () => set((s) => ({ flushSerial: s.flushSerial + 1 })),
}));
