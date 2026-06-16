// Lightweight wrapper around the Vibration API for tactile feedback on mobile.
// All functions are no-ops on devices/browsers without vibration support
// (e.g. desktop, iOS Safari) so they are always safe to call.

function canVibrate(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function'
  );
}

function vibrate(pattern: number | number[]): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw if called without a user gesture — ignore silently.
  }
}

/** 10ms — subtle feedback for toggles, taps, light selections. */
export function hapticLight(): void {
  vibrate(10);
}

/** 25ms — medium feedback when a swipe/drag threshold is reached. */
export function hapticMedium(): void {
  vibrate(25);
}

/** Pulse pattern — strong feedback for destructive actions or errors. */
export function hapticHeavy(): void {
  vibrate([25, 50, 25]);
}
