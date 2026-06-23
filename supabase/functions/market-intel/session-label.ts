// Forex session label for the Telegram signal MESSAGE.
//
// This MUST stay in sync with the app's Confluence "Forex Sessions" panel
// (src/lib/aiAnalysis.ts → getSessionStatuses). UTC windows:
//   Asian     00:00 – 09:00
//   London    08:00 – 17:00
//   New York  13:00 – 22:00
// The market is closed on the weekend (Sat all day, Sun until 22:00 UTC) —
// matching the same weekend rule used by the Confluence panel.
//
// The label picks the highest-liquidity session currently open
// (New York → London → Asian) and returns "Markets Quiet" when none is open,
// instead of guessing the nearest upcoming session. The 📍 prefix is added by
// the caller.

export interface ConfluenceSession {
  name: string;
  ku: string;
  emoji: string;
  /** Open hour (UTC), inclusive. */
  open: number;
  /** Close hour (UTC), exclusive. */
  close: number;
}

// Priority order: highest-liquidity session first.
export const CONFLUENCE_SESSIONS: ConfluenceSession[] = [
  { name: "New York", ku: "نیویۆرک", emoji: "🌎", open: 13, close: 22 },
  { name: "London", ku: "لەندەن", emoji: "🌍", open: 8, close: 17 },
  { name: "Asian", ku: "ئاسیا", emoji: "🌏", open: 0, close: 9 },
];

export const MARKETS_QUIET_LABEL = "Markets Quiet / بازاڕ کپە";

/** Same weekend rule as the Confluence panel: Sat all day, Sun before 22:00 UTC. */
export function isWeekendClosed(d: Date): boolean {
  return d.getUTCDay() === 6 || (d.getUTCDay() === 0 && d.getUTCHours() < 22);
}

export function sessionDisplayLabel(d = new Date()): string {
  if (!isWeekendClosed(d)) {
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
    for (const s of CONFLUENCE_SESSIONS) {
      if (hour >= s.open && hour < s.close) return `${s.emoji} ${s.name} (${s.ku})`;
    }
  }
  return MARKETS_QUIET_LABEL;
}
