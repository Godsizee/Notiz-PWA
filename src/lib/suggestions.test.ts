import { describe, expect, it } from 'vitest';
import { rankSuggestions } from '@/lib/suggestions';

describe('rankSuggestions', () => {
  const history = [
    { text: '2 Milch', updated: '2026-10-01' },
    { text: 'Milch', updated: '2026-10-10' },
    { text: 'Mandelmilch', updated: '2026-10-11' },
    { text: 'Mehl', updated: '2026-09-01' },
    { text: 'Milchreis', updated: '2026-08-01' },
  ];

  it('ranks by frequency, then recency, and keeps the typed quantity', () => {
    expect(rankSuggestions('mi', history, new Set())).toEqual(['Milch', 'Milchreis']);
    expect(rankSuggestions('2 Mi', history, new Set())).toEqual(['2 Milch', '2 Milchreis']);
  });

  it('skips items already open on this list and exact matches', () => {
    expect(rankSuggestions('mi', history, new Set(['milch']))).toEqual(['Milchreis']);
    expect(rankSuggestions('Milch', history, new Set())).toEqual(['Milchreis']);
  });

  it('needs at least two characters', () => {
    expect(rankSuggestions('m', history, new Set())).toEqual([]);
  });

  it('folds umlauts', () => {
    expect(rankSuggestions('Ae', [{ text: 'Äpfel' }], new Set())).toEqual(['Äpfel']);
  });
});
