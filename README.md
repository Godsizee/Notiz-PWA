# Notiz PWA

Moin. Das hier ist meine private, offline-fähige Notiz-App – im Prinzip ein stark reduzierter Google-Keep-Klon ohne den üblichen Google-Datenhunger. Optimiert für die schnelle Erfassung von Gedanken, Aufgaben und der geteilten Einkaufsliste für zwei Personen.

Die App ist ein **geschlossenes System**: Es gibt keine offene Registrierung, Konten werden per Allowlist bzw. direkt im PocketBase-Admin angelegt.

## Features

- **Freitext & Checklisten:** Textnotizen oder abhakbare Listen für To-Dos und Einkäufe.
- **Bilder:** Fotos direkt aus der Kamera, aus der Galerie, per Einfügen oder per Android-Teilen-Menü an eine Notiz hängen. Sie werden im Browser auf 2048px/WebP heruntergerechnet (das entfernt nebenbei EXIF-GPS), erscheinen als Galerie über dem Titel und als Collage auf der Karte. Vollbild mit Wischen, Pinch- und Doppeltipp-Zoom. Uploads laufen wie alles andere über die Sync-Queue, funktionieren also auch offline.
- **Offline-Schreiben (Sync-Queue):** Notizen unterwegs tippen oder Checklisten abhaken. Aktionen landen in einer lokalen IndexedDB-Queue und syncen bei der nächsten Verbindung. Kein Datenverlust.
- **Gemeinsame Notizen:** Notizen per Knopfdruck freigeben. Super für die gemeinsame Einkaufsliste. Realtime-Update inklusive.
- **Live-Presence:** Zeigt an, wer gerade eine Checkliste bearbeitet ("Claudia bearbeitet gerade...").
- **Premium UX:** Karten morphen per Shared-Element-Übergang nahtlos in den Editor (Framer Motion). Fühlt sich an wie eine native App.
- **Nützlicher Kleinkram:** Grid- oder Listenansicht, einstellbare Schriftgrößen, True-Black-Theme (AMOLED) für Akkusparen, Notizen anpinnen, clientseitiger JSON-Backup-Export (Bilder werden dabei als URL referenziert, nicht eingebettet – ein Backup bleibt eine kleine Textdatei) und ein Share-Target für Android. Plus Konfetti-Burst beim letzten abgehakten Item.

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS v4, Framer Motion
- **State Management:** Zustand
- **Backend:** PocketBase (Auth, Realtime, DB)
- **Deployment:** Docker / Coolify

## Schnellstart

Voraussetzungen: **Node.js 20+** und **Docker** (für PocketBase).

```bash
git clone https://github.com/Godsizee/Notiz-PWA.git
cd Notiz-PWA
npm install
cp .env.example .env           # danach .env ausfüllen, siehe unten
```

### 1. PocketBase starten

```bash
docker compose up -d pocketbase
```

Der Container bringt die Migrationen aus [`pb_migrations/`](pb_migrations/) mit
(sie sind fest ins Image kopiert, siehe [`Dockerfile.pocketbase`](Dockerfile.pocketbase))
und wendet sie beim Start automatisch an. Damit entstehen die Collections
`notes`, `checklist_items`, `note_images` und `presence` samt Zugriffsregeln —
ein separates Seed-Skript gibt es nicht.

Superuser-Zugangsdaten kommen aus `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD`
in deiner `.env`. Das Admin-UI liegt danach unter <http://localhost:8090/_/>.

### 2. Nutzerkonten anlegen

Im Admin-UI unter *Collections → users → New record*. Setze bei einem frisch
angelegten Konto `needs_password_change` auf `true` — die App zwingt beim ersten
Login dann zum Passwortwechsel.

Alternativ läuft die Registrierung über `/api/register`, aber nur für Adressen,
die in `REGISTRATION_ALLOWED_EMAILS` stehen. Ist die Variable leer oder nicht
gesetzt, ist die Registrierung geschlossen.

### 3. App starten

```bash
npm run dev
```

Läuft auf <http://localhost:3000>. Der Service Worker ist im Dev-Modus
deaktiviert (siehe `disable:` in [`next.config.mjs`](next.config.mjs)) — für
Offline- und Installations-Tests braucht es einen Produktionsbuild:

```bash
npm run build && npm start
```

## Konfiguration

Alle Variablen sind in [`.env.example`](.env.example) dokumentiert.

