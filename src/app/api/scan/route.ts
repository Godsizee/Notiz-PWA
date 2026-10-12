import { NextResponse } from "next/server";
import PocketBase from "pocketbase";

// Foto-Scan: nimmt bis zu drei im Browser verkleinerte Fotos an, prueft die
// Sitzung gegen PocketBase und reicht die Bilder an den n8n-Workflow
// "Notiz PWA · Foto-Scan" weiter, der Claude Haiku 5.5 aufruft.
//
// Warum ueber den Server und nicht direkt vom Browser zu n8n: Webhook-URL und
// -Schluessel blieben sonst im Client-Bundle sichtbar, und die CSP muesste
// connect-src fuer eine fremde Origin oeffnen. So sieht der Browser nur
// /api/scan auf der eigenen Origin.
//
// Geschrieben wird hier nichts. Die Eintraege landen erst nach der Pruefung im
// Review-Sheet ueber den normalen Schreibpfad (applyChange) in der Liste.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Kein Fallback auf eine konkrete Instanz, siehe next.config.mjs.
const PB_URL = process.env.POCKETBASE_URL || process.env.NEXT_PUBLIC_POCKETBASE_URL;
const WEBHOOK_URL = process.env.N8N_SCAN_WEBHOOK_URL;
const WEBHOOK_KEY = process.env.N8N_SCAN_WEBHOOK_KEY;

const MAX_IMAGES = 3;
// Der Client liefert ~0,5–1,2 MB pro Bild (2048 px, JPEG). Das Limit faengt
// nur Ausreisser ab, z. B. einen Aufruf an der App vorbei.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_IMAGES * MAX_IMAGE_BYTES + 64 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// n8n: 45 s Timeout x 2 Versuche + 2 s Pause = 92 s im schlechtesten Fall.
const UPSTREAM_TIMEOUT_MS = 100_000;

// Kostenbremse, bewusst im Prozessspeicher (gleiche Abwaegung wie in
// /api/register): ein Container, zwei Nutzer.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_SCANS = 30;
const scans = new Map<string, { count: number; resetAt: number }>();

const NO_STORE = { "Cache-Control": "no-store" };

const MESSAGES = {
  unauthenticated: "Deine Sitzung ist abgelaufen. Bitte melde dich neu an.",
  invalid_input: "Das Foto konnte nicht gelesen werden.",
  too_large: "Das Foto ist zu groß.",
  rate_limited: "Zu viele Scans in kurzer Zeit. Bitte versuche es später erneut.",
  scan_unavailable: "Der Foto-Scan ist gerade nicht erreichbar.",
  scan_timeout: "Der Foto-Scan hat zu lange gebraucht. Bitte versuche es erneut.",
  bad_response: "Der Foto-Scan hat eine unerwartete Antwort geliefert.",
} as const;

type ErrorCode = keyof typeof MESSAGES;

function fail(status: number, error: ErrorCode, message: string = MESSAGES[error]) {
  return NextResponse.json({ ok: false, version: 1, error, message }, { status, headers: NO_STORE });
}

function rateLimited(userId: string): boolean {
  const now = Date.now();
  for (const [key, entry] of scans) {
    if (entry.resetAt <= now) scans.delete(key);
  }
  const entry = scans.get(userId);
  if (!entry || entry.resetAt <= now) {
    scans.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_SCANS;
}

// Der Client schickt pb.authStore.token im Authorization-Header (nicht das
// Cookie): Header-Auth ist nicht per CSRF ausnutzbar. authRefresh() ist die
// einzige Pruefung, die PocketBase selbst die Signatur verifizieren laesst.
async function authenticatedUserId(request: Request): Promise<string | null> {
  const token = request.headers.get("authorization")?.trim();
  if (!token || !PB_URL) return null;
  const pb = new PocketBase(PB_URL);
  pb.authStore.save(token);
  try {
    const { record } = await pb.collection("users").authRefresh({ requestKey: null });
    return record.id;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!WEBHOOK_URL || !WEBHOOK_KEY || !PB_URL) {
    console.error("[scan] N8N_SCAN_WEBHOOK_URL / N8N_SCAN_WEBHOOK_KEY / POCKETBASE_URL fehlen.");
    return fail(503, "scan_unavailable");
  }

  const userId = await authenticatedUserId(request);
  if (!userId) return fail(401, "unauthenticated");
  if (rateLimited(userId)) return fail(429, "rate_limited");

  if (Number(request.headers.get("content-length") || 0) > MAX_REQUEST_BYTES) {
    return fail(413, "too_large");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "invalid_input");
  }

  const files = form.getAll("image").filter((entry): entry is File => typeof entry !== "string");
  if (files.length === 0 || files.length > MAX_IMAGES) return fail(400, "invalid_input");

  const images: { mediaType: string; data: string }[] = [];
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) return fail(400, "invalid_input", "Dieses Bildformat wird nicht unterstützt.");
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return fail(413, "too_large");
    images.push({ mediaType: file.type, data: Buffer.from(await file.arrayBuffer()).toString("base64") });
  }

  const requestId = `scan_${crypto.randomUUID()}`;

  let upstream: Response;
  try {
    upstream = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Notiz-Scan-Key": WEBHOOK_KEY },
      body: JSON.stringify({ version: 1, requestId, images }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    console.error(`[scan ${requestId}] n8n nicht erreichbar:`, err);
    return fail(timedOut ? 504 : 503, timedOut ? "scan_timeout" : "scan_unavailable");
  }

  const payload: unknown = await upstream.json().catch(() => null);
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;

  // Kein v1-Vertrag: Workflow inaktiv (404), falscher Schluessel (403, Text
  // statt JSON) oder ein Proxy-Fehler. Fuer den Nutzer ist das alles
  // "gerade nicht erreichbar", die Details stehen im Log.
  if (!body || body.version !== 1) {
    console.error(`[scan ${requestId}] unerwartete Antwort von n8n: HTTP ${upstream.status}`);
    return upstream.ok ? fail(502, "bad_response") : fail(503, "scan_unavailable");
  }

  if (body.ok !== true) {
    console.warn(`[scan ${requestId}] n8n meldet ${String(body.error)}`);
    return NextResponse.json(
      {
        ok: false,
        version: 1,
        error: typeof body.error === "string" ? body.error : "bad_response",
        message: typeof body.message === "string" ? body.message : MESSAGES.bad_response,
      },
      { status: upstream.status >= 400 ? upstream.status : 502, headers: NO_STORE }
    );
  }

  console.info(`[scan ${requestId}] user=${userId} items=${Array.isArray(body.items) ? body.items.length : "?"} meta=${JSON.stringify(body.meta ?? null)}`);
  return NextResponse.json(body, { status: 200, headers: NO_STORE });
}
