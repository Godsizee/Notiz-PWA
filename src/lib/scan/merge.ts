import { parseQuantity } from '@/lib/quantities';
import { addEntryAmounts } from '@/lib/scan/amounts';
import type { ScanItem, ScanSourceType, ScanUnit } from '@/lib/scan/result';

const UNIT_PLURAL: Partial<Record<ScanUnit, string>> = {
  Packung: 'Packungen', Dose: 'Dosen', Flasche: 'Flaschen', Tafel: 'Tafeln', Tüte: 'Tüten',
  Knolle: 'Knollen', Schale: 'Schalen', Glas: 'Gläser', Netz: 'Netze', Kopf: 'Köpfe',
};

/** "2 Packungen Mehl", "3 Eier", "Backpulver", "Karotten (500 g)". */
export function formatItemText(item: Pick<ScanItem, 'name' | 'count' | 'unit' | 'note'>): string {
  const parts: string[] = [];
  if (item.count > 0) {
    parts.push(String(item.count));
    if (item.unit) parts.push(item.count > 1 ? UNIT_PLURAL[item.unit] ?? item.unit : item.unit);
  }
  parts.push(item.name);
  const text = parts.join(' ');
  return (item.note ? `${text} (${item.note})` : text).slice(0, 120);
}

/**
 * Text, der in die Liste geschrieben wird. Einkaufszettel kommen 1:1 so an, wie
 * sie auf dem Foto stehen ("4 Milch", "2-3 Bananen", "18er Eier") — die Person
 * entscheidet selbst, was sie daraus macht. Nur Rezepte werden in
 * Einkaufsmengen umgerechnet ("500 g Mehl" → "1 Packung Mehl").
 */
export function itemText(item: ScanItem, sourceType: ScanSourceType): string {
  if (sourceType === 'shopping_list') {
    const raw = item.raw.trim();
    if (raw) return raw.slice(0, 120);
  }
  return formatItemText(item);
}

