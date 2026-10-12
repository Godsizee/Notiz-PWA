// Mehrzeiliges Einfuegen in eine Checkliste: aus einer kopierten Liste
// (WhatsApp, Mail, Notiz-App) wird je Zeile ein Eintrag.

export interface PastedItem {
  text: string;
  done: boolean;
}

const MAX_ITEMS = 100;
// "- ", "* ", "• ", "– " und Markdown-Haekchen "[ ]" / "[x]", in dieser Reihenfolge.
const BULLET = /^\s*(?:[-*•–]\s+)?/;
const CHECKBOX = /^\[([ xX])\]\s*/;
const NUMBERED = /^\s*(\d{1,3})[.)]\s+/;
// Unicode-Kaestchen, wie sie Notiz-Apps beim Teilen schreiben (auch unsere, noteText.ts).
const BOX = /^([☐☑✓✔])\s*/;

/**
 * Zerlegt eingefuegten Text in Eintraege. Gibt null zurueck, wenn es nur eine
 * Zeile ist — dann ist es normales Tippen/Einfuegen in das Eingabefeld.
 *
 * Nummerierungen werden nur entfernt, wenn ALLE Zeilen fortlaufend 1., 2., 3.
 * nummeriert sind: "4. Haehnchenwurst" auf einem Zettel ist eine Menge, keine
 * Aufzaehlung.
 */
export function splitPastedItems(raw: string): PastedItem[] | null {
  return raw.split(/\r?\n/).filter((l) => l.trim()).length < 2 ? null : linesToItems(raw);
}

/** Jede nicht-leere Zeile ein Eintrag — auch fuer das Umwandeln Textnotiz → Liste. */
export function linesToItems(raw: string): PastedItem[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const numbers = lines.map((l) => NUMBERED.exec(l)?.[1]);
  const isNumberedList = numbers.every((n, i) => n !== undefined && Number(n) === i + 1);

  return lines.slice(0, MAX_ITEMS).flatMap((line) => {
    let text = isNumberedList ? line.replace(NUMBERED, '') : line;
    text = text.replace(BULLET, '');
    let done = false;
    const box = CHECKBOX.exec(text);
    if (box) {
      done = box[1].toLowerCase() === 'x';
      text = text.slice(box[0].length);
    } else {
      const uni = BOX.exec(text);
      if (uni) {
        done = uni[1] !== '☐';
        text = text.slice(uni[0].length);
      }
    }
    text = text.trim().slice(0, 500);
    return text ? [{ text, done }] : [];
  });
}
