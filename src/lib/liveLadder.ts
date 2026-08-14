/**
 * Client-side live engine ladder.
 *
 * Kept pure and separate from the player so the "TS-only panel must lead with
 * mpegts.js" rule is unit-testable: leading with hls.js on such a panel makes
 * the proxy request a `.m3u8` the provider refuses with 407/458, which the
 * player used to read as a false "all viewing slots in use" and loop on.
 */

export type LiveEngine = 'mpegts' | 'hls' | 'native';

export function liveEngineOrder(opts: {
  /** Panel advertises transport streams but no HLS. */
  tsOnly: boolean;
  /** Browser can play HLS from a plain <video src> (Safari/iOS/many Smart TVs). */
  nativeHls: boolean;
  /** hls.js is usable here (needs MSE). */
  hlsSupported: boolean;
  /** Panel advertises HLS and nothing else — `.ts` is not available. */
  hlsOnly?: boolean;
  /** Content-Type already observed for this channel, when known. */
  contentType?: string | null;
}): LiveEngine[] {
  const mime = (opts.contentType ?? '').toLowerCase();
  // A panel that only speaks HLS leaves no choice.
  const hlsFirst = opts.hlsOnly || mime.includes('mpegurl');
  const chain: LiveEngine[] = hlsFirst
    ? opts.nativeHls
      ? ['native', 'hls', 'mpegts']
      : ['hls', 'mpegts', 'native']
    : // Everything else leads with the continuous transport stream (mpegts.js).
      // The panel's HLS manifest hands out short-lived per-segment tokens that
      // die behind our proxy, so `.ts` is both the fastest and the only route
      // that keeps Direct channels alive. Browsers without MSE (iOS Safari)
      // cannot run mpegts.js, so those fall back to native HLS.
      opts.hlsSupported
      ? ['mpegts', 'hls', 'native']
      : opts.nativeHls
        ? ['native', 'mpegts']
        : ['mpegts', 'native'];
  const filtered = chain.filter((e) => (e === 'hls' ? opts.hlsSupported : true));
  return filtered.length ? filtered : ['native'];
}

/** Container the proxy will be asked for, given the engine in play. */
export function candidateFormatFor(engine: LiveEngine, kind: string): 'ts' | 'm3u8' | 'file' {
  if (kind !== 'live') return 'file';
  return engine === 'mpegts' ? 'ts' : 'm3u8';
}