/** Comparable key: no quantity, no "(…)" note, lowercase, umlauts folded. */
export function itemKey(text: string): string {
  return parseQuantity(text)
    .text.replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Equal keys, or a plural ending of at most two letters ("zwiebel"/"zwiebeln"). */
export function sameItem(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // Die Endung muss zum Wort gehoeren: "x b" ist keine Mehrzahl von "x".
  return short.length >= 4 && long.startsWith(short) && long.length - short.length <= 2 && !long.slice(short.length).includes(' ');
}

/**
 * itemKey ohne Mengenreste, die parseQuantity nicht kennt: "2-3 Bananen" und
 * "18er Eier" ergeben "bananen" und "eier" statt "2 3 bananen" und "18er eier".
 */
export function productKey(text: string): string {
  return itemKey(text)
    .split(' ')
    .filter((token) => token && !/^\d+(er|x|stk)?$/.test(token))
    .join(' ');
}

/**
 * Gleiches Produkt nach Schreibweise: gleich oder Mehrzahl (sameItem) oder alle
 * Woerter des kuerzeren Namens stehen im laengeren ("Pommes" in "Pommes frites",
 * "Milch" in "H Milch"). "Milch" und "Milchreis" bleiben verschieden, weil es
 * dort kein ganzes Wort ist. Ein einzelner Buchstabe am Ende ("Haehnchenwurst B")
 * ist eine Variante, kein Zusatz — "Haehnchenwurst" und "Haehnchenwurst B" sind
 * nicht dasselbe; vorn ("H-Milch") ist es nur ein Praefix. Was nur ein Mensch
 * oder das Sprachmodell weiss ("Pink Lady" =
 * "Aepfel"), kommt ueber ScanItem.match.
 */
export function sameProduct(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (sameItem(a, b)) return true;
  const ta = a.split(' ');
  const tb = b.split(' ');
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (!short.every((t) => long.some((u) => sameItem(t, u)))) return false;
  const lastWord = long[long.length - 1];
  const variantLetter = /^[a-z]$/.test(lastWord) && !short.some((t) => sameItem(t, lastWord));
  return !variantLetter;
}

export type MergeAction = 'add' | 'reopen' | 'increase';
export type MergeReason =
  | 'duplicate_open'
  | 'duplicate_scan'
  | 'reopen_completed'
  | 'increase_quantity'
  | 'low_confidence';

export interface MergeRow {
  /** Stable React key for the review list. */
  rowId: string;
  item: ScanItem;
  /** Editable text that will be written to checklist_items.text. */
  text: string;
  action: MergeAction;
  /** checklist_items id for 'reopen' and 'increase'. */
  targetId?: string;
  /** Text des Listeneintrags vor dem Zusammenzug ('increase'), fuer Anzeige und Rueckgaengig. */
  previousText?: string;
  selected: boolean;
  reason?: MergeReason;
}

export interface ExistingItem {
  id: string;
  text: string;
  is_completed: boolean;
}

/** So viele Eintraege der Liste gehen als Abgleichsliste an den Workflow. */
export const MAX_SCAN_EXISTING = 150;

/**
 * Die Liste, die der Workflow zum Abgleichen bekommt: offene zuerst (die will man
 * zusammenziehen), dann erledigte, ohne leere Eintraege, hoechstens 150. Die
 * Reihenfolge ist der Schluessel fuer ScanItem.match — dasselbe Array zum
 * Aufloesen benutzen.
 */
export function existingForScan(existing: ExistingItem[]): ExistingItem[] {
  const usable = existing.filter((e) => e.text.trim());
  return [...usable.filter((e) => !e.is_completed), ...usable.filter((e) => e.is_completed)].slice(0, MAX_SCAN_EXISTING);
}

/** Bei gleichem Produkt in Mehrzahl/Einzahl gewinnt die laengere, sonst bleibt der vorhandene Name. */
function pickName(existingRest: string, addedRest: string): string {
  const a = productKey(existingRest);
  const b = productKey(addedRest);
  if (a && b && sameItem(a, b) && addedRest.length > existingRest.length) return addedRest;
  return existingRest;
}

/**
 * Neuer Text eines offenen Listeneintrags, wenn die gescannte Menge dazukommt
 * ("Pommes" + "Pommes" → "2 Pommes", "2 Pommes" + "3 Pommes" → "5 Pommes"), oder
 * null, wenn sich die Mengen nicht addieren lassen.
 */
function increasedText(target: ExistingItem, row: MergeRow, sourceType: ScanSourceType, semantic: boolean): string | null {
  // Rezept ohne Mengenangabe ("Backpulver", "Salz") heisst: braucht man, nicht: noch eins mehr.
  if (sourceType !== 'shopping_list' && row.item.count === 0) return null;
  const sum = addEntryAmounts(target.text, row.text);
  if (!sum) return null;
  let name = pickName(sum.existingRest, sum.addedRest);
  // Nur das Sprachmodell kennt die Verbindung ("Pink Lady" = "Aepfel"): den gelesenen Namen nicht verlieren.
  if (semantic && !sameProduct(productKey(sum.existingRest), productKey(row.item.name))) {
    name = `${sum.existingRest} (${row.item.name})`;
  }
  return `${sum.total} ${name}`.slice(0, 120);
}

/**
 * Decides per scanned item what the review sheet proposes:
 *  - open entry on the list, quantities add up → increase ("Pommes" + "Pommes" = "2 Pommes")
 *  - open entry, quantities cannot be added    → add, but unselected ("steht schon drauf")
 *  - same item twice in the scan                → add, but unselected
 *  - checked off earlier                        → reopen that item instead of adding a twin
 *  - everything else                            → add, selected (low confidence is flagged)
 *
 * Wann zwei Eintraege dasselbe Produkt sind, entscheidet zuerst das Sprachmodell
 * (item.matchId, "Pink Lady" = "Aepfel"). Hat es abgeglichen und nichts gefunden
 * (match = 0), gelten nur gleiche Namen und Mehrzahl; ohne Abgleich (aelterer
 * Workflow) zusaetzlich die Wortregel aus sameProduct.
 */
export function planMerge(
  scanned: ScanItem[],
  existing: ExistingItem[],
  sourceType: ScanSourceType = 'recipe'
): MergeRow[] {
  const known = existing.map((e) => ({ ...e, key: productKey(e.text) }));
  const byId = new Map(known.map((e) => [e.id, e]));
  const seenKeys: string[] = [];
  const used = new Set<string>(); // Listeneintraege, die diese Planung schon verwendet

  return scanned.map((item, index) => {
    const key = productKey(item.name);
    const row: MergeRow = { rowId: `scan-${index}`, item, text: itemText(item, sourceType), action: 'add', selected: true };
    const same = item.match === undefined ? sameProduct : sameItem;

    // Auf einem Zettel zaehlt nur dieselbe Zeile doppelt ("2 Haehnchenwurst B" und
    // "4. Haehnchenwurst C" sind zwei Eintraege); bei Rezepten wird nach
    // Produkt zusammengefasst. Gegen die Liste gilt immer das Produkt.
    const scanKey = sourceType === 'shopping_list' ? productKey(row.text) || key : key;
    if (seenKeys.some((k) => same(k, scanKey))) return { ...row, selected: false, reason: 'duplicate_scan' };
    seenKeys.push(scanKey);

    const semantic = item.matchId ? byId.get(item.matchId) : undefined;
    const target =
      semantic ??
      known.find((e) => !e.is_completed && same(e.key, key)) ??
      known.find((e) => e.is_completed && same(e.key, key));

    if (target) {
      // Zwei gelesene Zeilen meinen denselben Listeneintrag: nur die erste zaehlt.
      if (used.has(target.id)) return { ...row, selected: false, reason: 'duplicate_scan' };
      used.add(target.id);

      if (target.is_completed) return { ...row, action: 'reopen', targetId: target.id, reason: 'reopen_completed' };

      const text = increasedText(target, row, sourceType, !!semantic);
      if (text) {
        return { ...row, text, action: 'increase', targetId: target.id, previousText: target.text, reason: 'increase_quantity' };
      }
      return { ...row, selected: false, reason: 'duplicate_open' };
    }

    return item.confidence === 'low' ? { ...row, reason: 'low_confidence' } : row;
  });
}
