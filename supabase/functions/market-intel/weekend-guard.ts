// ───────────────────── Weekend guard: single decision module ─────────────────────
// Pure, side-effect-free decision logic shared by the market-intel handler (signal
// generation + market open/close Telegram cards) and exercised directly by the
// end-to-end weekend integration test. Keeping these decisions here — instead of
// inline inside the giant index.ts handler — means a test can prove the weekend
// behaviour deterministically by simulating Saturday/Sunday datetimes, so a future
// refactor cannot silently reintroduce the "Asia session opened on Saturday" bug.

import {
  FX_CLOSE_DOW,
  FX_CLOSE_HOUR_UTC,
  FX_OPEN_DOW,
  FX_OPEN_HOUR_UTC,
  isForexMarketClosed,
} from "./market-week.ts";

export interface MarketTransition {
  /** "open" = Sunday 22:00 UTC reopen, "close" = Friday 22:00 UTC close. */
  kind: "open" | "close";
  /** Calendar date (UTC) of the transition, e.g. "2026-06-19". */
  day: string;
  /**
   * Globally-unique, week-anchored idempotency key for this exact transition,
   * e.g. "Market:close:2026-06-19" or "Market:open:2026-06-21". The same
   * transition always maps to the same key, so it can be claimed ONCE in the DB
   * and never re-sent — even across cron retries or overlapping invocations.
   */
  key: string;
}

/**
 * Which weekend market transition (if any) fires in the CURRENT UTC hour.
 * Returns null on every other hour — including all weekend hours that are not
 * the exact open/close moment, so notifications never fire mid-weekend.
 */
export function dueMarketTransition(now = new Date()): MarketTransition | null {
  const dow = now.getUTCDay(); // 0=Sun … 6=Sat
  const hour = now.getUTCHours();
  const day = now.toISOString().slice(0, 10);
  if (dow === FX_CLOSE_DOW && hour === FX_CLOSE_HOUR_UTC) {
    return { kind: "close", day, key: `Market:close:${day}` };
  }
  if (dow === FX_OPEN_DOW && hour === FX_OPEN_HOUR_UTC) {
    return { kind: "open", day, key: `Market:open:${day}` };
  }
  return null;
}

/**
 * May a per-session asset open a NEW signal right now?
 * - Crypto (requireSession=false) → always (24/7).
 * - Gold / Oil / Forex (requireSession=true) → only while the FX market is open,
 *   i.e. NOT during the Friday 22:00 → Sunday 22:00 UTC weekend closure.
 */
export function signalAllowed(requireSession: boolean, now = new Date()): boolean {
  if (!requireSession) return true;
  return !isForexMarketClosed(now);
}

/**
 * Should a "session open" / per-session post be suppressed right now?
 * True for the entire weekend closure window (no FX session is ever "open" then).
 */
export function sessionPostsSuppressed(now = new Date()): boolean {
  return isForexMarketClosed(now);
}

/**
 * Should a bot be blocked from opening NEW trades because of the weekend closure?
 * Non-crypto symbols are blocked Fri 22:00 → Sun 22:00 UTC; crypto is never blocked.
 */
export function botWeekendBlocked(isCrypto: boolean, now = new Date()): boolean {
  return !isCrypto && isForexMarketClosed(now);
}
