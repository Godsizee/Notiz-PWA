import { parseQuantity } from '@/lib/quantities';
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
  return short.length >= 4 && long.startsWith(short) && long.length - short.length <= 2;
}

export type MergeAction = 'add' | 'reopen';
export type MergeReason = 'duplicate_open' | 'duplicate_scan' | 'reopen_completed' | 'low_confidence';

export interface MergeRow {
  /** Stable React key for the review list. */
  rowId: string;
  item: ScanItem;
  /** Editable text that will be written to checklist_items.text. */
  text: string;
  action: MergeAction;
  /** checklist_items id for 'reopen'. */
  targetId?: string;
  selected: boolean;
  reason?: MergeReason;
}

export interface ExistingItem {
  id: string;
  text: string;
  is_completed: boolean;
}

/**
 * Decides per scanned item what the review sheet proposes:
 *  - already open on the list      → add, but unselected ("steht schon drauf")
 *  - same item twice in the scan    → add, but unselected
 *  - checked off earlier            → reopen that item instead of adding a twin
 *  - everything else                → add, selected (low confidence is flagged)
 */
export function planMerge(
  scanned: ScanItem[],
  existing: ExistingItem[],
  sourceType: ScanSourceType = 'recipe'
): MergeRow[] {
  const known = existing.map((e) => ({ ...e, key: itemKey(e.text) }));
  const seenKeys: string[] = [];
  const reopened = new Set<string>();

  return scanned.map((item, index) => {
    const key = itemKey(item.name);
    const row: MergeRow = { rowId: `scan-${index}`, item, text: itemText(item, sourceType), action: 'add', selected: true };

    // Auf einem Zettel zaehlt nur dieselbe Zeile doppelt ("2 Haehnchenwurst B" und
    // "4. Haehnchenwurst C" sind zwei Eintraege); bei Rezepten wird nach
    // Produkt zusammengefasst. Gegen die offene Liste gilt immer das Produkt.
    const scanKey = sourceType === 'shopping_list' ? itemKey(row.text) || key : key;
    if (seenKeys.some((k) => sameItem(k, scanKey))) return { ...row, selected: false, reason: 'duplicate_scan' };
    seenKeys.push(scanKey);

    if (known.some((e) => !e.is_completed && sameItem(e.key, key))) {
      return { ...row, selected: false, reason: 'duplicate_open' };
    }

    const done = known.find((e) => e.is_completed && !reopened.has(e.id) && sameItem(e.key, key));
    if (done) {
      reopened.add(done.id);
      return { ...row, action: 'reopen', targetId: done.id, reason: 'reopen_completed' };
    }

    return item.confidence === 'low' ? { ...row, reason: 'low_confidence' } : row;
  });
}
