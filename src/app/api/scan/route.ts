import http from "node:http";
import https from "node:https";
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
// Optional: Hostname/IP, ueber den die Verbindung zu PocketBase laeuft (siehe refreshViaHost).
const PB_CONNECT_VIA = process.env.POCKETBASE_CONNECT_VIA || undefined;
const WEBHOOK_URL = process.env.N8N_SCAN_WEBHOOK_URL;
const WEBHOOK_KEY = process.env.N8N_SCAN_WEBHOOK_KEY;

const MAX_IMAGES = 3;
// Aktuelle Liste fuer den Abgleich ("Pink Lady" = "Aepfel"): reiner Text, daher klein.
const MAX_EXISTING = 150;
const MAX_EXISTING_TEXT = 120;
const MAX_EXISTING_JSON_CHARS = 40_000;
// Der Client liefert ~0,5–1,2 MB pro Bild (2048 px, JPEG). Das Limit faengt
// nur Ausreisser ab, z. B. einen Aufruf an der App vorbei.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_IMAGES * MAX_IMAGE_BYTES + 64 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// Die Sitzungspruefung ist ein einzelner kurzer Aufruf; haengt sie, ist PocketBase nicht erreichbar.
const AUTH_TIMEOUT_MS = 15_000;
// n8n: 45 s Timeout x 2 Versuche + 2 s Pause = 92 s im schlechtesten Fall.
const UPSTREAM_TIMEOUT_MS = 100_000;

// Kostenbremse, bewusst im Prozessspeicher (gleiche Abwaegung wie in
// /api/register): ein Container, zwei Nutzer.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_SCANS = 30;
const scans = new Map<string, { count: number; resetAt: number }>();

const NO_STORE = { "Cache-Control": "no-store" };

// Optionales Formularfeld "existing": JSON-Liste { text, done }. Eine kaputte oder
// zu grosse Liste ist kein Grund, den Scan abzulehnen — dann gibt es eben keinen Abgleich.
// Leere Texte bleiben drin, weil die Position der Schluessel fuer "match" ist.
function parseExisting(value: FormDataEntryValue | null): { text: string; done: boolean }[] {
  if (typeof value !== "string" || value.length > MAX_EXISTING_JSON_CHARS) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_EXISTING).map((entry) => {
      const e = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
      const text = typeof e.text === "string" ? e.text.replace(/\s+/g, " ").trim().slice(0, MAX_EXISTING_TEXT) : "";
      return { text, done: e.done === true };
    });
  } catch {
    return [];
  }
}

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

type AuthResult = { userId: string } | { reason: "unauthenticated" | "unreachable" };

// Der Client schickt pb.authStore.token im Authorization-Header (nicht das
// Cookie): Header-Auth ist nicht per CSRF ausnutzbar. authRefresh() ist die
// einzige Pruefung, die PocketBase selbst die Signatur verifizieren laesst.
//
// "Sitzung abgelaufen" nur, wenn PocketBase das Token wirklich ablehnt. Kommt gar
// keine Antwort (Netzwerk, DNS, Timeout), ist das ein Serverproblem und darf den
// Nutzer nicht zum erneuten Anmelden schicken — die Ursache steht im Log.
async function authenticate(request: Request): Promise<AuthResult> {
  const token = request.headers.get("authorization")?.trim();
  if (!token || !PB_URL) {
    console.warn(`[scan] Sitzungspruefung: ${!token ? "kein Authorization-Header" : "POCKETBASE_URL fehlt"}`);
    return { reason: "unauthenticated" };
  }
  try {
    if (PB_CONNECT_VIA) return { userId: await refreshViaHost(PB_URL, PB_CONNECT_VIA, token) };
    const pb = new PocketBase(PB_URL);
    pb.authStore.save(token);
    const { record } = await pb.collection("users").authRefresh({ requestKey: null, signal: AbortSignal.timeout(AUTH_TIMEOUT_MS) });
    return { userId: record.id };
  } catch (err) {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : 0;
    if (status === 400 || status === 401 || status === 403 || status === 404) {
      // Nie das Token selbst loggen, nur Herkunft der Ablehnung und Ablaufzeit.
      console.warn(`[scan] PocketBase (${new URL(PB_URL).origin}) lehnt das Token ab: HTTP ${status} | ${causeOf(err)} | ${describeToken(token)}`);
      return { reason: "unauthenticated" };
    }
    // Origin statt voller URL: ohne Pfad, damit nichts Unnoetiges im Log landet.
    console.error(`[scan] PocketBase (${new URL(PB_URL).origin}) nicht erreichbar oder antwortet mit ${status || "Netzwerkfehler"}:`, causeOf(err));
    return { reason: "unreachable" };
  }
}

