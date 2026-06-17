// Frontend mirror of the bot engine's trading-session rules (all times UTC).
// Keep these in sync with supabase/functions/bots-engine/index.ts.

export const DAILY_LOSS_LIMIT_USD = 20;
export const DAILY_PROFIT_TARGET_USD = 50;
export const NEWS_BLOCK_NEW_MIN = 60; // minutes before a high-impact USD event

export interface TradeWindow {
  start: number; // UTC hour, inclusive
  end: number; // UTC hour, exclusive
  label: string;
  short: string;
}

// Only trade the high-liquidity London & NY windows; the Asian session is skipped.
export const TRADE_WINDOWS_UTC: TradeWindow[] = [
  { start: 7, end: 11, label: "London open (07:00-11:00 UTC)", short: "London" },
  { start: 13, end: 16, label: "NY open (13:00-16:00 UTC)", short: "NY" },
];

/** The trade window active right now, or null when outside trading hours. */
export function getActiveWindow(date = new Date()): TradeWindow | null {
  const h = date.getUTCHours();
  return TRADE_WINDOWS_UTC.find((w) => h >= w.start && h < w.end) ?? null;
}

/** Map any UTC hour to a session label (for "sessions traded" attribution). */
export function sessionForHour(utcHour: number): "London" | "NY" | "Asian" | "Off" {
  if (utcHour >= 7 && utcHour < 11) return "London";
  if (utcHour >= 13 && utcHour < 16) return "NY";
  if (utcHour >= 0 && utcHour < 8) return "Asian";
  return "Off";
}

/** Next window start as an absolute Date (today or tomorrow). */
export function nextWindowOpen(date = new Date()): { window: TradeWindow; at: Date } {
  const candidates: { window: TradeWindow; at: Date }[] = [];
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    for (const w of TRADE_WINDOWS_UTC) {
      const at = new Date(date);
      at.setUTCDate(at.getUTCDate() + dayOffset);
      at.setUTCHours(w.start, 0, 0, 0);
      if (at.getTime() > date.getTime()) candidates.push({ window: w, at });
    }
  }
  candidates.sort((a, b) => a.at.getTime() - b.at.getTime());
  return candidates[0];
}

/** Human countdown like "2h 15m" or "8m". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}
