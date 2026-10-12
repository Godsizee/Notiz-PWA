import { describe, expect, it } from 'vitest';
import { parseQuantity } from '@/lib/quantities';
import { formatItemText, itemKey, planMerge, sameItem } from '@/lib/scan/merge';
import { parseScanResult, type ScanItem } from '@/lib/scan/result';

const item = (patch: Partial<ScanItem>): ScanItem => ({
  raw: '', name: 'X', count: 0, unit: '', note: '', confidence: 'high', ...patch,
});

describe('formatItemText', () => {
  it.each([
    [{ name: 'Mehl', count: 1, unit: 'Packung' }, '1 Packung Mehl'],
    [{ name: 'Mehl', count: 2, unit: 'Packung' }, '2 Packungen Mehl'],
    [{ name: 'Sahne', count: 2, unit: 'Becher' }, '2 Becher Sahne'],
    [{ name: 'Honig', count: 2, unit: 'Glas' }, '2 Gläser Honig'],
    [{ name: 'Backpulver' }, 'Backpulver'],
    [{ name: 'Backpulver', unit: 'Packung' }, 'Backpulver'],
    [{ name: 'Eier', count: 3 }, '3 Eier'],
    [{ name: 'Karotten', note: '500 g' }, 'Karotten (500 g)'],
    [{ name: 'Hackfleisch', count: 1, unit: 'Packung', note: '300 g' }, '1 Packung Hackfleisch (300 g)'],
  ] as [Partial<ScanItem>, string][])('%o → %s', (patch, expected) => {
    expect(formatItemText(item(patch))).toBe(expected);
  });

  // Jede Einheit, die der Formatter schreibt, muss der Mengen-Badge erkennen —
  // sonst zeigt die Liste bei "2 Packungen Mehl" nur "2" als Badge.
  it.each([
    '2 Packungen Mehl', '2 Gläser Honig', '3 Tafeln Schokolade', '2 Netze Zwiebeln',
    '2 Knollen Knoblauch', '2 Schalen Erdbeeren', '2 Flaschen Öl', '2 Dosen Mais',
    '2 Beutel Reis', '2 Stück Ingwer', '2 Becher Sahne', '2 Köpfe Salat',
  ])('badge covers the unit in "%s"', (text) => {
    expect(parseQuantity(text).quantity).toBe(text.split(' ').slice(0, 2).join(' '));
  });
});

describe('itemKey / sameItem', () => {
  it('strips quantity, notes, case and umlauts', () => {
    expect(itemKey('2 Packungen Mehl')).toBe('mehl');
    expect(itemKey('Karotten (500 g)')).toBe('karotten');
    expect(itemKey('Äpfel')).toBe('aepfel');
  });

  it('treats short plural endings as the same item', () => {
    expect(sameItem('zwiebel', 'zwiebeln')).toBe(true);
    expect(sameItem('tomate', 'tomaten')).toBe(true);
  });

  it('does not merge different products', () => {
    expect(sameItem('milch', 'milchreis')).toBe(false);
    expect(sameItem('ei', 'eier')).toBe(false);
    expect(sameItem('', '')).toBe(false);
  });
});

describe('planMerge', () => {
  it('proposes add / skip / reopen against the current list', () => {
    const rows = planMerge(
      [
        item({ name: 'Mehl', count: 1, unit: 'Packung' }),
        item({ name: 'Zwiebeln', count: 2 }),
        item({ name: 'Backpulver' }),
        item({ name: 'Mehl', count: 1, unit: 'Packung' }),
        item({ name: 'Zimtstangen', confidence: 'low' }),
        item({ name: 'Eier', count: 6 }),
      ],
      [
        { id: 'a', text: '1 Zwiebel', is_completed: false },
        { id: 'b', text: 'Backpulver', is_completed: true },
        { id: 'c', text: '10 Eier', is_completed: false },
      ]
    );

    expect(rows.map((r) => [r.text, r.action, r.selected, r.reason ?? null, r.targetId ?? null])).toEqual([
      ['1 Packung Mehl', 'add', true, null, null],
      ['2 Zwiebeln', 'add', false, 'duplicate_open', null],
      ['Backpulver', 'reopen', true, 'reopen_completed', 'b'],
      ['1 Packung Mehl', 'add', false, 'duplicate_scan', null],
      ['Zimtstangen', 'add', true, 'low_confidence', null],
      ['6 Eier', 'add', false, 'duplicate_open', null],
    ]);
  });

  it('reopens one completed item only once', () => {
    const rows = planMerge(
      [item({ name: 'Milch' }), item({ name: 'Milch', count: 2 })],
      [{ id: 'm', text: 'Milch', is_completed: true }]
    );
    expect(rows.filter((r) => r.action === 'reopen')).toHaveLength(1);
  });
});

describe('parseScanResult', () => {
  it('rejects anything that is not a successful v1 result', () => {
    expect(parseScanResult(null)).toBeNull();
    expect(parseScanResult({ ok: false, version: 1, error: 'llm_unavailable' })).toBeNull();
    expect(parseScanResult({ ok: true, version: 2, items: [] })).toBeNull();
  });

  it('drops broken items instead of failing the whole scan', () => {
    const parsed = parseScanResult({
      ok: true, version: 1, requestId: 'scan_1', sourceType: 'recipe', legible: true, title: ' Apfelkuchen ',
      items: [
        { raw: '500 g Mehl', name: 'Mehl', count: 1, unit: 'Packung', note: '', confidence: 'high' },
        { raw: '??', name: '   ', count: 1, unit: 'Packung', note: '', confidence: 'high' },
        { raw: 'x', name: 'Butter', count: 2.5, unit: 'Kiste', note: 5, confidence: 'sure' },
        null,
      ],
      warnings: ['  ', 'Teilweise unscharf'],
    });

    expect(parsed).toEqual({
      requestId: 'scan_1', sourceType: 'recipe', legible: true, title: 'Apfelkuchen',
      items: [
        { raw: '500 g Mehl', name: 'Mehl', count: 1, unit: 'Packung', note: '', confidence: 'high' },
        { raw: 'x', name: 'Butter', count: 0, unit: '', note: '', confidence: 'medium' },
      ],
      warnings: ['Teilweise unscharf'],
    });
  });

  it('caps the number of items', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ raw: '', name: `Artikel ${i}`, count: 0, unit: '', note: '', confidence: 'high' }));
    expect(parseScanResult({ ok: true, version: 1, items: many })?.items).toHaveLength(60);
  });
});
