// Single source of truth for Forex trading sessions across the whole app:
//   • the on-screen Confluence "Forex Sessions" cards (AIAnalysisPanel)
//   • the canonical signal engine (buildAssetSignal)
//   • the Telegram signal MESSAGE session label
//
// All three call isSessionOpen()/sessionDisplayLabel() from here so they can
// never drift apart again.
//
// UTC windows (a session whose `close` <= `open` wraps past midnight):
//   Asian     22:00 – 07:00  (wraps midnight)
//   London    08:00 – 17:00
//   New York  13:00 – 22:00
//
// The market is closed on the weekend (Sat all day, Sun until 22:00 UTC).

export type SessionName = "Asian" | "London" | "New York";

export interface FxSession {
  name: SessionName;
  ku: string;
  emoji: string;
  /** Open hour (UTC), inclusive. */
  open: number;
  /** Close hour (UTC), exclusive. May be <= open when the window wraps midnight. */
  close: number;
}

// Listed in highest-liquidity-first priority order (used to pick ONE label when
// several sessions overlap): New York → London → Asian.
export const FX_SESSIONS: FxSession[] = [
  { name: "New York", ku: "نیویۆرک", emoji: "🌎", open: 13, close: 22 },
  { name: "London", ku: "لەندەن", emoji: "🌍", open: 8, close: 17 },
  { name: "Asian", ku: "ئاسیا", emoji: "🌏", open: 22, close: 7 },
];

export const MARKETS_QUIET_LABEL = "Markets Quiet / بازاڕ کپە";

/** Weekend market closure: Sat all day, Sun before 22:00 UTC. */
export function isWeekendClosed(d: Date): boolean {
  return d.getUTCDay() === 6 || (d.getUTCDay() === 0 && d.getUTCHours() < 22);
}

/** Whether a fractional UTC hour falls inside a (possibly wrapping) window. */
function inWindow(hour: number, open: number, close: number): boolean {
  return open <= close ? hour >= open && hour < close : hour >= open || hour < close;
}

/** Is the given session currently open? Respects the weekend market closure. */
export function isSessionOpen(session: FxSession, d = new Date()): boolean {
  if (isWeekendClosed(d)) return false;
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
  return inWindow(hour, session.open, session.close);
}

/**
 * Forex session label for the Telegram signal MESSAGE. Picks the highest-liquidity
 * session currently open (New York → London → Asian) and returns "Markets Quiet"
 * when none is open. The 📍 prefix is added by the caller.
 */
export function sessionDisplayLabel(d = new Date()): string {
  for (const s of FX_SESSIONS) {
    if (isSessionOpen(s, d)) return `${s.emoji} ${s.name} (${s.ku})`;
  }
  return MARKETS_QUIET_LABEL;
}
