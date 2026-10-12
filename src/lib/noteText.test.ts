import { describe, expect, it } from 'vitest';
import { linesToItems } from '@/lib/checklistPaste';
import { checklistToContent, noteToShareText } from '@/lib/noteText';

describe('checklistToContent', () => {
  it('round-trips with linesToItems', () => {
    const items = [
      { text: 'Milch', is_completed: false, order: 0 },
      { text: 'Brot', is_completed: true, order: 1 },
      { text: 'Eier', is_completed: false, order: 2 },
    ];
    const content = checklistToContent(items);
    expect(content).toBe('- [ ] Milch\n- [ ] Eier\n- [x] Brot');
    expect(linesToItems(content)).toEqual([
      { text: 'Milch', done: false },
      { text: 'Eier', done: false },
      { text: 'Brot', done: true },
    ]);
    expect(linesToItems('Nur eine Zeile')).toEqual([{ text: 'Nur eine Zeile', done: false }]);
  });
});

describe('noteToShareText', () => {
  it('formats checklists with boxes, open items first', () => {
    expect(
      noteToShareText('Einkauf', '', [
        { text: 'Brot', is_completed: true, order: 0 },
        { text: '4 Milch', is_completed: false, order: 1 },
      ])
    ).toBe('Einkauf\n\n☐ 4 Milch\n☑ Brot');
  });

  it('uses the content for text notes and skips an empty title', () => {
    expect(noteToShareText('  ', 'Hallo\nWelt', null)).toBe('Hallo\nWelt');
  });
});
