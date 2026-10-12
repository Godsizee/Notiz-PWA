import { parseQuantity } from '@/lib/quantities';
import type { ScanItem, ScanUnit } from '@/lib/scan/result';

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
export function planMerge(scanned: ScanItem[], existing: ExistingItem[]): MergeRow[] {
  const known = existing.map((e) => ({ ...e, key: itemKey(e.text) }));
  const seenKeys: string[] = [];
  const reopened = new Set<string>();

  return scanned.map((item, index) => {
    const key = itemKey(item.name);
    const row: MergeRow = { rowId: `scan-${index}`, item, text: formatItemText(item), action: 'add', selected: true };

    if (seenKeys.some((k) => sameItem(k, key))) return { ...row, selected: false, reason: 'duplicate_scan' };
    seenKeys.push(key);

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
