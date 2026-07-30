/**
 * Helpers for recovering from the IPTV provider's "all viewing slots in use" limit.
 * The proxy tags those responses with `code: 'SLOT_LIMIT'`.
 */

export const SLOT_LIMIT_MESSAGE = 'All viewing slots are in use right now. Try again in a moment.';

/** How many times we silently refresh the same stream before switching episodes. */
export const SLOT_MAX_RETRIES = 3;

/** Exponential-ish backoff (ms) between silent refreshes. */
export function slotRetryDelay(attempt: number): number {
  return Math.min(2000 * 2 ** Math.max(0, attempt), 12000);
}

/** How many times playback silently restarts after a generic (non-slot) failure. */
export const AUTO_MAX_RETRIES = 3;

/** Backoff (ms) between automatic restarts after a stall or engine failure. */
export function autoRetryDelay(attempt: number): number {
  return Math.min(1500 * 2 ** Math.max(0, attempt), 8000);
}

/** Milliseconds of frozen currentTime before playback is considered stalled. */
export const STALL_TIMEOUT_MS = 15000;

/**
 * Milliseconds allowed for the very first frame before the engine chain
 * escalates. Slow single-slot IPTV proxies routinely need 20–30s to deliver
 * the first segments, so a short window abandoned healthy streams.
 */
export const CONNECT_TIMEOUT_MS = 40000;



/** True when a proxy JSON payload signals the provider slot limit. */
export function isSlotLimitPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const { code, error } = payload as { code?: unknown; error?: unknown };
  if (code === 'SLOT_LIMIT') return true;
  return typeof error === 'string' && /viewing slots/i.test(error);
}

/** True for HTTP statuses used by IPTV panels/proxy responses when the line is full. */
export function isSlotLimitStatus(status: number): boolean {
  return status === 429 || status === 458 || status === 407;
}

/** Message shown when the provider refuses playback from our server's country. */
export const GEO_BLOCK_MESSAGE =
  'The provider blocks streaming from this server’s country. Ask your IPTV provider to allow it.';

/** True when a proxy JSON payload signals a provider geo restriction. */
export function isGeoBlockPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const { code, error } = payload as { code?: unknown; error?: unknown };
  if (code === 'GEO_BLOCK') return true;
  return typeof error === 'string' && /country/i.test(error);
}

export type StreamFailure = 'slot' | 'geo' | 'other';

/** Probe a proxy stream URL and classify why it failed. */
export async function probeStreamFailure(url: string): Promise<StreamFailure> {
  try {
    // Ask for a single byte and abort straight after, so the probe never holds
    // a second viewing slot open against the provider.
    const res = await fetch(url, { headers: { Accept: 'application/json', Range: 'bytes=0-0' } });
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json')) {
      await res.body?.cancel();
      if (res.status === 451) return 'geo';
      return isSlotLimitStatus(res.status) ? 'slot' : 'other';
    }
    const payload = await res.json();
    if (isGeoBlockPayload(payload)) return 'geo';
    if (isSlotLimitPayload(payload)) return 'slot';
    return 'other';
  } catch {
    return 'other';
  }
}

/** Probe a proxy stream URL and report whether it failed because of the slot limit. */
export async function probeSlotLimit(url: string): Promise<boolean> {
  return (await probeStreamFailure(url)) === 'slot';
}

/**
 * Pick the first episode that has not already hit the slot limit.
 * Returns null when every episode has been tried.
 */
export function firstAvailableEpisode<T extends { id: string }>(
  episodes: T[],
  exhaustedIds: Iterable<string>,
): T | null {
  const skip = new Set(exhaustedIds);
  return episodes.find((e) => !skip.has(e.id)) ?? null;
}
