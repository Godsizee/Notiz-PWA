import { describe, expect, it } from 'vitest';
import { continueListOnEnter, toggleBold, toggleLineMarker } from '@/lib/textFormat';

describe('toggleLineMarker', () => {
  it('adds a checkbox to the current line and keeps the cursor on the text', () => {
    const r = toggleLineMarker('Milch', 5, 5, 'checkbox');
    expect(r.value).toBe('- [ ] Milch');
    expect(r.start).toBe(11);
  });

  it('toggles an existing marker off and switches between bullet and checkbox', () => {
    expect(toggleLineMarker('- Milch', 7, 7, 'bullet').value).toBe('Milch');
    expect(toggleLineMarker('- [x] Milch', 11, 11, 'checkbox').value).toBe('Milch');
    expect(toggleLineMarker('- Milch', 7, 7, 'checkbox').value).toBe('- [ ] Milch');
    expect(toggleLineMarker('- [ ] Milch', 11, 11, 'bullet').value).toBe('- Milch');
  });

  it('only touches the lines in the selection and skips empty ones', () => {
    const value = 'Kopf\nA\n\nB\nSchluss';
    const r = toggleLineMarker(value, value.indexOf('A'), value.indexOf('B') + 1, 'bullet');
    expect(r.value).toBe('Kopf\n- A\n\n- B\nSchluss');
  });

  it('works on the line of the cursor in the middle of a text', () => {
    expect(toggleLineMarker('eins\nzwei\ndrei', 7, 7, 'bullet').value).toBe('eins\n- zwei\ndrei');
  });
});

describe('toggleBold', () => {
  it('wraps a selection and unwraps it again', () => {
    const wrapped = toggleBold('Milch kaufen', 0, 5);
    expect(wrapped.value).toBe('**Milch** kaufen');
    expect([wrapped.start, wrapped.end]).toEqual([2, 7]);
    expect(toggleBold(wrapped.value, wrapped.start, wrapped.end).value).toBe('Milch kaufen');
  });

  it('puts the cursor between the stars when nothing is selected', () => {
    const r = toggleBold('ab', 1, 1);
    expect(r.value).toBe('a****b');
    expect(r.start).toBe(3);
  });
});

describe('continueListOnEnter', () => {
  it('continues a checkbox line with an open checkbox', () => {
    const r = continueListOnEnter('- [ ] Milch', 11);
    expect(r?.value).toBe('- [ ] Milch\n- [ ] ');
    expect(r?.start).toBe(18);
    expect(continueListOnEnter('- [x] Milch', 11)?.value).toBe('- [x] Milch\n- [ ] ');
  });

  it('continues a bullet line, also in the middle of a text', () => {
    expect(continueListOnEnter('- Milch', 7)?.value).toBe('- Milch\n- ');
    expect(continueListOnEnter('- Milch\nBrot', 7)?.value).toBe('- Milch\n- \nBrot');
  });

  it('removes the marker on Enter in an empty marker line', () => {
    const r = continueListOnEnter('- [ ] Milch\n- [ ] ', 18);
    expect(r?.value).toBe('- [ ] Milch\n');
    expect(r?.start).toBe(12);
  });

  it('leaves normal lines alone', () => {
    expect(continueListOnEnter('Milch', 5)).toBeNull();
    expect(continueListOnEnter('Text - mit Strich', 17)).toBeNull();
  });
});
