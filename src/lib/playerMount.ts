/**
 * Global single-player registry.
 *
 * Only ONE video player overlay may live in the DOM at a time. Two mounted
 * players mean two media elements pulling segments (double streaming), two
 * hls.js/mpegts.js instances buffering, and — on a single-connection Xtream
 * account — instant "max connections" refusals. Whenever a new player mounts we
 * ask the previous one to close itself, so React unmounts the stale layer.
 */

type Entry = { token: symbol; close: () => void };

let current: Entry | null = null;

/**
 * Register a freshly mounted player. Any previously mounted player is asked to
 * close (which unmounts its DOM + tears down its media element).
 */
export function acquirePlayerMount(close: () => void): symbol {
  const token = Symbol('player');
  const previous = current;
  current = { token, close };
  if (previous && previous.token !== token) {
    try {
      previous.close();
    } catch (err) {
      console.warn('previous player close failed', err);
    }
  }
  return token;
}

/** Drop the registration on unmount (no-op if a newer player already took over). */
export function releasePlayerMount(token: symbol): void {
  if (current?.token === token) current = null;
}

/** True while some player overlay is mounted — handy for guards/tests. */
export function isPlayerMounted(): boolean {
  return current !== null;
}
