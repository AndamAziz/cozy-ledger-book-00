/**
 * Catalogue plumbing shared by every IPTV surface (Live TV, Movies, Series).
 *
 * The upstream provider account allows a single simultaneous connection, so the
 * client must behave: cache aggressively, never fire parallel provider calls and
 * back off instead of hammering on failure.
 */

const TTL_MS = 60 * 60 * 1000; // 1 hour — categories/playlists barely change
/** Beyond the TTL an entry is still served instantly, then refreshed in the background. */
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const PREFIX = 'iptv:cat:';

type Entry<T> = { t: number; v: T };

/** Raw cache entry with a freshness flag (stale entries are still usable). */
export function readCatalogEntry<T>(key: string): { value: T; fresh: boolean } | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (!entry || typeof entry.t !== 'number') return null;
    const age = Date.now() - entry.t;
    if (age > STALE_MS) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return { value: entry.v, fresh: age <= TTL_MS };
  } catch {
    return null;
  }
}

/** Cached catalogue payload, or null when missing/expired/corrupt. */
export function readCatalogCache<T>(key: string): T | null {
  const hit = readCatalogEntry<T>(key);
  return hit?.fresh ? hit.value : null;
}

export function writeCatalogCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), v: value } satisfies Entry<T>));
  } catch {
    // Quota exceeded → drop the whole catalogue cache and keep going.
    clearCatalogCache();
  }
}


/** Wipe every cached catalogue entry (used by the hard refresh button). */
export function clearCatalogCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

/**
 * Sequential request queue: only one catalogue request is in flight at a time,
 * so a screen that mounts several category sections can never open several
 * provider connections at once.
 *
 * Background (prefetch) work runs in a separate lane that yields to anything the
 * user is actually waiting for: a tap must never queue behind 8 warm-up calls.
 */
type Job = { run: () => void; cancel: () => void };
const waiting: { fg: Job[]; bg: Job[] } = { fg: [], bg: [] };
let busy = false;

function pump() {
  if (busy) return;
  const job = waiting.fg.shift() ?? waiting.bg.shift();
  if (!job) return;
  busy = true;
  job.run();
}

export function queued<T>(task: () => Promise<T>, opts: { background?: boolean } = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const job: Job = {
      cancel: () => reject(new Error('cancelled')),
      run: () => {
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            busy = false;
            pump();
          });
      },
    };
    (opts.background ? waiting.bg : waiting.fg).push(job);
    pump();
  });
}

/** Drop queued prefetch work (called when the user asks for something now). */
export function cancelBackgroundQueue() {
  const dropped = waiting.bg.splice(0, waiting.bg.length);
  dropped.forEach((j) => j.cancel());
}


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Transient upstream conditions worth a delayed retry. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status === 458 || status >= 500;
}

export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 3500;

/**
 * Fetch with a hard retry ceiling (3 attempts) and a fixed 3.5s backoff — the
 * provider punishes bursts with 429/458, so slow-and-few beats fast-and-many.
 */
export async function fetchWithBackoff(
  url: string,
  init: RequestInit,
  opts: { retries?: number; delayMs?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? MAX_RETRIES;
  const delayMs = opts.delayMs ?? RETRY_DELAY_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, init);
      if (!res.ok && isRetryableStatus(res.status) && attempt < retries) {
        await res.body?.cancel().catch(() => undefined);
        await sleep(delayMs * attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt >= retries) break;
      await sleep(delayMs * attempt);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Could not reach the streaming service. Please try again.');
}