// Dieselbe Pruefung wie authRefresh(), aber mit der TCP-Verbindung zu `via` statt zum
// Host aus der URL; Host-Header und TLS-Servername bleiben der echte Name. Fuer den
// Fall, dass der Server PocketBase nur ueber die oeffentliche URL seines eigenen
// Hosts erreicht und Docker diese Schleife nicht zurueckleitet (Traefik im selben
// Netz wie die App, siehe POCKETBASE_CONNECT_VIA im README). Fehler tragen wie
// beim PocketBase-SDK ein `status` (0 = keine Antwort).
function refreshViaHost(baseUrl: string, via: string, token: string): Promise<string> {
  const base = new URL(baseUrl);
  const secure = base.protocol === "https:";
  return new Promise((resolve, reject) => {
    const req = (secure ? https : http).request(
      {
        host: via,
        port: base.port || (secure ? 443 : 80),
        method: "POST",
        path: `${base.pathname.replace(/\/$/, "")}/api/collections/users/auth-refresh`,
        servername: secure ? base.hostname : undefined,
        headers: { Host: base.host, Authorization: token, "Content-Length": 0, Accept: "application/json" },
        timeout: AUTH_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          if (status !== 200) return reject({ status, message: `PocketBase antwortet mit ${status}` });
          try {
            const id = (JSON.parse(Buffer.concat(chunks).toString("utf8")) as { record?: { id?: unknown } }).record?.id;
            if (typeof id === "string" && id) return resolve(id);
          } catch {}
          reject({ status: 502, message: "Unerwartete Antwort von PocketBase" });
        });
      }
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("Timeout"), { code: "ETIMEDOUT" })));
    req.on("error", (err) => reject({ status: 0, message: err.message, code: (err as NodeJS.ErrnoException).code }));
    req.end();
  });
}

// Nur fuers Log: laeuft das Token laut eigenem exp-Claim noch? So ist eine
// Ablehnung durch PocketBase "abgelaufen" oder "fremde Instanz" unterscheidbar.
function describeToken(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { exp?: unknown };
    if (typeof payload.exp !== "number") return "JWT ohne exp";
    return `JWT exp=${new Date(payload.exp * 1000).toISOString()} (${payload.exp * 1000 > Date.now() ? "noch gueltig" : "abgelaufen"})`;
  } catch {
    return "kein lesbares JWT";
  }
}

function causeOf(err: unknown): string {
  const e = err as { message?: unknown; code?: unknown; originalError?: { cause?: { code?: unknown; message?: unknown }; message?: unknown } };
  const cause = e?.originalError?.cause;
  const parts = [e?.message, e?.code, e?.originalError?.message, cause?.code, cause?.message].filter((p): p is string => typeof p === "string" && p !== "");
  return parts.join(" | ") || "unbekannt";
}

export async function POST(request: Request) {
  if (!WEBHOOK_URL || !WEBHOOK_KEY || !PB_URL) {
    console.error("[scan] N8N_SCAN_WEBHOOK_URL / N8N_SCAN_WEBHOOK_KEY / POCKETBASE_URL fehlen.");
    return fail(503, "scan_unavailable");
  }

  const requestId = `scan_${crypto.randomUUID()}`;
  const startedAt = Date.now();
  // Ablaufprotokoll: haengt ein Scan, zeigt die letzte Zeile im Log, hinter
  // welchem Schritt (Sitzung, Bilder lesen, n8n) er steckt.
  const trace = (step: string) => console.info(`[scan ${requestId}] +${Date.now() - startedAt}ms ${step}`);
  trace(`Anfrage eingegangen (content-length=${request.headers.get("content-length") ?? "?"})`);

  const auth = await authenticate(request);
  if ("reason" in auth) {
    trace(`Sitzungspruefung: ${auth.reason}`);
    return auth.reason === "unreachable" ? fail(503, "scan_unavailable") : fail(401, "unauthenticated");
  }
  trace("Sitzung ok");
  if (rateLimited(auth.userId)) return fail(429, "rate_limited");

  if (Number(request.headers.get("content-length") || 0) > MAX_REQUEST_BYTES) {
    return fail(413, "too_large");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (err) {
    console.error(`[scan ${requestId}] +${Date.now() - startedAt}ms Formular nicht lesbar:`, err);
    return fail(400, "invalid_input");
  }
  trace("Formular gelesen");

  const files = form.getAll("image").filter((entry): entry is File => typeof entry !== "string");
  if (files.length === 0 || files.length > MAX_IMAGES) return fail(400, "invalid_input");

  const images: { mediaType: string; data: string }[] = [];
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) return fail(400, "invalid_input", "Dieses Bildformat wird nicht unterstützt.");
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) return fail(413, "too_large");
    images.push({ mediaType: file.type, data: Buffer.from(await file.arrayBuffer()).toString("base64") });
  }

  const existing = parseExisting(form.get("existing"));
  trace(`${images.length} Bild(er) gelesen (${files.reduce((sum, file) => sum + file.size, 0)} Bytes), ${existing.length} Listeneintraege`);

  let upstream: Response;
  trace("rufe n8n");
  try {
    upstream = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Notiz-Scan-Key": WEBHOOK_KEY },
      body: JSON.stringify({ version: 1, requestId, images, ...(existing.length > 0 ? { existing } : {}) }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    console.error(`[scan ${requestId}] +${Date.now() - startedAt}ms n8n nicht erreichbar:`, err);
    return fail(timedOut ? 504 : 503, timedOut ? "scan_timeout" : "scan_unavailable");
  }
  trace(`n8n antwortet mit HTTP ${upstream.status}`);

  const payload: unknown = await upstream.json().catch(() => null);
  trace("n8n-Antwort gelesen");
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

  console.info(`[scan ${requestId}] user=${auth.userId} items=${Array.isArray(body.items) ? body.items.length : "?"} meta=${JSON.stringify(body.meta ?? null)}`);
  return NextResponse.json(body, { status: 200, headers: NO_STORE });
}
