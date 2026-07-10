export const QUANTITY_REGEX = /^(\d+(?:[.,]\d+)?\s*(?:x|X|g|kg|l|liter|ml|stk|stck|pkg|flasche[n]?|dose[n]?|packung[en]?)?)(?:\s+(.+))$/i;

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
