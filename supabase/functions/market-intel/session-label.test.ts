import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CONFLUENCE_SESSIONS,
  isWeekendClosed,
  MARKETS_QUIET_LABEL,
  sessionDisplayLabel,
} from "./session-label.ts";

// ── Independent re-implementation of the Confluence panel rule ──
// Mirrors src/lib/aiAnalysis.ts → getSessionStatuses (the on-screen
// "Forex Sessions" display). The Telegram label MUST agree with it.
const PANEL_SESSIONS = [
  { name: "Asian", emoji: "🌏", ku: "ئاسیا", openUtc: 0, closeUtc: 9 },
  { name: "London", emoji: "🌍", ku: "لەندەن", openUtc: 8, closeUtc: 17 },
  { name: "New York", emoji: "🌎", ku: "نیویۆرک", openUtc: 13, closeUtc: 22 },
];

function panelActiveSessions(now: Date): typeof PANEL_SESSIONS {
  const weekend = now.getUTCDay() === 6 || (now.getUTCDay() === 0 && now.getUTCHours() < 22);
  if (weekend) return [];
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  return PANEL_SESSIONS.filter((s) => hour >= s.openUtc && hour < s.closeUtc);
}

// Expected Telegram label = highest-liquidity active session (NY → London → Asian),
// or "Markets Quiet" when nothing is open.
function expectedLabel(now: Date): string {
  const active = panelActiveSessions(now);
  if (active.length === 0) return MARKETS_QUIET_LABEL;
  const priority = ["New York", "London", "Asian"];
  for (const name of priority) {
    const s = active.find((a) => a.name === name);
    if (s) return `${s.emoji} ${s.name} (${s.ku})`;
  }
  return MARKETS_QUIET_LABEL;
}

// A representative weekday (Wednesday 2026-06-24).
const WEEKDAY = "2026-06-24";

Deno.test("the session definitions match the Confluence panel windows", () => {
  for (const panel of PANEL_SESSIONS) {
    const tg = CONFLUENCE_SESSIONS.find((s) => s.name === panel.name);
    assert(tg, `missing session ${panel.name}`);
    assertEquals(tg!.open, panel.openUtc, `${panel.name} open hour`);
    assertEquals(tg!.close, panel.closeUtc, `${panel.name} close hour`);
    assertEquals(tg!.emoji, panel.emoji, `${panel.name} emoji`);
  }
});

Deno.test("label matches Confluence logic for every UTC hour on a weekday", () => {
  for (let h = 0; h < 24; h++) {
    const d = new Date(`${WEEKDAY}T${String(h).padStart(2, "0")}:00:00Z`);
    assertEquals(
      sessionDisplayLabel(d),
      expectedLabel(d),
      `hour ${h}:00 UTC mismatch`,
    );
  }
});

Deno.test("label matches Confluence logic at half-hour offsets too", () => {
  for (let h = 0; h < 24; h++) {
    const d = new Date(`${WEEKDAY}T${String(h).padStart(2, "0")}:30:00Z`);
    assertEquals(
      sessionDisplayLabel(d),
      expectedLabel(d),
      `hour ${h}:30 UTC mismatch`,
    );
  }
});

Deno.test("each named session shows its own label inside its window", () => {
  // Asian only (00:00–08:00, before London overlaps at 08:00).
  assertEquals(sessionDisplayLabel(new Date(`${WEEKDAY}T03:00:00Z`)), "🌏 Asian (ئاسیا)");
  // London only (09:00–13:00, after Asian closes, before NY opens).
  assertEquals(sessionDisplayLabel(new Date(`${WEEKDAY}T10:00:00Z`)), "🌍 London (لەندەن)");
  // New York takes priority during the London/NY overlap (13:00–17:00).
  assertEquals(sessionDisplayLabel(new Date(`${WEEKDAY}T15:00:00Z`)), "🌎 New York (نیویۆرک)");
  // New York only (17:00–22:00, after London closes).
  assertEquals(sessionDisplayLabel(new Date(`${WEEKDAY}T20:00:00Z`)), "🌎 New York (نیویۆرک)");
});

Deno.test("Markets Quiet when no session is open on a weekday (the reported bug)", () => {
  // 23:28 UTC: every session closed, Asian opens in 32m. Must NOT label as Asia.
  assertEquals(sessionDisplayLabel(new Date(`${WEEKDAY}T23:28:00Z`)), MARKETS_QUIET_LABEL);
  // 22:30 UTC: NY just closed, nothing open.
  assertEquals(sessionDisplayLabel(new Date(`${WEEKDAY}T22:30:00Z`)), MARKETS_QUIET_LABEL);
});

Deno.test("weekend is always Markets Quiet (Sat all day, Sun until 22:00 UTC)", () => {
  // Saturday 2026-06-20 — closed at hours that are weekday session windows.
  assert(isWeekendClosed(new Date("2026-06-20T03:00:00Z")));
  assertEquals(sessionDisplayLabel(new Date("2026-06-20T03:00:00Z")), MARKETS_QUIET_LABEL); // Asian hour
  assertEquals(sessionDisplayLabel(new Date("2026-06-20T10:00:00Z")), MARKETS_QUIET_LABEL); // London hour
  assertEquals(sessionDisplayLabel(new Date("2026-06-20T15:00:00Z")), MARKETS_QUIET_LABEL); // NY hour

  // Sunday 2026-06-21 — closed until 22:00 UTC.
  assert(isWeekendClosed(new Date("2026-06-21T03:00:00Z")));
  assertEquals(sessionDisplayLabel(new Date("2026-06-21T03:00:00Z")), MARKETS_QUIET_LABEL);
  assertEquals(sessionDisplayLabel(new Date("2026-06-21T21:59:00Z")), MARKETS_QUIET_LABEL);

  // Sunday 22:00 UTC the market reopens — but no FX session window covers 22:00,
  // so the label is still Markets Quiet (Asian opens at 00:00).
  assert(!isWeekendClosed(new Date("2026-06-21T22:00:00Z")));
  assertEquals(sessionDisplayLabel(new Date("2026-06-21T22:00:00Z")), MARKETS_QUIET_LABEL);
});

Deno.test("all signal timeframes computed at one instant share the same label", () => {
  // Every timeframe (M5/M15/M30/H1/H4/D1) of a single signal is generated from
  // the SAME `new Date()` instant, so they must all carry an identical label.
  const instant = new Date(`${WEEKDAY}T15:00:00Z`);
  const labels = ["M5", "M15", "M30", "H1", "H4", "D1"].map(() => sessionDisplayLabel(instant));
  const unique = new Set(labels);
  assertEquals(unique.size, 1);
  assertEquals([...unique][0], "🌎 New York (نیویۆرک)");
});
