import { RecordModel } from 'pocketbase';
import { pb } from '@/lib/pb';
import { cacheGetAll, CachedRecord, SyncCollection } from '@/lib/offlineDb';
import { imageOriginalUrl } from '@/lib/noteImages';

// Client-seitiges Backup (Scope v1.2 Stufe 2): alle sichtbaren Notizen samt
// Checklist-Items als JSON oder Markdown herunterladen. Offline wird auf den
// IndexedDB-Snapshot zurückgegriffen.
//
// Bilder werden als URL referenziert, nicht als Base64 eingebettet: ein Backup
// soll eine kleine Textdatei bleiben, die man sich ansehen kann. Ein Export,
// der die Binärdaten enthielte, wäre schnell dreistellig in MB.

export type ExportFormat = 'json' | 'markdown';

interface ExportImage {
  filename: string;
  url: string;
  width: number;
  height: number;
}

interface ExportNote {
  id: string;
  title: string;
  type: string;
  content: string;
  color: string;
  is_pinned: boolean;
  is_archived: boolean;
  is_shared: boolean;
  created: string;
  updated: string;
  items: { text: string; is_completed: boolean }[];
  images: ExportImage[];
}

async function fetchAll(collection: SyncCollection): Promise<CachedRecord[]> {
  try {
    return await pb.collection(collection).getFullList({ requestKey: null });
  } catch {
    return cacheGetAll(collection).catch(() => []);
  }
}

function groupByNote(records: CachedRecord[]): Map<string, CachedRecord[]> {
  const map = new Map<string, CachedRecord[]>();
  for (const record of records) {
    const noteId = String(record.note || '');
    if (!map.has(noteId)) map.set(noteId, []);
    map.get(noteId)!.push(record);
  }
  return map;
}

const byOrder = (a: CachedRecord, b: CachedRecord) => Number(a.order ?? 0) - Number(b.order ?? 0);

async function collectNotes(): Promise<ExportNote[]> {
  const [notes, items, images] = await Promise.all([
    fetchAll('notes'),
    fetchAll('checklist_items'),
    fetchAll('note_images'),
  ]);

  const itemsByNote = groupByNote(items);
  const imagesByNote = groupByNote(images);

  return notes
    .sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')))
    .map((n) => ({
      id: n.id,
      title: String(n.title || ''),
      type: String(n.type || 'text'),
      content: String(n.content || ''),
      color: String(n.color || 'white'),
      is_pinned: !!n.is_pinned,
      is_archived: !!n.is_archived,
      is_shared: !!n.is_shared,
      created: String(n.created || ''),
      updated: String(n.updated || ''),
      items: (itemsByNote.get(n.id) || [])
        .sort(byOrder)
        .map((i) => ({ text: String(i.text || ''), is_completed: !!i.is_completed })),
      images: (imagesByNote.get(n.id) || [])
        .sort(byOrder)
        .map((img) => ({
          filename: String(img.file || ''),
          url: imageOriginalUrl(img as unknown as RecordModel) || '',
          width: Number(img.width ?? 0),
          height: Number(img.height ?? 0),
        }))
        .filter((img) => img.filename),
    }));
}

function toMarkdown(notes: ExportNote[]): string {
  const lines: string[] = ['# B&B Notes – Backup', '', `> Exportiert am ${new Date().toLocaleString('de-DE')}`, ''];
  for (const n of notes) {
    lines.push(`## ${n.title || (n.type === 'checklist' ? 'Unbenannte Liste' : 'Unbenannte Notiz')}`);
    const flags = [
      n.is_pinned && 'angepinnt',
      n.is_archived && 'archiviert',
      n.is_shared && 'geteilt',
    ].filter(Boolean);
    if (flags.length) lines.push(`*${flags.join(' · ')}*`);
    lines.push('');
    for (const image of n.images) {
      if (image.url) lines.push(`![${image.filename}](${image.url})`);
    }
    if (n.images.length > 0) lines.push('');
    if (n.type === 'checklist') {
      for (const item of n.items) lines.push(`- [${item.is_completed ? 'x' : ' '}] ${item.text}`);
      if (n.items.length === 0) lines.push('*Leere Checkliste*');
    } else {
      lines.push(n.content || '*Leere Notiz*');
    }
    lines.push('');
  }
  return lines.join('\n');
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Lädt alle Notizen als Datei herunter; wirft bei leerem Ergebnis nicht. */
export async function exportNotes(format: ExportFormat): Promise<number> {
  const notes = await collectNotes();
  const date = new Date().toISOString().slice(0, 10);

  if (format === 'json') {
    const payload = { app: 'B&B Notes', exportedAt: new Date().toISOString(), notes };
    download(`bb-notes-backup-${date}.json`, JSON.stringify(payload, null, 2), 'application/json');
  } else {
    download(`bb-notes-backup-${date}.md`, toMarkdown(notes), 'text/markdown');
  }
  return notes.length;
}
