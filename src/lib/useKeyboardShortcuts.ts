import { useEffect } from 'react';

interface ShortcutHandlers {
  onNewNote?: () => void;
  onNewChecklist?: () => void;
  onEscape?: () => void;
  onDeleteInEditor?: () => void;
  /** True while an editor/sheet is open (enables Ctrl/Cmd+Backspace delete). */
  isEditing?: boolean;
}

// Desktop keyboard layer:
//   N  → new free-text note
//   L  → new checklist
//   Esc → close the open sheet
//   Ctrl/Cmd+Backspace → delete the note currently being edited
export function useKeyboardShortcuts({
  onNewNote,
  onNewChecklist,
  onEscape,
  onDeleteInEditor,
  isEditing,
}: ShortcutHandlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        onEscape?.();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Backspace') {
        if (isEditing) {
          e.preventDefault();
          onDeleteInEditor?.();
        }
        return;
      }

      // Letter shortcuts must not fire while the user is typing.
      if (isTyping || e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        onNewNote?.();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        onNewChecklist?.();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNewNote, onNewChecklist, onEscape, onDeleteInEditor, isEditing]);
}
