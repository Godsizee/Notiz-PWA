import { syncThemeColor } from '@/lib/themeColor';

// Theme-Umschaltung, herausgeloest aus der frueheren ThemeToggle-Komponente,
// damit das Einstellungsmenue (DisplaySettings) die vier Designs direkt
// anbieten kann. Das No-Flash-Skript in layout.tsx liest denselben
// localStorage-Schluessel und dieselben Klassen — beides muss gleich bleiben.

export type Theme = 'light' | 'dark' | 'amoled' | 'lifeos';

/** Aktives Theme, abgelesen an den Klassen, die das No-Flash-Skript gesetzt hat. */
export function readTheme(): Theme {
  const root = document.documentElement;
  if (root.classList.contains('amoled')) return 'amoled';
  if (root.classList.contains('lifeos')) return 'lifeos';
  return root.classList.contains('dark') ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // Privater Modus o. ae.: Theme gilt dann nur fuer diese Sitzung.
  }
  const root = document.documentElement;
  root.classList.remove('light', 'dark', 'amoled', 'lifeos');
  if (theme === 'amoled') {
    root.classList.add('dark', 'amoled');
  } else {
    root.classList.add(theme);
  }
  syncThemeColor();
}
