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

export async function requestScan(images: Blob[], signal?: AbortSignal): Promise<ScanResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new ScanError('offline', 'Keine Internetverbindung – der Foto-Scan braucht Netz.');
  }

  const form = new FormData();
  images.forEach((blob, index) => form.append('image', blob, `scan-${index + 1}.jpg`));

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
