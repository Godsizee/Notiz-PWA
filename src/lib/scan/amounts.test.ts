import { describe, expect, it } from 'vitest';
import { addEntryAmounts, parseEntry } from '@/lib/scan/amounts';

const sum = (a: string, b: string) => {
  const r = addEntryAmounts(a, b);
  return r ? `${r.total} ${r.existingRest}` : null;
};

describe('parseEntry', () => {
  it('liest Zahl, Einheit und Rest', () => {
    expect(parseEntry('2 Pommes')).toMatchObject({ amount: { value: 2, cls: 'piece', explicit: true }, rest: 'Pommes' });
    expect(parseEntry('2x Pommes')).toMatchObject({ amount: { value: 2, unit: 'x' }, rest: 'Pommes' });
    expect(parseEntry('500g Mehl')).toMatchObject({ amount: { value: 500, cls: 'g' }, rest: 'Mehl' });
    expect(parseEntry('1,5 kg Mehl')).toMatchObject({ amount: { value: 1500, cls: 'g' }, rest: 'Mehl' });
    expect(parseEntry('3 Packungen Nudeln')).toMatchObject({ amount: { value: 3, cls: 'packung' }, rest: 'Nudeln' });
  });

  it('zaehlt einen Eintrag ohne Zahl als 1 Stueck', () => {
    expect(parseEntry('Pommes')).toEqual({ amount: { value: 1, cls: 'piece', unit: '', explicit: false }, rest: 'Pommes' });
    // Zahlen mitten im Text sind keine Menge
    expect(parseEntry('Vitamin B12').amount?.value).toBe(1);
  });

  it('haelt "3 Gurken" nicht fuer "3 g Urken" und liest Bereiche nicht als Menge', () => {
    expect(parseEntry('3 Gurken')).toMatchObject({ amount: { value: 3, cls: 'piece' }, rest: 'Gurken' });
    expect(parseEntry('2-3 Bananen').amount).toBeNull();
    expect(parseEntry('18er Eier').amount).toBeNull();
    expect(parseEntry('4. Hähnchenwurst C').amount).toBeNull();
  });
});

describe('addEntryAmounts', () => {
  it('Eintraege ohne Menge zaehlen als 1', () => {
    expect(sum('Pommes', 'Pommes')).toBe('2 Pommes');
    expect(sum('Pommes', '3 Pommes')).toBe('4 Pommes');
    expect(sum('2 Pommes', 'Pommes')).toBe('3 Pommes');
  });

  it('addiert Zahlen', () => {
    expect(sum('2 Pommes', '3 Pommes')).toBe('5 Pommes');
    expect(sum('2x Pommes', '3 Pommes')).toBe('5x Pommes');
  });

  it('addiert Gewicht und Volumen ueber g/kg und ml/l', () => {
    expect(sum('500 g Mehl', '250 g Mehl')).toBe('750 g Mehl');
    expect(sum('500 g Mehl', '1 kg Mehl')).toBe('1,5 kg Mehl');
    expect(sum('0,5 l Milch', '500 ml Milch')).toBe('1 l Milch');
  });

  it('beugt Packungsarten und behaelt die Schreibweise', () => {
    expect(sum('1 Packung Mehl', '1 Packung Mehl')).toBe('2 Packungen Mehl');
    expect(sum('2 Dosen Mais', '3 Dose Mais')).toBe('5 Dosen Mais');
    expect(sum('2 packungen Mehl', '1 Packung Mehl')).toBe('3 packungen Mehl');
  });

  it('addiert nicht, was nicht zusammenpasst', () => {
    expect(sum('Mehl', '2 Packungen Mehl')).toBeNull(); // Stueck gegen Packungen
    expect(sum('500 g Mehl', '2 Packungen Mehl')).toBeNull();
    expect(sum('2-3 Bananen', 'Bananen')).toBeNull();
    expect(sum('Bananen', '18er Bananen')).toBeNull();
    expect(sum('2', 'Pommes')).toBeNull(); // vorhandener Eintrag ohne Namen
  });

  it('behaelt Zusaetze des vorhandenen Eintrags', () => {
    expect(sum('Karotten (500 g)', 'Karotten')).toBe('2 Karotten (500 g)');
  });
});
