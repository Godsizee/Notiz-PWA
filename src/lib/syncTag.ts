// Shared between src/lib/sync.ts (registers it) and worker/index.js (handles
// it) — kept in one place so the tag string can't drift between the two.
export const BACKGROUND_SYNC_TAG = 'flush-offline-queue';
