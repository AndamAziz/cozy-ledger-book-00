/**
 * Client-side channel health cache.
 *
 * Cards ask for a channel's status; the queue probes the proxy with a 1-byte
 * Range request (never holds a viewing slot open), caches the verdict and
 * notifies every subscribed card. Concurrency is deliberately tiny so browsing
 * a grid never hammers the provider.
 */

import { isSlotLimitPayload } from './iptvSlotRetry';

export type ChannelStatus = 'unknown' | 'checking' | 'online' | 'busy' | 'offline';

/** How long a verdict is trusted before we re-probe. */
export const CHANNEL_TTL_MS = 5 * 60 * 1000;
const MAX_PARALLEL = 2;

interface Entry {
  status: ChannelStatus;
  at: number;
}

const cache = new Map<string, Entry>();
const listeners = new Map<string, Set<(s: ChannelStatus) => void>>();
const queue: { key: string; url: string }[] = [];
let running = 0;

export function classifyProbe(ok: boolean, slotLimited: boolean): ChannelStatus {
  if (ok) return 'online';
  return slotLimited ? 'busy' : 'offline';
}

export function isFresh(entry: Entry | undefined, now = Date.now()): boolean {
  return !!entry && now - entry.at < CHANNEL_TTL_MS;
}

export function getChannelStatus(key: string): ChannelStatus {
  const entry = cache.get(key);
  return isFresh(entry) ? entry!.status : 'unknown';
}

function emit(key: string, status: ChannelStatus) {
  listeners.get(key)?.forEach((fn) => fn(status));
}

function set(key: string, status: ChannelStatus, at = Date.now()) {
  cache.set(key, { status, at });
  emit(key, status);
}

/** Drop cached verdicts so the next render re-probes (used by the periodic sweep). */
export function invalidateChannelStatuses() {
  cache.clear();
  queue.length = 0;
  listeners.forEach((set_, key) => set_.forEach((fn) => fn(getChannelStatus(key))));
}

async function probe(url: string): Promise<ChannelStatus> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', Range: 'bytes=0-0' },
      cache: 'no-store',
    });
    if (res.ok) {
      await res.body?.cancel();
      return 'online';
    }
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json')) {
      await res.body?.cancel();
      return 'offline';
    }
    return classifyProbe(false, isSlotLimitPayload(await res.json()));
  } catch {
    return 'offline';
  }
}

function pump() {
  if (tabHidden()) return;
  while (running < MAX_PARALLEL && queue.length) {
    const job = queue.shift()!;
    running += 1;
    probe(job.url)
      .then((status) => set(job.key, status))
      .finally(() => {
        running -= 1;
        // Yield back to the browser before the next probe so grid scrolling and
        // taps always win over background health checks.
        onIdle(pump, 1000);
      });
  }
}

/** Queue a probe when the cached verdict is missing or stale. */
export function requestChannelStatus(key: string, url: string) {
  const entry = cache.get(key);
  if (isFresh(entry) || entry?.status === 'checking') return;
  if (queue.some((j) => j.key === key)) return;
  set(key, 'checking', 0); // at=0 so 'checking' never counts as a fresh verdict
  cache.set(key, { status: 'checking', at: 0 });
  queue.push({ key, url });
  onIdle(pump, 1000);
}

export function subscribeChannelStatus(key: string, fn: (s: ChannelStatus) => void): () => void {
  const set_ = listeners.get(key) ?? new Set();
  set_.add(fn);
  listeners.set(key, set_);
  return () => {
    set_.delete(fn);
    if (!set_.size) listeners.delete(key);
  };
}
