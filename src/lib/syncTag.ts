// Shared between src/lib/sync.ts (registers it) and worker/index.js (handles
// it) — kept in one place so the tag string can't drift between the two.
export const BACKGROUND_SYNC_TAG = 'flush-offline-queue';

// Same idea for the Web Share Target handoff: worker/index.js writes the
// shared payload under this key in the `meta` store, src/app/share/page.tsx
// reads it back after the redirect.
export const PENDING_SHARE_KEY = 'pendingShare';
