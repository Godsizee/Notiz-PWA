export const NOTE_COLORS = [
  { id: 'white', label: 'Standard', hex: '#ffffff' },
  { id: 'blue', label: 'Blau', hex: '#e3f2fd' },
  { id: 'green', label: 'Grün', hex: '#e8f5e9' },
  { id: 'yellow', label: 'Gelb', hex: '#fffde7' },
  { id: 'pink', label: 'Rosa', hex: '#fce4ec' },
  { id: 'purple', label: 'Lila', hex: '#f3e5f5' },
  { id: 'orange', label: 'Orange', hex: '#fff3e0' },
];

export interface NoteStyle {
  bg: string;
  icon: string;
  id: string;
  style?: React.CSSProperties;
}

export function getNoteColorStyles(color: string | undefined): NoteStyle {
  if (!color) {
    return {
      bg: 'bg-[var(--note-white)] border-[var(--note-white-border)]',
      icon: 'text-[var(--note-white-icon)]',
      id: 'white'
    };
  }
  
  const c = color.toLowerCase();
  
  if (c === 'white' || c === '#ffffff') {
    return {
      bg: 'bg-[var(--note-white)] border-[var(--note-white-border)]',
      icon: 'text-[var(--note-white-icon)]',
      id: 'white'
    };
  }
  if (c === 'blue' || c === '#e3f2fd' || c === 'var(--color-pastel-blue)') {
    return {
      bg: 'bg-[var(--note-blue)] border-[var(--note-blue-border)]',
      icon: 'text-[var(--note-blue-icon)]',
      id: 'blue'
    };
  }
  if (c === 'green' || c === '#e8f5e9' || c === 'var(--color-pastel-green)') {
    return {
      bg: 'bg-[var(--note-green)] border-[var(--note-green-border)]',
      icon: 'text-[var(--note-green-icon)]',
      id: 'green'
    };
  }
  if (c === 'yellow' || c === '#fffde7' || c === 'var(--color-pastel-yellow)') {
    return {
      bg: 'bg-[var(--note-yellow)] border-[var(--note-yellow-border)]',
      icon: 'text-[var(--note-yellow-icon)]',
      id: 'yellow'
    };
  }
  if (c === 'pink' || c === '#fce4ec' || c === 'var(--color-pastel-pink)') {
    return {
      bg: 'bg-[var(--note-pink)] border-[var(--note-pink-border)]',
      icon: 'text-[var(--note-pink-icon)]',
      id: 'pink'
    };
  }
  if (c === 'purple' || c === '#f3e5f5' || c === 'var(--color-pastel-purple)') {
    return {
      bg: 'bg-[var(--note-purple)] border-[var(--note-purple-border)]',
      icon: 'text-[var(--note-purple-icon)]',
      id: 'purple'
    };
  }
  if (c === 'orange' || c === '#fff3e0' || c === 'var(--color-pastel-orange)') {
    return {
      bg: 'bg-[var(--note-orange)] border-[var(--note-orange-border)]',
      icon: 'text-[var(--note-orange-icon)]',
      id: 'orange'
    };
  }
  
  // Custom fallback style for custom-injected hex codes
  return {
    bg: 'border-[var(--border-color)]',
    style: { backgroundColor: color },
    icon: 'text-primary',
    id: 'custom'
  };
}
