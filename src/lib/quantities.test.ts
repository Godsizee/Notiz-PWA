import { describe, expect, it } from 'vitest';
import { parseQuantity } from '@/lib/quantities';

const split = (text: string) => {
  const { quantity, text: rest } = parseQuantity(text);
  return [quantity, rest];
};

describe('parseQuantity', () => {
  it.each([
    ['2 Packungen Mehl', '2 Packungen', 'Mehl'],
    ['1 Packung Mehl', '1 Packung', 'Mehl'],
    ['1 Becher Sahne', '1 Becher', 'Sahne'],
    ['1 Glas Honig', '1 Glas', 'Honig'],
    ['2 Gläser Honig', '2 Gläser', 'Honig'],
    ['1 Bund Petersilie', '1 Bund', 'Petersilie'],
    ['2 Tüten Milch', '2 Tüten', 'Milch'],
    ['1 Kopf Salat', '1 Kopf', 'Salat'],
    ['2 Köpfe Salat', '2 Köpfe', 'Salat'],
    ['1 Würfel Hefe', '1 Würfel', 'Hefe'],
    ['500g Mehl', '500g', 'Mehl'],
    ['1,5 kg Kartoffeln', '1,5 kg', 'Kartoffeln'],
    ['1 liter Milch', '1 liter', 'Milch'],
    ['2x Milch', '2x', 'Milch'],
    ['3 Zwiebeln', '3', 'Zwiebeln'],
  ])('%s → [%s] %s', (input, quantity, text) => {
    expect(split(input)).toEqual([quantity, text]);
  });

  it('does not treat a word that merely starts like a unit as the unit', () => {
    expect(split('2 Becherlupen')).toEqual(['2', 'Becherlupen']);
    expect(split('1 Bundesliga-Ticket')).toEqual(['1', 'Bundesliga-Ticket']);
  });

  it('leaves entries without a leading quantity alone', () => {
    expect(split('Backpulver')).toEqual([null, 'Backpulver']);
    expect(split('7Up')).toEqual([null, '7Up']);
    expect(split('')).toEqual([null, '']);
  });
});
