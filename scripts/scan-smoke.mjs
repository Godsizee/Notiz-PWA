// Smoke-Test fuer den n8n-Workflow "Notiz PWA · Foto-Scan" — an der App
// vorbei, direkt gegen den Webhook. Liest URL und Schluessel aus der Umgebung,
// damit nichts davon im Repo landet:
//
//   node --env-file=.env scripts/scan-smoke.mjs zettel.jpg [seite2.jpg]
//
// Exit 0 bei HTTP 2xx, sonst 1; Aufruffehler 2.
import { readFile } from 'node:fs/promises';

const url = process.env.N8N_SCAN_WEBHOOK_URL;
const key = process.env.N8N_SCAN_WEBHOOK_KEY;
if (!url || !key) {
  console.error('N8N_SCAN_WEBHOOK_URL und N8N_SCAN_WEBHOOK_KEY setzen (z. B. in .env).');
  process.exit(2);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Mindestens ein Foto angeben (JPEG/PNG/WebP, max. 4 MB).');
  process.exit(2);
}

const mediaTypeFor = (file) =>
  /\.png$/i.test(file) ? 'image/png' : /\.webp$/i.test(file) ? 'image/webp' : 'image/jpeg';

const images = await Promise.all(
  files.map(async (file) => ({ mediaType: mediaTypeFor(file), data: (await readFile(file)).toString('base64') }))
);

const started = Date.now();
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Notiz-Scan-Key': key },
  body: JSON.stringify({ version: 1, requestId: `smoke_${started}`, images }),
});
const text = await response.text();

console.log(`HTTP ${response.status} in ${Date.now() - started} ms`);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
process.exit(response.ok ? 0 : 1);
