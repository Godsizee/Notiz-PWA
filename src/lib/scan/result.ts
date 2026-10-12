export const SCAN_UNITS = [
  '', 'Packung', 'Becher', 'Dose', 'Glas', 'Flasche', 'Tafel', 'Tüte', 'Beutel', 'Netz',
  'Bund', 'Würfel', 'Knolle', 'Kopf', 'Schale', 'Stück', 'g', 'kg', 'ml', 'l',
] as const;
export type ScanUnit = (typeof SCAN_UNITS)[number];
export type ScanConfidence = 'high' | 'medium' | 'low';
export type ScanSourceType = 'shopping_list' | 'recipe' | 'other';

export interface ScanItem {
  raw: string;
  name: string;
  count: number;
  unit: ScanUnit;
  note: string;
  confidence: ScanConfidence;
}

export interface ScanResult {
  requestId: string;
  sourceType: ScanSourceType;
  legible: boolean;
  title: string;
  items: ScanItem[];
  warnings: string[];
}

const MAX_ITEMS = 60;

function cleanString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/**
 * Validates and sanitizes the JSON coming back from /api/scan. Returns null
 * when the payload is not a successful v1 scan result at all; individual bad
 * items are dropped instead of failing the whole scan.
 */
export function parseScanResult(json: unknown): ScanResult | null {
  if (!json || typeof json !== 'object') return null;
  const data = json as Record<string, unknown>;
  if (data.ok !== true || data.version !== 1 || !Array.isArray(data.items)) return null;

  const items: ScanItem[] = [];
  for (const raw of data.items.slice(0, MAX_ITEMS)) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as Record<string, unknown>;
    const name = cleanString(it.name, 80);
    if (!name) continue;
    const count = typeof it.count === 'number' && Number.isInteger(it.count) && it.count > 0 && it.count <= 999 ? it.count : 0;
    const unit = (SCAN_UNITS as readonly string[]).includes(it.unit as string) ? (it.unit as ScanUnit) : '';
    const confidence: ScanConfidence =
      it.confidence === 'high' || it.confidence === 'low' ? it.confidence : 'medium';
    items.push({ raw: cleanString(it.raw, 120), name, count, unit, note: cleanString(it.note, 40), confidence });
  }

  const sourceType: ScanSourceType =
    data.sourceType === 'shopping_list' || data.sourceType === 'recipe' ? data.sourceType : 'other';

  return {
    requestId: cleanString(data.requestId, 64),
    sourceType,
    legible: data.legible !== false,
    title: cleanString(data.title, 80),
    items,
    warnings: Array.isArray(data.warnings) ? data.warnings.map((w) => cleanString(w, 200)).filter(Boolean).slice(0, 5) : [],
  };
}
