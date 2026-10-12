// Mengen in Listeneintraegen lesen, addieren und wieder schreiben — fuer den
// Foto-Scan: steht "Pommes" schon auf der Liste und auf dem Zettel noch einmal
// "Pommes", wird daraus "2 Pommes". Ein Eintrag ohne Zahl zaehlt dabei als 1.
//
// Bewusst nur dort addieren, wo es eindeutig ist: gleiche Einheitenklasse und
// eine einfache Zahl. Bereiche ("2-3 Bananen"), "18er Eier" oder Stueck gegen
// Packungen lassen sich nicht ehrlich zusammenzaehlen; dann gibt addEntryAmounts
// null zurueck und die App schlaegt stattdessen keinen Zusammenzug vor.

export interface Amount {
  /** Zahl in der Basiseinheit der Klasse (Stueck, g, ml, ...). */
  value: number;
  /** Einheitenklasse: 'piece', 'g', 'ml' oder die Packungsart ('packung', 'flasche', ...). */
  cls: string;
  /** Einheit, wie sie geschrieben stand ("kg", "Packungen", "x"); '' = reine Stueckzahl. */
  unit: string;
  /** Stand die Zahl ausdruecklich da? Ohne Zahl zaehlt ein Eintrag als 1 Stueck. */
  explicit: boolean;
}

export interface ParsedEntry {
  /** null = Menge nicht addierbar (Bereich, "18er", unbekannte Schreibweise). */
  amount: Amount | null;
  /** Eintragstext ohne den Mengenanteil, z. B. "Mehl" oder "Karotten (500 g)". */
  rest: string;
}

const PIECE = { cls: 'piece', factor: 1 };
const pack = (cls: string) => ({ cls, factor: 1 });

// Muss jede Einheit kennen, die der Foto-Scan schreibt (merge.ts formatItemText)
// und die der Mengen-Badge erkennt (quantities.ts).
const UNITS: Record<string, { cls: string; factor: number }> = {
  x: PIECE, stk: PIECE, stck: PIECE, stück: PIECE, stueck: PIECE,
  g: { cls: 'g', factor: 1 }, kg: { cls: 'g', factor: 1000 },
  ml: { cls: 'ml', factor: 1 }, l: { cls: 'ml', factor: 1000 }, liter: { cls: 'ml', factor: 1000 },
  pkg: pack('packung'), pck: pack('packung'), packung: pack('packung'), packungen: pack('packung'),
  flasche: pack('flasche'), flaschen: pack('flasche'),
  dose: pack('dose'), dosen: pack('dose'),
  becher: pack('becher'),
  glas: pack('glas'), gläser: pack('glas'), glaeser: pack('glas'),
  bund: pack('bund'), bunde: pack('bund'),
  beutel: pack('beutel'),
  tüte: pack('tüte'), tüten: pack('tüte'), tuete: pack('tüte'), tueten: pack('tüte'),
  netz: pack('netz'), netze: pack('netz'),
  tafel: pack('tafel'), tafeln: pack('tafel'),
  würfel: pack('würfel'), wuerfel: pack('würfel'),
  knolle: pack('knolle'), knollen: pack('knolle'),
  kopf: pack('kopf'), köpfe: pack('kopf'), koepfe: pack('kopf'),
  schale: pack('schale'), schalen: pack('schale'),
};

// Einzahl/Mehrzahl der Packungsarten fuer die Anzeige ("1 Packung", "3 Packungen").
const FORMS: Record<string, [string, string]> = {
  packung: ['Packung', 'Packungen'], flasche: ['Flasche', 'Flaschen'], dose: ['Dose', 'Dosen'],
  becher: ['Becher', 'Becher'], glas: ['Glas', 'Gläser'], bund: ['Bund', 'Bund'],
  beutel: ['Beutel', 'Beutel'], tüte: ['Tüte', 'Tüten'], netz: ['Netz', 'Netze'],
  tafel: ['Tafel', 'Tafeln'], würfel: ['Würfel', 'Würfel'], knolle: ['Knolle', 'Knollen'],
  kopf: ['Kopf', 'Köpfe'], schale: ['Schale', 'Schalen'],
};

