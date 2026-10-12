import { describe, expect, it } from 'vitest';
import { splitPastedItems } from '@/lib/checklistPaste';

describe('splitPastedItems', () => {
  it('returns null for a single line (normal typing)', () => {
    expect(splitPastedItems('Milch')).toBeNull();
    expect(splitPastedItems('Milch\n\n  ')).toBeNull();
  });

  it('splits bullets, markdown checkboxes and unicode boxes', () => {
    expect(splitPastedItems('- Milch\n• Brot\n- [x] Butter\n☑ Eier\n☐ Käse\n* 2 Äpfel')).toEqual([
      { text: 'Milch', done: false },
      { text: 'Brot', done: false },
      { text: 'Butter', done: true },
      { text: 'Eier', done: true },
      { text: 'Käse', done: false },
      { text: '2 Äpfel', done: false },
    ]);
  });

  it('strips numbering only for a real 1., 2., 3. list', () => {
    expect(splitPastedItems('1. Milch\n2. Brot\n3) Eier')?.map((i) => i.text)).toEqual(['Milch', 'Brot', 'Eier']);
    expect(splitPastedItems('2 Hähnchenwurst B\n4. Hähnchenwurst C')?.map((i) => i.text)).toEqual([
      '2 Hähnchenwurst B',
      '4. Hähnchenwurst C',
    ]);
  });
});
