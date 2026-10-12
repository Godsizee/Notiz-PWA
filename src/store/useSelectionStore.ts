import { create } from 'zustand';

// Mehrfachauswahl in der Uebersicht (lange druecken = auswaehlen, wie in Keep).
// Eigener Store statt State in HomeScreen: jede NoteCard liest nur, ob SIE
// ausgewaehlt ist, und rendert beim Umschalten einer anderen Karte nicht neu.

interface SelectionStore {
  ids: ReadonlySet<string>;
  toggle: (id: string) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionStore>((set) => ({
  ids: new Set(),
  toggle: (id) =>
    set((s) => {
      const next = new Set(s.ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ids: next };
    }),
  clear: () => set({ ids: new Set() }),
}));

export const useIsSelected = (id: string) => useSelectionStore((s) => s.ids.has(id));
export const useSelectionActive = () => useSelectionStore((s) => s.ids.size > 0);
