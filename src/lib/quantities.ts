// Mengen-Badge am Zeilenanfang ("2 Packungen Mehl" → Badge "2 Packungen", Text "Mehl").
//
// Die Einheitenliste muss jede Einheit kennen, die src/lib/scan/format.ts
// schreiben kann — sonst zeigt der Badge bei gescannten Einträgen nur die Zahl.
// Vorher stand hier `packung[en]?`: eine Zeichenklasse, die genau EIN Zeichen
// erlaubt, weshalb "2 Packungen Mehl" nur den Badge "2" bekam.
const UNITS = [
  'x', 'g', 'kg', 'l', 'liter', 'ml', 'stk', 'stck', 'stück', 'pkg', 'pck',
  'packung(?:en)?', 'flasche(?:n)?', 'dose(?:n)?', 'becher', 'glas', 'gläser',
  'bund', 'beutel', 'tüte(?:n)?', 'netz(?:e)?', 'tafel(?:n)?', 'würfel',
  'knolle(?:n)?', 'kopf', 'köpfe', 'schale(?:n)?',
].join('|');

export const QUANTITY_REGEX = new RegExp(`^(\\d+(?:[.,]\\d+)?\\s*(?:${UNITS})?)(?:\\s+(.+))$`, 'i');

export interface ParsedQuantity {
  quantity: string | null;
  text: string;
}

export function parseQuantity(text: string): ParsedQuantity {
  if (!text) return { quantity: null, text: '' };
  const match = text.match(QUANTITY_REGEX);
  if (match) {
    return {
      quantity: match[1].trim(),
      text: match[2].trim(),
    };
  }
  return { quantity: null, text };
}
