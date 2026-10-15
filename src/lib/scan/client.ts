import { pb } from '@/lib/pb';
import { parseScanResult, type ScanResult } from '@/lib/scan/result';

// Browser-Seite des Foto-Scans. Spricht nur /api/scan auf der eigenen Origin
// an (siehe src/app/api/scan/route.ts) und gibt entweder ein geprueftes
// ScanResult oder einen ScanError mit fertiger deutscher Meldung zurueck.

export class ScanError extends Error {
  constructor(
    /** Maschinenlesbarer Code, z. B. 'offline', 'scan_timeout', 'llm_unavailable'. */
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ScanError';
  }
}

// Etwas laenger als der Server auf n8n wartet (100 s), damit dessen
// Fehlermeldung ankommt, statt dass der Client vorher aufgibt.
const CLIENT_TIMEOUT_MS = 110_000;
// Die Token-Erneuerung ist ein einzelner kurzer Aufruf und zaehlt nicht zum Scan-Budget.
const REFRESH_TIMEOUT_MS = 10_000;
// Gleicher Wortlaut wie die 401-Antwort von /api/scan.
const SESSION_EXPIRED = 'Deine Sitzung ist abgelaufen. Bitte melde dich neu an.';

/** Ein Eintrag der aktuellen Liste, mit dem der Workflow die gelesenen Eintraege abgleicht. */
export interface ScanListEntry {
  text: string;
  done: boolean;
}

// Die App zeigt dank Offline-Cache auch dann Notizen, wenn das Token laengst nicht
// mehr gilt; /api/scan wuerde es dann mit 401 abweisen, obwohl man angemeldet
// aussieht. Deshalb vor dem Scan erneuern: das liefert ein frisches Token (der
// AuthStore schreibt es in Cookie und IndexedDB) oder meldet eine tote Sitzung,
// bevor das Foto hochgeladen wird. Eine Erneuerung, die nur wegen Netz oder
// Zeitueberschreitung scheitert, bricht den Scan nicht ab: dann entscheidet der Server.
async function refreshSession(signal?: AbortSignal): Promise<void> {
  if (!pb.authStore.token) return;
  const timeout = AbortSignal.timeout(REFRESH_TIMEOUT_MS);
  try {
    await pb.collection('users').authRefresh({ requestKey: null, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  } catch (err) {
    if (signal?.aborted) throw new ScanError('aborted', 'Scan abgebrochen.');
    const status = (err as { status?: unknown } | null)?.status;
    if (status === 400 || status === 401 || status === 403 || status === 404) {
      throw new ScanError('unauthenticated', SESSION_EXPIRED);
    }
  }
}

/**
 * @param existing aktuelle Liste (siehe existingForScan); der Workflow sagt je
 *                 gelesenem Eintrag, welcher davon dasselbe Produkt meint (ScanItem.match)
 */
export async function requestScan(images: Blob[], existing: ScanListEntry[], signal?: AbortSignal): Promise<ScanResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new ScanError('offline', 'Keine Internetverbindung – der Foto-Scan braucht Netz.');
  }

  await refreshSession(signal);

  const form = new FormData();
  images.forEach((blob, index) => form.append('image', blob, `scan-${index + 1}.jpg`));
  if (existing.length > 0) form.append('existing', JSON.stringify(existing));

  const timeout = AbortSignal.timeout(CLIENT_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch('/api/scan', {
      method: 'POST',
      body: form,
      headers: { Authorization: pb.authStore.token },
      signal: combined,
      cache: 'no-store',
    });
  } catch {
    if (signal?.aborted) throw new ScanError('aborted', 'Scan abgebrochen.');
    if (timeout.aborted) throw new ScanError('scan_timeout', 'Der Foto-Scan hat zu lange gebraucht. Bitte versuche es erneut.');
    throw new ScanError('network', 'Keine Verbindung zum Server. Bitte versuche es erneut.');
  }

  const json: unknown = await response.json().catch(() => null);
  const result = response.ok ? parseScanResult(json) : null;
  if (result) return result;

  const error = json && typeof json === 'object' ? (json as { error?: unknown; message?: unknown }) : {};
  throw new ScanError(
    typeof error.error === 'string' ? error.error : 'bad_response',
    typeof error.message === 'string' ? error.message : 'Der Foto-Scan hat eine unerwartete Antwort geliefert.'
  );
}
