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
  /** Panel advertises HLS and nothing else -- `.ts` is not available. */
  hlsOnly?: boolean;
  /** Content-Type already observed for this channel, when known. */
  contentType?: string | null;
}): LiveEngine[] {
  // A panel the server has confirmed serves ONLY transport streams (no HLS at
  // all) has no other option -- mpegts.js must lead, hls.js would just fail.
  if (opts.tsOnly) {
    return ['mpegts', 'native'];
  }
  // FLIPPED BACK to hls.js-first, matching the server's candidate order: a
  // live screenshot of the proven-working reference implementation showed it
  // holding one stable HLS/XHR segment stream continuously for minutes with
  // zero switching between request types on this exact single-slot account.
  // The client and server must always agree on which container they are
  // asking for, so this stays in lockstep with liveFormatOrder() server-side.
  const chain: LiveEngine[] = opts.hlsSupported
    ? opts.nativeHls
      ? ['native', 'hls', 'mpegts']
      : ['hls', 'mpegts', 'native']
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
