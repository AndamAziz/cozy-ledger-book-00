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

/** True when a proxy JSON payload signals the provider slot limit. */
export function isSlotLimitPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const { code, error } = payload as { code?: unknown; error?: unknown };
  if (code === 'SLOT_LIMIT') return true;
  return typeof error === 'string' && /viewing slots/i.test(error);
}

/** Probe a proxy stream URL and report whether it failed because of the slot limit. */
export async function probeSlotLimit(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) return false;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json')) return false;
    return isSlotLimitPayload(await res.json());
  } catch {
    return false;
  }
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
