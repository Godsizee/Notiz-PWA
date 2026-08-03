# Notiz PWA

Moin. Das hier ist meine private, offline-fähige Notiz-App – im Prinzip ein stark reduzierter Google-Keep-Klon ohne den üblichen Google-Datenhunger. Optimiert für die schnelle Erfassung von Gedanken, Aufgaben und der geteilten Einkaufsliste für zwei Personen.

## Features

- **Freitext & Checklisten:** Textnotizen oder abhakbare Listen für To-Dos und Einkäufe.
- **Bilder:** Fotos direkt aus der Kamera, aus der Galerie, per Einfügen oder per Android-Teilen-Menü an eine Notiz hängen. Sie werden im Browser auf 2048px/WebP heruntergerechnet (das entfernt nebenbei EXIF-GPS), erscheinen als Galerie über dem Titel und als Collage auf der Karte. Vollbild mit Wischen, Pinch- und Doppeltipp-Zoom. Uploads laufen wie alles andere über die Sync-Queue, funktionieren also auch offline.
- **Offline-Schreiben (Sync-Queue):** Notizen unterwegs tippen oder Checklisten abhaken. Aktionen landen in einer lokalen IndexedDB-Queue und syncen bei der nächsten Verbindung. Kein Datenverlust.
- **Gemeinsame Notizen:** Notizen per Knopfdruck freigeben. Super für die gemeinsame Einkaufsliste. Realtime-Update inklusive.
- **Live-Presence:** Zeigt an, wer gerade eine Checkliste bearbeitet ("Claudia bearbeitet gerade...").
- **Premium UX:** Karten morphen per Shared-Element-Übergang nahtlos in den Editor (Framer Motion). Fühlt sich an wie eine native App.
- **Nützlicher Kleinkram:** Grid- oder Listenansicht, einstellbare Schriftgrößen, True-Black-Theme (AMOLED) für Akkusparen, Notizen anpinnen, clientseitiger JSON-Backup-Export (Bilder werden dabei als URL referenziert, nicht eingebettet – ein Backup bleibt eine kleine Textdatei) und ein Share-Target für Android. Plus Konfetti-Burst beim letzten abgehakten Item. 

## Tech Stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS v4, Framer Motion
- **State Management:** Zustand
- **Backend:** PocketBase (Auth, Realtime, DB)
- **Deployment:** Docker / Coolify