// Kuerzel bleiben, wie sie geschrieben wurden.
const VERBATIM = new Set(['x', 'stk', 'stck', 'pkg', 'pck', 'g', 'kg', 'ml', 'l', 'liter', 'stück', 'stueck']);

const unitWords = Object.keys(UNITS).sort((a, b) => b.length - a.length).join('|');
// Zahl, optional Einheit, danach muss ein Wortende folgen: "2-3 Bananen" und
// "18er Eier" passen bewusst nicht ("3 Gurken" liest sich nicht als "3 g").
const AMOUNT = new RegExp(`^(\\d+(?:[.,]\\d+)?)(?:\\s*(${unitWords})(?=\\s|$))?(?=\\s|$)(.*)$`, 'i');

export function parseEntry(text: string): ParsedEntry {
  const t = text.trim();
  const m = AMOUNT.exec(t);
  if (m) {
    const n = parseFloat(m[1].replace(',', '.'));
    const word = m[2] ?? '';
    const def = word ? UNITS[word.toLowerCase()] : undefined;
    if (!Number.isFinite(n) || n <= 0) return { amount: null, rest: t };
    return {
      amount: { value: n * (def?.factor ?? 1), cls: def?.cls ?? 'piece', unit: word, explicit: true },
      rest: m[3].trim(),
    };
  }
  // Beginnt mit einer Zahl, die sich nicht sauber lesen laesst → nicht addierbar.
  if (/^\d/.test(t)) return { amount: null, rest: t };
  return { amount: { value: 1, cls: 'piece', unit: '', explicit: false }, rest: t };
}

/** Summe zweier Mengen, oder null, wenn sie nicht zusammenpassen. */
export function addAmounts(a: Amount | null, b: Amount | null): Amount | null {
  if (!a || !b || a.cls !== b.cls) return null;
  return { value: a.value + b.value, cls: a.cls, unit: a.unit, explicit: true };
}

function number(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

/** "2", "2x", "750 g", "1,5 kg", "3 Packungen" — in der Schreibweise der vorhandenen Menge. */
export function formatAmount(amount: Amount): string {
  const { value, cls, unit } = amount;
  if (cls === 'piece') {
    if (!unit) return number(value);
    return unit.toLowerCase() === 'x' ? `${number(value)}x` : `${number(value)} ${unit}`;
  }
  if (cls === 'g') return value >= 1000 ? `${number(value / 1000)} kg` : `${number(value)} g`;
  if (cls === 'ml') return value >= 1000 ? `${number(value / 1000)} l` : `${number(value)} ml`;

  const forms = FORMS[cls];
  if (!forms || VERBATIM.has(unit.toLowerCase())) return `${number(value)} ${unit}`;
  const word = value === 1 ? forms[0] : forms[1];
  // Klein geschriebene Einheit bleibt klein ("2 packungen" → "3 packungen").
  const adjusted = unit[0] === unit[0]?.toLowerCase() ? word.toLowerCase() : word;
  return `${number(value)} ${adjusted}`;
}

/**
 * Addiert die Mengen zweier Eintraege. Gibt die neue Menge als Text und die
 * beiden Restnamen zurueck; null, wenn sich die Mengen nicht addieren lassen
 * oder der vorhandene Eintrag nur aus einer Zahl besteht.
 */
export function addEntryAmounts(
  existingText: string,
  addedText: string
): { total: string; existingRest: string; addedRest: string } | null {
  const have = parseEntry(existingText);
  const add = parseEntry(addedText);
  const sum = addAmounts(have.amount, add.amount);
  if (!sum || !have.rest) return null;
  return { total: formatAmount(sum), existingRest: have.rest, addedRest: add.rest };
}
