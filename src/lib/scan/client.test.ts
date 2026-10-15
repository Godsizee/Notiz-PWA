import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Der echte pb-Client braucht NEXT_PUBLIC_POCKETBASE_URL und IndexedDB; hier
// zaehlt nur, wie requestScan mit authRefresh und dem Token umgeht.
const { pb, authRefresh } = vi.hoisted(() => {
  const authRefresh = vi.fn();
  return { pb: { authStore: { token: 'old-token' }, collection: () => ({ authRefresh }) }, authRefresh };
});
vi.mock('@/lib/pb', () => ({ pb }));

import { requestScan, ScanError } from '@/lib/scan/client';

const fetchMock = vi.fn();
const images = [new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })];
const unavailable = () => Response.json({ ok: false, error: 'scan_unavailable', message: 'nicht erreichbar' }, { status: 503 });

function sentToken(): string | undefined {
  return (fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined)?.headers?.Authorization;
}

describe('requestScan: Token vor dem Scan erneuern', () => {
  beforeEach(() => {
    pb.authStore.token = 'old-token';
    authRefresh.mockReset();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => unavailable());
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { onLine: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('schickt das Token, das die Erneuerung geliefert hat', async () => {
    authRefresh.mockImplementation(async () => {
      pb.authStore.token = 'fresh-token';
    });
    await expect(requestScan(images, [])).rejects.toMatchObject({ code: 'scan_unavailable' });
    expect(authRefresh).toHaveBeenCalledOnce();
    expect(sentToken()).toBe('fresh-token');
  });

  it.each([400, 401, 403, 404])('meldet eine tote Sitzung (PocketBase %i) ohne das Foto hochzuladen', async (status) => {
    authRefresh.mockRejectedValue({ status });
    const err = await requestScan(images, []).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ScanError);
    expect(err).toMatchObject({ code: 'unauthenticated', message: 'Deine Sitzung ist abgelaufen. Bitte melde dich neu an.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('macht bei Netzfehler der Erneuerung mit dem vorhandenen Token weiter', async () => {
    authRefresh.mockRejectedValue({ status: 0, isAbort: false });
    await expect(requestScan(images, [])).rejects.toMatchObject({ code: 'scan_unavailable' });
    expect(sentToken()).toBe('old-token');
  });

  it('erneuert nichts ohne Token und laesst den Server entscheiden', async () => {
    pb.authStore.token = '';
    await expect(requestScan(images, [])).rejects.toMatchObject({ code: 'scan_unavailable' });
    expect(authRefresh).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('bricht beim Abbrechen waehrend der Erneuerung mit "aborted" ab', async () => {
    const controller = new AbortController();
    authRefresh.mockImplementation(async () => {
      controller.abort();
      throw { status: 0, isAbort: true };
    });
    await expect(requestScan(images, [], controller.signal)).rejects.toMatchObject({ code: 'aborted' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prueft Netz zuerst: offline wird gar nicht erst erneuert', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await expect(requestScan(images, [])).rejects.toMatchObject({ code: 'offline' });
    expect(authRefresh).not.toHaveBeenCalled();
  });
});
