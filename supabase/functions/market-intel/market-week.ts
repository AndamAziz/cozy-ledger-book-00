// ───────────────────── Forex / Metals / Energy market WEEK (UTC) ─────────────────────
// Spot Forex, Gold/Silver and Oil trade a continuous week that:
//   • OPENS  Sunday 22:00 UTC (Sydney open · 17:00 ET)
//   • CLOSES Friday 22:00 UTC (NY close   · 17:00 ET)
// and are CLOSED for the entire weekend in between.
// Crypto (BTC/ETH/…) is 24/7 and is intentionally NOT affected by any of this.
//
// This module is the single source of truth for "is the FX/metals market open?"
// and is unit-tested in market-week.test.ts so weekend behaviour can be proven
// by simulating Saturday/Sunday dates.

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
  return false; // Mon–Thu: open
}

/** Convenience inverse of {@link isForexMarketClosed}. */
export function isForexMarketOpen(d = new Date()): boolean {
  return !isForexMarketClosed(d);
}

/** Next time the FX market reopens (Sunday 22:00 UTC) as an absolute Date. */
export function nextForexOpen(from = new Date()): Date {
  const d = new Date(from);
  d.setUTCHours(FX_OPEN_HOUR_UTC, 0, 0, 0);
  let diff = (FX_OPEN_DOW - d.getUTCDay() + 7) % 7;
  if (diff === 0 && d.getTime() <= from.getTime()) diff = 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/** Next time the FX market closes (Friday 22:00 UTC) as an absolute Date. */
export function nextForexClose(from = new Date()): Date {
  const d = new Date(from);
  d.setUTCHours(FX_CLOSE_HOUR_UTC, 0, 0, 0);
  let diff = (FX_CLOSE_DOW - d.getUTCDay() + 7) % 7;
  if (diff === 0 && d.getTime() <= from.getTime()) diff = 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/** "Sun 22:00 UTC" style label for a Date. */
export function fxWhen(dt: Date): string {
  return (
    dt.toLocaleString("en-GB", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) + " UTC"
  );
}
