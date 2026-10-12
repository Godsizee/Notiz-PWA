import { create } from 'zustand';

export type ViewMode = 'grid' | 'list';
export type FontSize = 'sm' | 'md' | 'lg';
/** 'server' = Reihenfolge der Datenbank (Einfuegereihenfolge), 'title' = Titel A–Z. */
export type SortMode = 'server' | 'title';

// Root font-size drives all rem-based sizing → one lever scales the whole UI.
const FONT_SCALE: Record<FontSize, string> = { sm: '87.5%', md: '100%', lg: '112.5%' };

function applyFontSize(size: FontSize) {
  if (typeof document !== 'undefined') {
    document.documentElement.style.fontSize = FONT_SCALE[size];
  }
}

interface PreferencesStore {
  /** Overview layout — persisted per device. */
  viewMode: ViewMode;
  /** Global text size — persisted per device. */
  fontSize: FontSize;
  /** Sortierung der Uebersicht (angepinnte stehen immer oben) — persisted per device. */
  sortMode: SortMode;
  setViewMode: (mode: ViewMode) => void;
  setFontSize: (size: FontSize) => void;
  setSortMode: (mode: SortMode) => void;
}

export const usePreferencesStore = create<PreferencesStore>((set) => ({
  viewMode: 'grid',
  fontSize: 'md',
  sortMode: 'server',
  setViewMode: (viewMode) => {
    localStorage.setItem('viewMode', viewMode);
    set({ viewMode });
  },
  setFontSize: (fontSize) => {
    localStorage.setItem('fontSize', fontSize);
    applyFontSize(fontSize);
    set({ fontSize });
  },
  setSortMode: (sortMode) => {
    localStorage.setItem('sortMode', sortMode);
    set({ sortMode });
  },
}));

let initialized = false;

/** Hydrate persisted prefs into the store (call once, client-side). */
export function initPreferences() {
  if (initialized) return;
  initialized = true;
  const vm = localStorage.getItem('viewMode');
  const fs = localStorage.getItem('fontSize');
  const sm = localStorage.getItem('sortMode');
  const viewMode: ViewMode = vm === 'list' ? 'list' : 'grid';
  const fontSize: FontSize = fs === 'sm' || fs === 'lg' ? fs : 'md';
  const sortMode: SortMode = sm === 'title' ? 'title' : 'server';
  applyFontSize(fontSize); // safety net if the no-flash script did not run
  usePreferencesStore.setState({ viewMode, fontSize, sortMode });
}
