// Klartext-Fassungen einer Notiz: zum Teilen (Web Share / Zwischenablage) und
// zum Umwandeln Liste ↔ Textnotiz.

export interface PlainItem {
  text: string;
  is_completed: boolean;
  order?: number;
}

const byOrder = (a: PlainItem, b: PlainItem) => (a.order ?? 0) - (b.order ?? 0);

/** Offene Eintraege zuerst, in Listenreihenfolge — wie in der App angezeigt. */
function ordered(items: readonly PlainItem[]): PlainItem[] {
  const open = items.filter((i) => !i.is_completed).sort(byOrder);
  const done = items.filter((i) => i.is_completed).sort(byOrder);
  return [...open, ...done];
}

/**
 * Zum Teilen in andere Apps (WhatsApp, Mail). Kaestchen statt Markdown, weil
 * Messenger "- [ ]" woertlich anzeigen.
 */
export function noteToShareText(title: string, content: string, items: readonly PlainItem[] | null): string {
  const head = title.trim();
  const body = items
    ? ordered(items)
        .filter((i) => i.text.trim())
        .map((i) => `${i.is_completed ? '☑' : '☐'} ${i.text.trim()}`)
        .join('\n')
    : content.trim();
  return [head, body].filter(Boolean).join('\n\n');
}

/**
 * Liste → Textnotiz. Markdown-Haekchen, weil NoteContent.tsx sie auf der Karte
 * als Kaestchen darstellt und checklistPaste.ts sie beim Zurueckwandeln erkennt.
 */
export function checklistToContent(items: readonly PlainItem[]): string {
  return ordered(items)
    .filter((i) => i.text.trim())
    .map((i) => `- [${i.is_completed ? 'x' : ' '}] ${i.text.trim()}`)
    .join('\n');
}
