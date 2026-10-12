import { parseQuantity } from '@/lib/quantities';
import { itemKey } from '@/lib/scan/merge';

// Vorschlaege beim Tippen eines neuen Checklisten-Eintrags, aus allem, was in
// irgendeiner Liste schon einmal stand. Rein lokal: kein Netz, keine neue
// Collection — die Eintraege kennt die App ohnehin (Suche, Offline-Snapshot).

export interface HistoryEntry {
  text: string;
  /** ISO-Zeitstempel oder leer; neuere Eintraege gewinnen bei gleicher Haeufigkeit. */
  updated?: string;
}

interface Candidate {
  key: string;
  product: string;
  count: number;
  latest: string;
}

/**
 * @param input    aktueller Text im Eingabefeld, z. B. "2 Mi"
 * @param history  Eintraege aller Listen (auch abgehakte)
 * @param openKeys itemKey() der Eintraege, die auf DIESER Liste schon offen stehen
 * @returns bis zu `limit` Vorschlaege; eine Mengenangabe aus dem Input bleibt
 *          vorne stehen ("2 Mi" → "2 Milch")
 */
export function rankSuggestions(
  input: string,
  history: readonly HistoryEntry[],
  openKeys: ReadonlySet<string>,
  limit = 3
): string[] {
  const { quantity, text: typed } = parseQuantity(input.trim());
  const prefix = itemKey(typed || input);
  if (prefix.length < 2) return [];

  const byKey = new Map<string, Candidate>();
  for (const entry of history) {
    const product = parseQuantity(entry.text.trim()).text.replace(/\s+/g, ' ').trim();
    const key = itemKey(product);
    if (!key || !key.startsWith(prefix) || key === prefix || openKeys.has(key)) continue;
    const c = byKey.get(key);
    const updated = entry.updated ?? '';
    if (c) {
      c.count += 1;
      if (updated > c.latest) {
        c.latest = updated;
        c.product = product;
      }
    } else {
      byKey.set(key, { key, product, count: 1, latest: updated });
    }
  }

  return [...byKey.values()]
    .sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest) || a.product.localeCompare(b.product, 'de'))
    .slice(0, limit)
    .map((c) => (quantity ? `${quantity} ${c.product}` : c.product));
}
