import type { AssetClass } from "@/lib/botAssets";

export interface MarketStatus {
  open: boolean;
  /** Next time the status flips (UTC Date), or null for 24/7 markets. */
  nextChange: Date | null;
  /** Human label, e.g. "Open", "Closed · opens Sun 22:00". */
  label: string;
}

/**
 * Spot Forex & Metals trade roughly Sunday 22:00 UTC → Friday 22:00 UTC.
 * Crypto is 24/7. This is an approximation (ignores holidays / DST shifts of ~1h)
 * but is accurate enough to tell users whether the market is live.
 */
const OPEN_HOUR_UTC = 22; // Sunday open
const CLOSE_HOUR_UTC = 22; // Friday close

/**
 * Hours each market is open per week.
 *  • FX / Metals: Sunday 22:00 UTC → Friday 22:00 UTC = one continuous 120-hour block.
 *  • Crypto: 24/7 = 168 hours.
 */
export const FX_WEEKLY_HOURS = 120;
export const CRYPTO_WEEKLY_HOURS = 168;

export interface MarketSchedule {
  /** True for crypto (never closes). */
  alwaysOpen: boolean;
  /** Open hours per week. */
  weeklyHours: number;
  /** Weekly open instant, e.g. "Sun 22:00 UTC" (empty for 24/7 markets). */
  opensLabel: string;
  /** Weekly close instant, e.g. "Fri 22:00 UTC" (empty for 24/7 markets). */
  closesLabel: string;
}

/** Static weekly schedule for a market (independent of the current time). */
export function getMarketSchedule(assetClass: AssetClass): MarketSchedule {
  if (assetClass === "crypto") {
    return { alwaysOpen: true, weeklyHours: CRYPTO_WEEKLY_HOURS, opensLabel: "", closesLabel: "" };
  }
  return {
    alwaysOpen: false,
    weeklyHours: FX_WEEKLY_HOURS,
    opensLabel: "Sun 22:00 UTC",
    closesLabel: "Fri 22:00 UTC",
  };
}

function nextWeekday(from: Date, targetDow: number, hourUtc: number): Date {
  const d = new Date(from);
  d.setUTCHours(hourUtc, 0, 0, 0);
  let diff = (targetDow - d.getUTCDay() + 7) % 7;
  if (diff === 0 && d.getTime() <= from.getTime()) diff = 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function forexStatus(now: Date): MarketStatus {
  const dow = now.getUTCDay(); // 0 = Sun ... 6 = Sat
  const hour = now.getUTCHours();

  let open: boolean;
  if (dow === 6) open = false; // Saturday: closed
  else if (dow === 0) open = hour >= OPEN_HOUR_UTC; // Sunday: opens 22:00
  else if (dow === 5) open = hour < CLOSE_HOUR_UTC; // Friday: closes 22:00
  else open = true; // Mon–Thu

  if (open) {
    // Next close is Friday 22:00 UTC
    const close = nextWeekday(now, 5, CLOSE_HOUR_UTC);
    return { open: true, nextChange: close, label: "Open" };
  }
  // Next open is Sunday 22:00 UTC
  const nextOpen = nextWeekday(now, 0, OPEN_HOUR_UTC);
  return {
    open: false,
    nextChange: nextOpen,
    label: `Closed · opens ${fmtWhen(nextOpen)}`,
  };
}

function fmtWhen(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }) + " UTC";
}

export function getMarketStatus(assetClass: AssetClass, now = new Date()): MarketStatus {
  if (assetClass === "crypto") {
    return { open: true, nextChange: null, label: "Open 24/7" };
  }
  return forexStatus(now);
}

/** Short countdown like "2d 4h" or "3h 12m" until the given date. */
export function timeUntil(target: Date | null, now = new Date()): string {
  if (!target) return "";
  let ms = target.getTime() - now.getTime();
  if (ms <= 0) return "";
  const d = Math.floor(ms / 86400000);
  ms -= d * 86400000;
  const h = Math.floor(ms / 3600000);
  ms -= h * 3600000;
  const m = Math.floor(ms / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Live digital countdown like "47:23:10" (HH:MM:SS) or "1d 04:12:30" when more
 * than a day remains. Returns "" once the target time has passed.
 */
export function countdownDigits(target: Date | null, now = new Date()): string {
  if (!target) return "";
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return "";
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(h)}:${pad(m)}:${pad(s)}`;
  return d > 0 ? `${d}d ${clock}` : clock;
}
