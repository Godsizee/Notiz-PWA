import { describe, expect, it } from 'vitest';
import { parseQuantity } from '@/lib/quantities';
import { existingForScan, formatItemText, itemKey, itemText, planMerge, productKey, sameItem, sameProduct } from '@/lib/scan/merge';
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
  it('proposes add / increase / reopen against the current list', () => {
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
      ['3 Zwiebeln', 'increase', true, 'increase_quantity', 'a'],
      ['Backpulver', 'reopen', true, 'reopen_completed', 'b'],
      ['1 Packung Mehl', 'add', false, 'duplicate_scan', null],
      ['Zimtstangen', 'add', true, 'low_confidence', null],
      ['16 Eier', 'increase', true, 'increase_quantity', 'c'],
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

describe('Einkaufszettel 1:1, Rezepte umgerechnet', () => {
  const milk = item({ raw: '4 Milch', name: 'Milch', count: 4 });
  const bananas = item({ raw: '2-3 Bananen', name: 'Bananen', count: 3, note: '2-3 Stück' });
  const eggs = item({ raw: '18er Eier', name: 'Eier', count: 1, unit: 'Packung', note: '18er' });
  const flour = item({ raw: '500 g Mehl', name: 'Mehl', count: 1, unit: 'Packung' });

  it('uebernimmt Zettel genau wie geschrieben', () => {
    expect(itemText(milk, 'shopping_list')).toBe('4 Milch');
    expect(itemText(bananas, 'shopping_list')).toBe('2-3 Bananen');
    expect(itemText(eggs, 'shopping_list')).toBe('18er Eier');
  });

  it('rechnet Rezepte in Einkaufsmengen um', () => {
    expect(itemText(flour, 'recipe')).toBe('1 Packung Mehl');
    expect(itemText(bananas, 'recipe')).toBe('3 Bananen (2-3 Stück)');
  });

  it('faellt ohne raw auf die formatierte Fassung zurueck', () => {
    expect(itemText(item({ raw: '  ', name: 'Mehl', count: 1, unit: 'Packung' }), 'shopping_list')).toBe('1 Packung Mehl');
  });

  it('behaelt zwei Zeilen mit demselben Produkt auf einem Zettel', () => {
    const rows = planMerge(
      [item({ raw: '2 Hähnchenwurst B', name: 'Hähnchenwurst' }), item({ raw: '4. Hähnchenwurst C', name: 'Hähnchenwurst' })],
      [],
      'shopping_list'
    );
    expect(rows.map((r) => [r.text, r.selected])).toEqual([['2 Hähnchenwurst B', true], ['4. Hähnchenwurst C', true]]);
  });

  it('markiert eine wortgleiche Zeile als doppelt und kennt weiter die offene Liste', () => {
    const rows = planMerge([milk, item({ raw: '4 Milch', name: 'Milch' }), bananas], [{ id: 'b', text: 'Bananen', is_completed: false }], 'shopping_list');
    expect(rows.map((r) => [r.text, r.selected, r.reason ?? null])).toEqual([
      ['4 Milch', true, null],
      ['4 Milch', false, 'duplicate_scan'],
      ['2-3 Bananen', false, 'duplicate_open'],
    ]);
  });
});

describe('productKey / sameProduct', () => {
  it('entfernt Mengenreste, die parseQuantity nicht kennt', () => {
    expect(productKey('2-3 Bananen')).toBe('bananen');
    expect(productKey('18er Eier')).toBe('eier');
    expect(productKey('2 Packungen Mehl')).toBe('mehl');
  });

  it('erkennt Schreibvarianten desselben Produkts', () => {
    expect(sameProduct(productKey('Pommes'), productKey('Pommes frites'))).toBe(true);
    expect(sameProduct(productKey('Milch'), productKey('H-Milch'))).toBe(true);
    expect(sameProduct(productKey('Zwiebel'), productKey('Zwiebeln'))).toBe(true);
    expect(sameProduct(productKey('Eier'), productKey('18er Eier'))).toBe(true);
  });

  it('haelt aehnlich klingende Produkte auseinander', () => {
    expect(sameProduct('milch', 'milchreis')).toBe(false);
    expect(sameProduct('apfel', 'apfelsaft')).toBe(false);
    // ein einzelner Buchstabe ist eine Variante, kein Zusatz
    expect(sameProduct(productKey('2 Hähnchenwurst B'), productKey('4. Hähnchenwurst C'))).toBe(false);
    expect(sameProduct(productKey('Hähnchenwurst'), productKey('Hähnchenwurst B'))).toBe(false);
  });
});

describe('Mengen ergaenzen statt ignorieren', () => {
  const scanned = (raw: string, name: string, extra: Partial<ScanItem> = {}) => item({ raw, name, ...extra });
  const plan = (existing: { id: string; text: string; is_completed: boolean }[], items: ScanItem[]) =>
    planMerge(items, existing, 'shopping_list').map((r) => [r.text, r.action, r.selected, r.reason ?? null, r.targetId ?? null]);

  it('"Pommes" + "Pommes" = "2 Pommes" (ohne Menge zaehlt als 1)', () => {
    expect(plan([{ id: 'p', text: 'Pommes', is_completed: false }], [scanned('Pommes', 'Pommes')])).toEqual([
      ['2 Pommes', 'increase', true, 'increase_quantity', 'p'],
    ]);
  });

  it('"2 Pommes" + "3 Pommes" = "5 Pommes"', () => {
    expect(plan([{ id: 'p', text: '2 Pommes', is_completed: false }], [scanned('3 Pommes', 'Pommes')])).toEqual([
      ['5 Pommes', 'increase', true, 'increase_quantity', 'p'],
    ]);
  });

  it('"Pommes frites" ist dasselbe wie "Pommes" (Wortregel, aelterer Workflow ohne match)', () => {
    expect(plan([{ id: 'p', text: 'Pommes', is_completed: false }], [scanned('Pommes frites', 'Pommes frites')])).toEqual([
      ['2 Pommes', 'increase', true, 'increase_quantity', 'p'],
    ]);
  });

  it('"Pink Lady" ist "Aepfel", wenn das Sprachmodell es zuordnet — der gelesene Name bleibt erhalten', () => {
    expect(
      plan([{ id: 'a', text: 'Äpfel', is_completed: false }], [scanned('Pink Lady', 'Pink Lady', { match: 1, matchId: 'a' })])
    ).toEqual([['2 Äpfel (Pink Lady)', 'increase', true, 'increase_quantity', 'a']]);
    expect(
      plan([{ id: 'a', text: '3 Äpfel', is_completed: false }], [scanned('2 Pink Lady', 'Pink Lady', { match: 1, matchId: 'a' })])
    ).toEqual([['5 Äpfel (Pink Lady)', 'increase', true, 'increase_quantity', 'a']]);
  });

  it('hat das Modell abgeglichen und nichts gefunden (match 0), gilt die Wortregel nicht', () => {
    // Paprika Chips sind keine Paprika — nur das Modell kann das wissen.
    expect(plan([{ id: 'p', text: 'Paprika', is_completed: false }], [scanned('Paprika Chips', 'Paprika Chips', { match: 0 })])).toEqual([
      ['Paprika Chips', 'add', true, null, null],
    ]);
    // Gleicher Name und Mehrzahl zaehlen weiter.
    expect(plan([{ id: 'z', text: 'Zwiebel', is_completed: false }], [scanned('Zwiebeln', 'Zwiebeln', { match: 0 })])).toEqual([
      ['2 Zwiebeln', 'increase', true, 'increase_quantity', 'z'],
    ]);
  });

  it('zwei gelesene Zeilen fuer denselben Listeneintrag: nur die erste zaehlt', () => {
    expect(
      plan(
        [{ id: 'p', text: 'Pommes', is_completed: false }],
        [scanned('Pommes', 'Pommes', { match: 1, matchId: 'p' }), scanned('Frites', 'Frites', { match: 1, matchId: 'p' })]
      )
    ).toEqual([
      ['2 Pommes', 'increase', true, 'increase_quantity', 'p'],
      ['Frites', 'add', false, 'duplicate_scan', null],
    ]);
  });

  it('addiert nicht, wenn die Mengen nicht zusammenpassen — stattdessen "steht schon drauf"', () => {
    expect(plan([{ id: 'm', text: 'Mehl', is_completed: false }], [scanned('2 Packungen Mehl', 'Mehl')])).toEqual([
      ['2 Packungen Mehl', 'add', false, 'duplicate_open', null],
    ]);
    expect(plan([{ id: 'b', text: '2-3 Bananen', is_completed: false }], [scanned('Bananen', 'Bananen')])).toEqual([
      ['Bananen', 'add', false, 'duplicate_open', null],
    ]);
  });

  it('ein abgehakter Eintrag wird wieder aktiviert, nicht aufsummiert', () => {
    expect(plan([{ id: 'p', text: 'Pommes', is_completed: true }], [scanned('3 Pommes', 'Pommes')])).toEqual([
      ['3 Pommes', 'reopen', true, 'reopen_completed', 'p'],
    ]);
  });

  it('bevorzugt den offenen Eintrag vor dem abgehakten', () => {
    const rows = plan(
      [{ id: 'done', text: 'Pommes', is_completed: true }, { id: 'open', text: 'Pommes', is_completed: false }],
      [scanned('Pommes', 'Pommes')]
    );
    expect(rows).toEqual([['2 Pommes', 'increase', true, 'increase_quantity', 'open']]);
  });

  it('Rezept ohne Mengenangabe addiert nichts', () => {
    const rows = planMerge([item({ name: 'Backpulver' })], [{ id: 'b', text: 'Backpulver', is_completed: false }], 'recipe');
    expect(rows.map((r) => [r.text, r.action, r.selected, r.reason ?? null])).toEqual([['Backpulver', 'add', false, 'duplicate_open']]);
  });

  it('ignoriert ein matchId, das nicht mehr auf der Liste steht', () => {
    expect(plan([{ id: 'a', text: 'Äpfel', is_completed: false }], [scanned('Pink Lady', 'Pink Lady', { match: 3, matchId: 'weg' })])).toEqual([
      ['Pink Lady', 'add', true, null, null],
    ]);
  });
});

describe('existingForScan', () => {
  it('schickt offene Eintraege zuerst, ohne leere, hoechstens 150', () => {
    const list = [
      { id: '1', text: 'Erledigt', is_completed: true },
      { id: '2', text: '  ', is_completed: false },
      { id: '3', text: 'Offen', is_completed: false },
    ];
    expect(existingForScan(list).map((e) => e.id)).toEqual(['3', '1']);
    const many = Array.from({ length: 200 }, (_, i) => ({ id: String(i), text: 'x' + i, is_completed: false }));
    expect(existingForScan(many)).toHaveLength(150);
  });
});

describe('parseScanResult: match', () => {
  const payload = (items: unknown[]) => ({ ok: true, version: 1, sourceType: 'shopping_list', items });
  it('liest match, wenn vorhanden, und laesst es sonst weg', () => {
    const parsed = parseScanResult(
      payload([
        { raw: 'Pink Lady', name: 'Pink Lady', count: 0, unit: '', note: '', confidence: 'high', match: 2 },
        { raw: 'Butter', name: 'Butter', count: 0, unit: '', note: '', confidence: 'high', match: 0 },
        { raw: 'Brot', name: 'Brot', count: 0, unit: '', note: '', confidence: 'high' },
        { raw: 'Kaputt', name: 'Kaputt', count: 0, unit: '', note: '', confidence: 'high', match: -4 },
      ])
    );
    expect(parsed?.items.map((i) => i.match)).toEqual([2, 0, undefined, undefined]);
  });
});
