import { NOTE_COLORS, getNoteColorStyles } from '@/lib/colors';

// Base status-bar colors per theme (must match the no-flash script in layout.tsx).
const BASE_LIGHT = '#390099';
const BASE_DARK = '#0b0717';
const BASE_AMOLED = '#000000';

function isDark() {
  return document.documentElement.classList.contains('dark');
}

function isAmoled() {
  return document.documentElement.classList.contains('amoled');
}

function metaEl(): HTMLMetaElement | null {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById('theme-color-dynamic') as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', 'theme-color');
    el.id = 'theme-color-dynamic';
    document.head.appendChild(el);
  }
  return el;
}

function apply(color: string) {
  metaEl()?.setAttribute('content', color);
}

/** Status-bar color follows the active theme. */
export function syncThemeColor() {
  apply(isAmoled() ? BASE_AMOLED : isDark() ? BASE_DARK : BASE_LIGHT);
}

/**
 * Tint the status bar with the opened note's color when it maps to a solid
 * pastel (light theme). Dark note surfaces are near-black overlays, so we keep
 * the dark base there. Pass no color to fall back to the theme base.
 */
export function setNoteThemeColor(color?: string) {
  if (isDark()) return syncThemeColor();
  const id = getNoteColorStyles(color).id;
  const hex = NOTE_COLORS.find((c) => c.id === id)?.hex;
  apply(hex && id !== 'white' ? hex : BASE_LIGHT);
}
