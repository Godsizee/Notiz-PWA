# Notiz PWA

Moin. Das hier ist meine private, offline-fähige Notiz-App – im Prinzip ein stark reduzierter Google-Keep-Klon ohne den üblichen Google-Datenhunger. Optimiert für die schnelle Erfassung von Gedanken, Aufgaben und der geteilten Einkaufsliste für zwei Personen.

## Features

- **Freitext & Checklisten:** Textnotizen oder abhakbare Listen für To-Dos und Einkäufe.
- **Offline-Schreiben (Sync-Queue):** Notizen unterwegs tippen oder Checklisten abhaken. Aktionen landen in einer lokalen IndexedDB-Queue und syncen bei der nächsten Verbindung. Kein Datenverlust.
- **Gemeinsame Notizen:** Notizen per Knopfdruck freigeben. Super für die gemeinsame Einkaufsliste. Realtime-Update inklusive.
- **Live-Presence:** Zeigt an, wer gerade eine Checkliste bearbeitet ("Claudia bearbeitet gerade...").
- **Premium UX:** Karten morphen per Shared-Element-Übergang nahtlos in den Editor (Framer Motion). Fühlt sich an wie eine native App.
- **Nützlicher Kleinkram:** Grid- oder Listenansicht, einstellbare Schriftgrößen, True-Black-Theme (AMOLED) für Akkusparen, Notizen anpinnen, clientseitiger JSON-Backup-Export und ein Share-Target für Android. Plus Konfetti-Burst beim letzten abgehakten Item. 

## Tech Stack

- **Framework:** Next.js 15 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS v4, Framer Motion
- **State Management:** Zustand
- **Backend:** PocketBase (Auth, Realtime, DB)
- **Deployment:** Docker / Coolify
