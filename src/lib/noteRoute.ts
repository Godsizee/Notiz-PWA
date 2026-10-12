import type { RecordModel } from 'pocketbase';

// URL-Zustand der Vollbild-Notiz. Bewusst Query-Parameter auf "/" statt einer
// eigenen Route /notiz/[id]:
//  - "/" ist precached (src/app/sw.ts) — eine dynamische Route waere offline
//    nach einem Reload nicht erreichbar.
//  - Die Uebersicht bleibt darunter gemountet: Scrollposition, Realtime-Abos
//    und die Morph-Animation von der Karte bleiben erhalten.
//  - Zurueck-Geste/-Taste des Systems schliessen die Notiz (popstate), statt
//    die App zu verlassen.
//
//   /?note=<id>          bestehende Notiz
//   /?new=text|checklist neue Notiz (wird nach dem ersten Speichern durch
//                        ?note=<id> ersetzt, ohne neuen History-Eintrag)

export type NoteType = 'text' | 'checklist';

export type NoteRoute =
  | { kind: 'home' }
  | { kind: 'note'; id: string }
  | { kind: 'new'; type: NoteType };

/** PocketBase-IDs (auch die clientseitigen aus newRecordId): 15 Zeichen a-z0-9. */
const RECORD_ID = /^[a-z0-9]{15}$/;

export function parseNoteRoute(params: Pick<URLSearchParams, 'get'>): NoteRoute {
  const id = params.get('note');
  if (id && RECORD_ID.test(id)) return { kind: 'note', id };
  const type = params.get('new');
  if (type === 'text' || type === 'checklist') return { kind: 'new', type };
  return { kind: 'home' };
}

export function buildNoteUrl(route: NoteRoute): string {
  if (route.kind === 'note') return `/?note=${route.id}`;
  if (route.kind === 'new') return `/?new=${route.type}`;
  return '/';
}

export interface EditorSession {
  /**
   * Stabiler React-key des Editors. Bleibt gleich, wenn eine neue Notiz beim
   * ersten Speichern ihre ID bekommt — ein Remount wuerde den Editor-Zustand
   * verwerfen und die Ghost-Note-Bereinigung beim Unmount ausloesen.
   */
  key: string;
  type: NoteType;
  /** Record beim Oeffnen; null fuer eine neue Notiz. */
  note: RecordModel | null;
  /** ID der Notiz; bei neuen Notizen erst nach dem ersten Speichern gesetzt. */
  id: string | null;
}

export type SessionState =
  | { status: 'closed' }
  | { status: 'open'; session: EditorSession }
  /** Deep-Link/Reload: die Notizliste ist noch nicht geladen. */
  | { status: 'loading'; id: string }
  /** Liste geladen, aber keine Notiz mit dieser ID (geloescht, nicht geteilt). */
  | { status: 'missing'; id: string };

/**
 * Leitet aus URL und Notizliste ab, welcher Editor offen ist. `notes` ist null,
 * solange die Liste noch laedt. Rein und deterministisch, damit die heiklen
 * Faelle (neue Notiz bekommt ID, Deep-Link vor dem Laden) testbar sind.
 */
export function resolveSession(
  current: SessionState,
  route: NoteRoute,
  notes: readonly RecordModel[] | null,
  makeKey: () => string
): SessionState {
  if (route.kind === 'home') return current.status === 'closed' ? current : { status: 'closed' };

  if (route.kind === 'new') {
    if (current.status === 'open' && current.session.note === null && current.session.type === route.type) {
      return current;
    }
    return { status: 'open', session: { key: makeKey(), type: route.type, note: null, id: null } };
  }

  if (current.status === 'open' && current.session.id === route.id) return current;
  if (notes === null) {
    return current.status === 'loading' && current.id === route.id ? current : { status: 'loading', id: route.id };
  }
  const note = notes.find((n) => n.id === route.id);
  if (!note) {
    return current.status === 'missing' && current.id === route.id ? current : { status: 'missing', id: route.id };
  }
  const type: NoteType = note.type === 'checklist' ? 'checklist' : 'text';
  return { status: 'open', session: { key: makeKey(), type, note, id: note.id } };
}

/**
 * Nach dem Umwandeln Liste ↔ Textnotiz: anderer Editor fuer dieselbe Notiz.
 * Erzwingt einen neuen key, weil resolveSession bei gleicher ID absichtlich
 * nichts aendert.
 */
export function restartSession(note: RecordModel, makeKey: () => string): SessionState {
  const type: NoteType = note.type === 'checklist' ? 'checklist' : 'text';
  return { status: 'open', session: { key: makeKey(), type, note, id: note.id } };
}

/** Eine neue Notiz wurde gespeichert: ID merken, Editor-key unveraendert lassen. */
export function adoptCreatedId(current: SessionState, id: string): SessionState {
  if (current.status !== 'open' || current.session.id !== null) return current;
  return { status: 'open', session: { ...current.session, id } };
}