| Variable | Wo | Zweck |
| --- | --- | --- |
| `NEXT_PUBLIC_POCKETBASE_URL` | Build | PocketBase-URL, **wie der Browser sie erreicht**. Landet im Client-Bundle und in den Workbox-Regeln des Service Workers. |
| `POCKETBASE_URL` | Laufzeit (Server) | Dieselbe Instanz, **wie der Server sie erreicht** — im Docker-Netz der Servicename statt `localhost`. |
| `NEXT_PUBLIC_SITE_URL` | Build | Öffentliche Basis-URL, gebraucht für den Redirect des Android-Share-Targets. |
| `PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` | PocketBase-Start | Admin-Konto, das beim ersten Start des Containers angelegt wird. |
| `REGISTRATION_ALLOWED_EMAILS` | Laufzeit (Server) | Kommagetrennte Allowlist für `/api/register`. Leer = Registrierung geschlossen. |
| `PB_INITIAL_USER_EMAILS` / `PB_INITIAL_USER_PASSWORD` | PocketBase-Start | Optional: Startkonten mit erzwungenem Passwortwechsel. |

> `NEXT_PUBLIC_POCKETBASE_URL` ist **Pflicht** — fehlt sie, bricht der Build mit
> einer Meldung ab, statt still auf eine fremde Instanz zu zeigen.
>
> Die `NEXT_PUBLIC_*`-Werte werden **zur Buildzeit** ins Bundle eingebacken. Im
> Docker-Build müssen sie deshalb als `--build-arg` ankommen, nicht als
> Laufzeit-Environment. Der Workflow in
> [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) zieht sie aus
> den GitHub *Repository Variables* gleichen Namens.

## Skripte

| Befehl | Wirkung |
| --- | --- |
| `npm run dev` | Dev-Server (Service Worker aus) |
| `npm run build` | Produktionsbuild inkl. Service Worker |
| `npm start` | Produktionsserver |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

## Deployment

Bei jedem Push auf `master` prüft GitHub Actions Lint und Typen, baut danach das
Docker-Image und schiebt es nach `ghcr.io/godsizee/notiz-pwa`. Die
[`docker-compose.yml`](docker-compose.yml) zieht dieses Image und startet es
zusammen mit PocketBase.

Damit der Build die richtige Backend-URL einbackt, müssen im Repository unter
*Settings → Secrets and variables → Actions → Variables* die Variablen
`NEXT_PUBLIC_POCKETBASE_URL` und `NEXT_PUBLIC_SITE_URL` gesetzt sein.

## Sicherheit

- **Geschlossene Registrierung:** `/api/register` prüft gegen
  `REGISTRATION_ALLOWED_EMAILS` und ist bei leerer Liste zu. Dazu ein
  IP-Rate-Limit von 5 Versuchen pro 15 Minuten (im Prozessspeicher, also pro
  Container — für einen Einzel-Container-Betrieb ausreichend).
- **Zugriffsregeln:** Notizen sind für den Besitzer sichtbar und für alle, wenn
  `is_shared` gesetzt ist. Geteilte Notizen darf jeder Beteiligte bearbeiten,
  aber **nur der Besitzer** darf sie löschen, den Besitz übertragen oder das
  Teilen beenden (siehe
  [`pb_migrations/1778867200_tighten_note_rules.js`](pb_migrations/1778867200_tighten_note_rules.js)).
- **Sicherheitsheader:** CSP, `nosniff`, `Referrer-Policy`, `X-Frame-Options`,
  `Permissions-Policy` und HSTS werden in
  [`next.config.mjs`](next.config.mjs) gesetzt.
- **Keine Zugangsdaten im Repo:** Alle Secrets kommen aus der Umgebung. Es gibt
  bewusst keine Fallback-Werte, die auf eine konkrete Instanz zeigen.

Bekannte Einschränkungen: `script-src` in der CSP erlaubt `'unsafe-inline'`
(das Theme-Skript muss vor dem ersten Paint laufen; ein strenges `script-src`
bräuchte Nonces und damit dynamisches Rendering auf allen Seiten), und die
Registrierung verifiziert die E-Mail-Adresse nicht — dafür müsste in PocketBase
SMTP konfiguriert sein.

## Lizenz

[GNU Affero General Public License v3.0](LICENSE) — Copyright © 2026 Godsizee.

Kurz gefasst: Nutzung, Änderung und Weitergabe sind erlaubt, aber wer eine
geänderte Fassung als Netzwerkdienst betreibt, muss deren Quellcode den Nutzern
zugänglich machen.
