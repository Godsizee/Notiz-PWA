import { describe, expect, it } from 'vitest';
import type { RecordModel } from 'pocketbase';
import { adoptCreatedId, buildNoteUrl, parseNoteRoute, resolveSession, restartSession, type SessionState } from '@/lib/noteRoute';

const note = (id: string, type = 'checklist') => ({ id, type, collectionId: 'c', collectionName: 'notes' }) as RecordModel;
const keys = () => {
  let n = 0;
  return () => `k${++n}`;
};
const closed: SessionState = { status: 'closed' };

describe('parseNoteRoute / buildNoteUrl', () => {
  it.each([
    ['?note=abcdefghij12345', { kind: 'note', id: 'abcdefghij12345' }],
    ['?new=checklist', { kind: 'new', type: 'checklist' }],
    ['?new=text', { kind: 'new', type: 'text' }],
    ['', { kind: 'home' }],
    ['?note=../../etc', { kind: 'home' }],
    ['?new=bild', { kind: 'home' }],
    ['?note=abcdefghij12345&new=text', { kind: 'note', id: 'abcdefghij12345' }],
  ])('%s', (search, expected) => {
    expect(parseNoteRoute(new URLSearchParams(search))).toEqual(expected);
  });

  it('round-trips', () => {
    expect(buildNoteUrl({ kind: 'note', id: 'abcdefghij12345' })).toBe('/?note=abcdefghij12345');
    expect(buildNoteUrl({ kind: 'new', type: 'text' })).toBe('/?new=text');
    expect(buildNoteUrl({ kind: 'home' })).toBe('/');
  });
});

describe('resolveSession', () => {
  it('opens an existing note once the list is loaded', () => {
    const makeKey = keys();
    const loading = resolveSession(closed, { kind: 'note', id: 'aaaaaaaaaaaaaaa' }, null, makeKey);
    expect(loading).toEqual({ status: 'loading', id: 'aaaaaaaaaaaaaaa' });
    const open = resolveSession(loading, { kind: 'note', id: 'aaaaaaaaaaaaaaa' }, [note('aaaaaaaaaaaaaaa')], makeKey);
    expect(open).toMatchObject({ status: 'open', session: { key: 'k1', type: 'checklist', id: 'aaaaaaaaaaaaaaa' } });
  });

  it('reports a missing note instead of opening an empty editor', () => {
    expect(resolveSession(closed, { kind: 'note', id: 'zzzzzzzzzzzzzzz' }, [note('aaaaaaaaaaaaaaa')], keys()))
      .toEqual({ status: 'missing', id: 'zzzzzzzzzzzzzzz' });
  });

  it('keeps the editor key when a new note gets its id (no remount)', () => {
    const makeKey = keys();
    const fresh = resolveSession(closed, { kind: 'new', type: 'checklist' }, [], makeKey);
    expect(fresh).toMatchObject({ status: 'open', session: { key: 'k1', note: null, id: null } });
    const adopted = adoptCreatedId(fresh, 'bbbbbbbbbbbbbbb');
    // Die Notiz taucht per lokalem Echo schon in der Liste auf — trotzdem derselbe Editor.
    const after = resolveSession(adopted, { kind: 'note', id: 'bbbbbbbbbbbbbbb' }, [note('bbbbbbbbbbbbbbb')], makeKey);
    expect(after).toBe(adopted);
  });

  it('returns the same object when nothing changed (no extra renders)', () => {
    const makeKey = keys();
    const open = resolveSession(closed, { kind: 'note', id: 'aaaaaaaaaaaaaaa' }, [note('aaaaaaaaaaaaaaa')], makeKey);
    expect(resolveSession(open, { kind: 'note', id: 'aaaaaaaaaaaaaaa' }, [note('aaaaaaaaaaaaaaa')], makeKey)).toBe(open);
    expect(resolveSession(closed, { kind: 'home' }, [], makeKey)).toBe(closed);
  });

  it('restarts the editor with the new type after a conversion', () => {
    const makeKey = keys();
    const open = resolveSession(closed, { kind: 'note', id: 'aaaaaaaaaaaaaaa' }, [note('aaaaaaaaaaaaaaa')], makeKey);
    const converted = restartSession(note('aaaaaaaaaaaaaaa', 'text'), makeKey);
    expect(converted).toMatchObject({ status: 'open', session: { key: 'k2', type: 'text', id: 'aaaaaaaaaaaaaaa' } });
    // Danach haelt resolveSession die neue Sitzung (gleiche ID), statt zurueckzuspringen.
    expect(resolveSession(converted, { kind: 'note', id: 'aaaaaaaaaaaaaaa' }, [note('aaaaaaaaaaaaaaa')], makeKey)).toBe(converted);
    expect(open).not.toBe(converted);
  });

  it('switches editors when another note is opened', () => {
    const makeKey = keys();
    const a = resolveSession(closed, { kind: 'note', id: 'aaaaaaaaaaaaaaa' }, [note('aaaaaaaaaaaaaaa'), note('ccccccccccccccc', 'text')], makeKey);
    const c = resolveSession(a, { kind: 'note', id: 'ccccccccccccccc' }, [note('aaaaaaaaaaaaaaa'), note('ccccccccccccccc', 'text')], makeKey);
    expect(c).toMatchObject({ status: 'open', session: { key: 'k2', type: 'text', id: 'ccccccccccccccc' } });
  });
});
