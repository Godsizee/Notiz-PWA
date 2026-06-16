# Scope – Notiz-PWA

> **Version:** 1.1  
> **Stand:** 16. Juni 2026  
> **Zielgruppe:** 2 private Nutzer (kein öffentlicher Zugang)

---

## Projektziel

Einfache, private Notiz-App ähnlich Google Keep. Fokus auf schnelle Erfassung von Gedanken, Aufgaben und Einkaufslisten – ohne unnötige Komplexität.

---

## ✅ Im Scope (verbindlich)

### Notiztypen

| Typ | Beschreibung |
|---|---|
| **Freitextnotiz** | Einfache Textnotiz ohne Formatierung (kein Markdown, kein Rich Text) |
| **Checkbox-Notiz** | Liste mit abhakbaren Einträgen (ToDos, Einkaufslisten) |

### Kernfunktionen

- **Notiz erstellen** – Typ wählen (Freitext oder Checkbox), Titel (optional) + Inhalt eingeben
- **Notiz bearbeiten** – Inhalt und Titel nachträglich ändern; bei Checkbox-Notizen: Einträge hinzufügen, entfernen, abhaken
- **Notiz löschen** – einzelne Notiz dauerhaft entfernen
- **Notizen anzeigen** – Übersichtsansicht aller Notizen als Karten (Masonry/Grid)
- **Notizdetail** – vollständige Notiz in einer Detailansicht oder einem Modal öffnen

### Authentifizierung

- Einfaches Login mit E-Mail + Passwort via PocketBase
- Keine Registrierung (nur 2 vordefinierte Accounts, manuell im Backend angelegt)
- Jeder Nutzer sieht **nur seine eigenen** Notizen

### PWA-Grundfunktionen

- Installierbar auf Mobilgeräten (Manifest + Service Worker)
- Offline-Lesezugriff auf bereits geladene Notizen (kein Offline-Schreiben)

---

## ✅ Scope-Erweiterung v1.1 (16.06.2026)

### UX-Upgrade

- **Notiz-Farben** – Farbliche Kennzeichnung von Notizen (Palette im Editor)
- **Archivierung** – Notizen archivieren statt löschen
- **Filterung** – Quick-Filter nach Typ (Notiz/Checkliste), Farbe, Archiviert
- **Drag-Reorder** – Checklist-Items per Drag-and-Drop umsortieren
- **Swipe-Gesten** – Swipe-to-Dismiss (BottomSheet), Swipe-Actions (NoteCards)
- **Undo-Delete** – Soft-Delete mit 5s Undo-Toast
- **Haptic Feedback** – Taktile Rückmeldung auf Mobilgeräten
- **Skeleton Loading** – Shimmer-Platzhalter beim Initial-Load
- **Keyboard Shortcuts** – Desktop-Shortcuts (N, L, Escape)

### Realtime-Presence (Phase 6)

- **Live-Presence** – "Claudia bearbeitet gerade" Indikator in Checklisten
- Erfordert neue PocketBase Collection `presence`
- Kein kollaboratives Editing, nur Awareness

---

## ❌ Explizit NICHT im Scope

Diese Features werden **nicht** umgesetzt – auch nicht auf Wunsch, solange der Scope nicht offiziell erweitert wird:

- Labels oder Tags für Notizen
- Bilder, Anhänge oder Datei-Uploads
- Erinnerungen / Benachrichtigungen
- Suchabfragen / Volltext-Suche
- Markdown- oder Rich-Text-Formatierung
- Mehrere Listen innerhalb einer Notiz
- Kollaboratives Bearbeiten / Echtzeit-Sync
- Öffentliche Freigabe von Notizen
- Admin-Bereich oder Nutzerverwaltung in der App
- Mehrsprachigkeit / i18n

---

## Technischer Rahmen (fix)

| Bereich | Entscheidung |
|---|---|
| Frontend | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Backend | PocketBase |
| Deployment | Docker / Coolify |
| Plattform | PWA (Mobile + Desktop) |

> Änderungen am Tech-Stack erfordern eine bewusste Entscheidung außerhalb dieses Scopes.

---

## Datenmodell (PocketBase)

### Collection: `notes`

| Feld | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `title` | text | nein | Optionaler Titel der Notiz |
| `type` | select (`text` \| `checklist`) | ja | Typ der Notiz |
| `content` | text | ja | Freitext (bei `type=text`) |
| `items` | json | nein | Array von `{ text, checked }` (bei `type=checklist`) |
| `user` | relation → users | ja | Besitzer der Notiz |
| `created` | autodate | – | Erstellungsdatum |
| `updated` | autodate | – | Letztes Änderungsdatum |

---

## Scope-Erweiterung

Neue Features werden **nur nach bewusster Entscheidung** aufgenommen. Dafür gilt:

1. Feature in einem GitHub Issue beschreiben
2. Scope-Dokument aktualisieren (diese Datei)
3. Commit mit Änderungsgrund

---

## Abgrenzung zu Google Keep

Die App lehnt sich an Google Keep an, ist aber bewusst **reduzierter**:

- Kein Label-System
- Keine Farben
- Keine Erinnerungen
- Kein Google-Account / keine Synchronisation mit externen Diensten
