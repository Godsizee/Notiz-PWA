// Formatierungshilfen fuer Textnotizen: setzen genau die Muster, die NoteContent
// schon darstellt ("- " Aufzaehlung, "- [ ]" Kaestchen, **fett**). Reiner Text
// rein, reiner Text raus — kein Rich-Text-Editor, die Notiz bleibt Klartext.

export interface TextEdit {
  value: string;
  /** Auswahl bzw. Cursor nach der Aenderung. */
  start: number;
  end: number;
}

export type LineMarker = 'bullet' | 'checkbox';

const BULLET = /^(\s*)- (?!\[[ xX]\] )/;
const CHECKBOX = /^(\s*)- \[[ xX]\] /;
const PREFIX: Record<LineMarker, string> = { bullet: '- ', checkbox: '- [ ] ' };

const hasMarker = (line: string, marker: LineMarker) => (marker === 'bullet' ? BULLET : CHECKBOX).test(line);

function stripMarker(line: string): string {
  return line.replace(CHECKBOX, '$1').replace(BULLET, '$1');
}

/**
 * Setzt oder entfernt den Zeilenanfang "- " bzw. "- [ ] " an allen Zeilen der
 * Auswahl. Traegt die erste Zeile den Marker schon, wird er entfernt (umschalten);
 * ein anderer Marker wird ersetzt. Leere Zeilen einer Mehrzeilen-Auswahl bleiben leer.
 */
export function toggleLineMarker(value: string, start: number, end: number, marker: LineMarker): TextEdit {
  const from = value.lastIndexOf('\n', start - 1) + 1;
  // Endet die Auswahl direkt nach einem Zeilenumbruch, gehoert die Folgezeile nicht dazu.
  const selEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
  let to = value.indexOf('\n', selEnd);
  if (to === -1) to = value.length;

  const lines = value.slice(from, to).split('\n');
  const remove = hasMarker(lines[0], marker);
  const multi = lines.length > 1;

  const next = lines.map((line) => {
    if (multi && !line.trim()) return line;
    if (remove) return hasMarker(line, marker) ? stripMarker(line) : line;
    const indent = /^\s*/.exec(line)?.[0] ?? '';
    return indent + PREFIX[marker] + stripMarker(line).slice(indent.length);
  });

  const deltas = next.map((l, i) => l.length - lines[i].length);
  const total = deltas.reduce((a, b) => a + b, 0);
  return {
    value: value.slice(0, from) + next.join('\n') + value.slice(to),
    start: Math.max(from, start + deltas[0]),
    end: Math.max(from, end + total),
  };
}

/** Umschliesst die Auswahl mit ** (bzw. hebt es auf); ohne Auswahl landet der Cursor zwischen den Sternen. */
export function toggleBold(value: string, start: number, end: number): TextEdit {
  const sel = value.slice(start, end);

  // Auswahl liegt innerhalb von **…** → aufheben
  if (sel && value.slice(start - 2, start) === '**' && value.slice(end, end + 2) === '**') {
    return { value: value.slice(0, start - 2) + sel + value.slice(end + 2), start: start - 2, end: end - 2 };
  }
  // Auswahl enthaelt die Sterne selbst → aufheben
  if (sel.length >= 4 && sel.startsWith('**') && sel.endsWith('**')) {
    const inner = sel.slice(2, -2);
    return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
  }
  if (sel) {
    return { value: `${value.slice(0, start)}**${sel}**${value.slice(end)}`, start: start + 2, end: end + 2 };
  }
  return { value: `${value.slice(0, start)}****${value.slice(end)}`, start: start + 2, end: start + 2 };
}

/**
 * Enter in einer Aufzaehlungs- oder Kaestchen-Zeile: das Muster in der neuen
 * Zeile fortsetzen. Enter in einer Zeile, die nur aus dem Muster besteht,
 * entfernt es (Liste beenden, wie in Apple Notes). null = normales Enter.
 */
export function continueListOnEnter(value: string, caret: number): TextEdit | null {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1;
  const before = value.slice(lineStart, caret);
  const match = /^(\s*)- (\[[ xX]\] )?/.exec(before);
  if (!match) return null;

  let lineEnd = value.indexOf('\n', caret);
  if (lineEnd === -1) lineEnd = value.length;
  const prefixLength = match[0].length;
  const rest = value.slice(lineStart + prefixLength, lineEnd);

  if (before.length === prefixLength && !rest.trim()) {
    return { value: value.slice(0, lineStart) + value.slice(lineEnd), start: lineStart, end: lineStart };
  }

  const nextPrefix = `\n${match[1]}- ${match[2] ? '[ ] ' : ''}`;
  const pos = caret + nextPrefix.length;
  return { value: value.slice(0, caret) + nextPrefix + value.slice(caret), start: pos, end: pos };
}
