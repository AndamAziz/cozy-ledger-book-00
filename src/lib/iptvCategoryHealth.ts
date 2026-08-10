/**
 * Per-category live-stream health.
 *
 * Every rendered category registers a small sample of its channels; a single
 * background worker re-probes those samples on a timer (1-byte Range requests,
 * never holding a viewing slot open) and publishes an "online x/y" verdict plus
 * the time it was measured, so the UI can show updated / stale badges.
 *
 * Concurrency is deliberately 1 — single-slot provider lines must never be
 * hammered by a grid of categories.
 */

import { isSlotLimitPayload } from './iptvSlotRetry';
import { idle, onIdle, tabHidden } from './idle';

/** A verdict older than this is shown as "stale" and re-probed. */
export const CATEGORY_TTL_MS = 5 * 60 * 1000;
/** How often the background worker looks for stale categories. */
export const CATEGORY_SWEEP_MS = 60 * 1000;
/** Channels sampled per category. */
export const CATEGORY_SAMPLE = 3;

export interface CategoryHealth {
  /** Channels that answered out of the sampled set. */
  online: number;
  total: number;
  /** ISO timestamp of the last completed probe, null when never measured. */
  checkedAt: string | null;
  checking: boolean;
}

const EMPTY: CategoryHealth = { online: 0, total: 0, checkedAt: null, checking: false };

const state = new Map<string, CategoryHealth>();
const samples = new Map<string, string[]>();
const listeners = new Map<string, Set<(h: CategoryHealth) => void>>();
const queue: string[] = [];
let running = false;
let sweeper: ReturnType<typeof setInterval> | null = null;

export function isStale(health: CategoryHealth, now = Date.now()): boolean {
  return !health.checkedAt || now - new Date(health.checkedAt).getTime() >= CATEGORY_TTL_MS;
}

export function getCategoryHealth(id: string): CategoryHealth {
  return state.get(id) ?? EMPTY;
}

function emit(id: string) {
  const h = getCategoryHealth(id);
  listeners.get(id)?.forEach((fn) => fn(h));
}

function set(id: string, patch: Partial<CategoryHealth>) {
  state.set(id, { ...getCategoryHealth(id), ...patch });
  emit(id);
}

async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', Range: 'bytes=0-0' },
      cache: 'no-store',
    });
    if (res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return true;
    }
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json')) {
      await res.body?.cancel().catch(() => undefined);
      return false;
    }
    // A slot-limit refusal means the channel exists and the line is simply busy.
    return isSlotLimitPayload(await res.json().catch(() => null));
  } catch {
    return false;
  }
}

async function run() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      // Never compete with the user: every step waits for an idle slot, and the
      // whole sweep pauses while the tab is in the background.
      if (tabHidden()) break;
      await idle();
      const id = queue.shift()!;
      const urls = (samples.get(id) ?? []).slice(0, CATEGORY_SAMPLE);
      if (!urls.length) continue;
      set(id, { checking: true });
      let online = 0;
      for (const url of urls) {
        if (await probe(url)) online += 1;
        await idle();
      }
      set(id, { online, total: urls.length, checkedAt: new Date().toISOString(), checking: false });
    }
  } finally {
    running = false;
  }
}

function enqueue(id: string) {
  if (queue.includes(id) || getCategoryHealth(id).checking) return;
  queue.push(id);
  // Kick the worker off the render path — probes must never delay a paint.
  onIdle(() => void run(), 1000);
}

/** Register (or update) the sample of channel URLs representing a category. */
export function registerCategorySample(id: string, urls: string[]) {
  if (!urls.length) return;
  samples.set(id, urls.slice(0, CATEGORY_SAMPLE));
  // Do not probe playable stream URLs while the viewer browses. Even a one-byte
  // Range request opens a real Xtream viewing connection on many panels, and a
  // category grid can therefore consume the account's only slot before Play is
  // pressed. Provider-level health remains the safe catalogue/auth signal.
}

export function unregisterCategorySample(id: string) {
  samples.delete(id);
}

/** Force an immediate re-probe (used by manual refresh). */
export function refreshCategoryHealth(id?: string) {
  if (id) {
    state.delete(id);
    emit(id);
    return;
  }
  samples.forEach((_urls, key) => {
    state.delete(key);
    emit(key);
  });
}

/**
 * Category stream probing is deliberately disabled. A Range request still
 * opens a real viewer on many Xtream panels, so even a serial sweep eventually
 * fills/holds the same account's slots while the user is only browsing.
 */
export function startCategoryHealthSweep(): () => void {
  return () => undefined;
}

export function subscribeCategoryHealth(id: string, fn: (h: CategoryHealth) => void): () => void {
  const set_ = listeners.get(id) ?? new Set<(h: CategoryHealth) => void>();
  set_.add(fn);
  listeners.set(id, set_);
  return () => {
    set_.delete(fn);
    if (!set_.size) listeners.delete(id);
  };
}
