// ───────────────────── Weekend guard (bots-engine) ─────────────────────
// Pure, side-effect-free decision logic for the automated trading bots, shared
// with the end-to-end weekend integration test. Spot Forex / Gold / Oil are
// CLOSED Friday 22:00 UTC → Sunday 22:00 UTC; crypto trades 24/7. Keeping this
// here lets a test prove — by simulating Saturday/Sunday — that non-crypto bots
// never open new trades during the closure, so a refactor can't reintroduce it.

export const FX_OPEN_DOW = 0; // Sunday
export const FX_OPEN_HOUR_UTC = 22; // Sunday 22:00 UTC reopen
export const FX_CLOSE_DOW = 5; // Friday
export const FX_CLOSE_HOUR_UTC = 22; // Friday 22:00 UTC close

/** True when the FX / metals / energy market is CLOSED for the weekend. */
export function isForexMarketClosed(d = new Date()): boolean {
  const dow = d.getUTCDay(); // 0=Sun … 6=Sat
  const h = d.getUTCHours();
  if (dow === 6) return true; // all of Saturday
  if (dow === FX_OPEN_DOW) return h < FX_OPEN_HOUR_UTC; // Sunday before 22:00
  if (dow === FX_CLOSE_DOW) return h >= FX_CLOSE_HOUR_UTC; // Friday from 22:00
  return false; // Mon–Thu
}

/**
 * Should a bot be blocked from opening NEW trades because of the weekend closure?
 * Non-crypto symbols are blocked Fri 22:00 → Sun 22:00 UTC; crypto is never blocked.
 */
export function botWeekendBlocked(isCrypto: boolean, now = new Date()): boolean {
  return !isCrypto && isForexMarketClosed(now);
}
