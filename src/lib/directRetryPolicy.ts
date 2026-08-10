/**
 * Retry policy for direct (provider → browser) playback.
 *
 * Two goals, both about minimising buffering:
 *  1. Never abandon direct playback because of one unlucky attempt — but never
 *     keep probing a provider that clearly cannot serve the browser either.
 *  2. Never retry excessively: every wait is bounded, jittered and escalating,
 *     so a struggling provider is not hammered and the viewer is not stuck on a
 *     spinner.
 *
 * State is per source (a provider account) and persisted so the cost of learning
 * "direct does not work here" is paid once, not on every channel or page load.
 */

/** Consecutive direct failures tolerated before direct playback is parked. */
export const DIRECT_FAIL_THRESHOLD = 2;

/** Escalating park windows, indexed by strikes beyond the threshold. */
const PARK_LADDER_MS = [10 * 60 * 1000, 45 * 60 * 1000, 6 * 60 * 60 * 1000];

/** Strikes decay after a quiet period — a transient outage must not park forever. */
const STRIKE_DECAY_MS = 12 * 60 * 60 * 1000;

export interface DirectState {
  /** Consecutive failures since the last successful direct playback. */
  strikes: number;
  /** Epoch ms until which direct playback must not be attempted. */
  parkedUntil: number;
  /** Epoch ms of the last recorded failure (drives strike decay). */
  at: number;
}

const EMPTY: DirectState = { strikes: 0, parkedUntil: 0, at: 0 };

const key = (source: string | null) => `iptv-direct-state:${source ?? 'default'}`;

export function readDirectState(source: string | null, now = Date.now()): DirectState {
  try {
    const raw = localStorage.getItem(key(source));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<DirectState>;
    const state: DirectState = {
      strikes: Number(parsed.strikes) || 0,
      parkedUntil: Number(parsed.parkedUntil) || 0,
      at: Number(parsed.at) || 0,
    };
    // Quiet for long enough → forget the strikes and re-allow direct playback.
    if (state.at > 0 && now - state.at > STRIKE_DECAY_MS) return EMPTY;
    return state;
  } catch {
    return EMPTY;
  }
}

function writeDirectState(source: string | null, state: DirectState) {
  try {
    localStorage.setItem(key(source), JSON.stringify(state));
  } catch {
    // storage disabled — in-memory caching in the caller still avoids loops
  }
}

/** Park length for a given strike count (0 = do not park yet). */
export function parkMsFor(strikes: number): number {
  if (strikes < DIRECT_FAIL_THRESHOLD) return 0;
  const i = Math.min(strikes - DIRECT_FAIL_THRESHOLD, PARK_LADDER_MS.length - 1);
  return PARK_LADDER_MS[i];
}

/** A direct attempt failed: add a strike and park once the threshold is hit. */
export function recordDirectFailure(source: string | null, now = Date.now()): DirectState {
  const prev = readDirectState(source, now);
  const strikes = prev.strikes + 1;
  const park = parkMsFor(strikes);
  const next: DirectState = {
    strikes,
    parkedUntil: park > 0 ? now + park : 0,
    at: now,
  };
  writeDirectState(source, next);
  return next;
}

/** Direct playback actually produced frames: wipe the strike history. */
export function recordDirectSuccess(source: string | null) {
  try {
    localStorage.removeItem(key(source));
  } catch {
    // ignore
  }
}

/** True while direct playback is parked for this source. */
export function isDirectParked(source: string | null, now = Date.now()): boolean {
  const state = readDirectState(source, now);
  return state.parkedUntil > now;
}

/**
 * How long to wait for the first frame of a direct attempt.
 *
 * A healthy provider delivers almost immediately, so the budget starts generous
 * enough for a slow mobile network and tightens with every recent failure —
 * the failover to the proven proxy path then happens sooner, not later.
 */
export function directConnectBudgetMs(strikes: number): number {
  const budgets = [9_000, 6_000, 4_500];
  return budgets[Math.min(Math.max(strikes, 0), budgets.length - 1)];
}

/**
 * Backoff between full engine-ladder retries: jittered exponential, hard-capped.
 * Jitter keeps several players/tabs from re-dialling a single-slot provider in
 * lockstep.
 */
export function ladderRetryDelay(attempt: number, base = 4_000, cap = 20_000): number {
  const raw = Math.min(cap, base * 2 ** Math.max(0, attempt));
  const jitter = raw * 0.25;
  return Math.round(raw - jitter + Math.random() * jitter * 2);
}
