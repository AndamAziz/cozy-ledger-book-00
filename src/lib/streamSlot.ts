/**
 * Single-slot stream guard.
 *
 * The provider account allows one simultaneous connection, so a new channel /
 * movie must never be opened while the previous socket is still draining. The
 * player registers a teardown here and waits out a short release grace period
 * before dialling the next stream.
 */

const RELEASE_GRACE_MS = 700;

let lastReleaseAt = 0;
let activeTeardown: (() => void) | null = null;

/** Force-close whatever stream is currently playing (idempotent). */
export function releaseActiveStream(): void {
  const teardown = activeTeardown;
  activeTeardown = null;
  if (teardown) {
    try {
      teardown();
    } catch (err) {
      console.warn('stream teardown failed', err);
    }
    // Only count a release when a real stream was actually torn down.
    // Stamping unconditionally made a fresh claim (no prior stream) pay the
    // full grace wait for nothing, slowing the very first channel open.
    lastReleaseAt = Date.now();
  }
}

/**
 * Claim the slot for a new stream: closes the previous one and returns how long
 * the caller should wait before opening the upstream connection.
 */
export function claimStreamSlot(teardown: () => void): number {
  releaseActiveStream();
  activeTeardown = teardown;
  const elapsed = Date.now() - lastReleaseAt;
  return Math.max(0, RELEASE_GRACE_MS - elapsed);
}

/** Drop the registration without counting it as a fresh release. */
export function unregisterStream(teardown: () => void): void {
  if (activeTeardown === teardown) activeTeardown = null;
}
