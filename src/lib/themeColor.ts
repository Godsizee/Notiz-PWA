import { NOTE_COLORS, getNoteColorStyles } from '@/lib/colors';

// Base status-bar colors per theme (must match the no-flash script in layout.tsx).
const BASE_LIGHT = '#390099';
const BASE_DARK = '#0b0717';
const BASE_AMOLED = '#000000';
const BASE_LIFEOS = '#fff4e0';
const BASE_ARIELLE = '#f7eeda';

// Notizfarben des Life-OS-Designs (muessen zu --note-* in globals.css passen).
const LIFEOS_NOTE_COLORS: Record<string, string> = {
  blue: '#c9d9ff',
  green: '#bdf1d4',
  yellow: '#fff0a8',
  pink: '#ffd0e7',
  purple: '#ddd3ff',
  orange: '#ffd9b5',
};

// Notizfarben des Arielle-Designs (muessen zu --note-* in globals.css passen).
const ARIELLE_NOTE_COLORS: Record<string, string> = {
  blue: '#d4f0ff',
  green: '#d5fbe3',
  yellow: '#f8e7b0',
  pink: '#fcd9dd',
  purple: '#e8dbf6',
  orange: '#fcdcc4',
};

function isDark() {
  return document.documentElement.classList.contains('dark');
}

function isLifeOs() {
  return document.documentElement.classList.contains('lifeos');
}

function isArielle() {
  return document.documentElement.classList.contains('arielle');
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
  apply(
    isAmoled() ? BASE_AMOLED : isDark() ? BASE_DARK : isLifeOs() ? BASE_LIFEOS : isArielle() ? BASE_ARIELLE : BASE_LIGHT,
  );
}

/**
 * Tint the status bar with the opened note's color when it maps to a solid
 * pastel (light theme). Dark note surfaces are near-black overlays, so we keep
 * the dark base there. Pass no color to fall back to the theme base.
 */
export function setNoteThemeColor(color?: string) {
  if (isDark()) return syncThemeColor();
  const id = getNoteColorStyles(color).id;
  if (isLifeOs()) return apply(LIFEOS_NOTE_COLORS[id] ?? BASE_LIFEOS);
  if (isArielle()) return apply(ARIELLE_NOTE_COLORS[id] ?? BASE_ARIELLE);
  const hex = NOTE_COLORS.find((c) => c.id === id)?.hex;
  apply(hex && id !== 'white' ? hex : BASE_LIGHT);
}
