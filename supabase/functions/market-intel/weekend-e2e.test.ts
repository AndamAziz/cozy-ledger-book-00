// ───────────────────── End-to-end weekend closure integration test ─────────────────────
// Proves that, on a simulated Saturday and Sunday, the SHARED decision logic used
// by BOTH live handlers behaves correctly:
//
//   • market-intel handler  → no "session open" / market-open Telegram cards are
//     produced, and no NEW Gold/Oil/Forex trading signals are generated.
//   • bots-engine handler   → non-crypto bots are blocked from opening new trades.
//   • Crypto (BTC) stays active 24/7 in every case.
//
// These assertions run the EXACT functions the handlers call (signalAllowed /
// dueMarketTransition / sessionPostsSuppressed in market-intel, botWeekendBlocked
// in bots-engine), so any future change that re-breaks the weekend guard fails CI.
//
// Run with the Supabase "test edge functions" tool, or:
//   deno test supabase/functions/market-intel/weekend-e2e.test.ts

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  dueMarketTransition,
  botWeekendBlocked as miBotWeekendBlocked,
  sessionPostsSuppressed,
  signalAllowed,
} from "./weekend-guard.ts";
import { botWeekendBlocked } from "../bots-engine/weekend-guard.ts";

// requireSession flags mirror ASSET_META in market-intel/index.ts.
const SESSION_ASSETS = [
  { name: "GOLD", requireSession: true, isCrypto: false },
  { name: "OIL", requireSession: true, isCrypto: false },
  { name: "EUR/USD (Forex)", requireSession: true, isCrypto: false },
];
const CRYPTO_ASSET = { name: "BITCOIN", requireSession: false, isCrypto: true };

// Hours sampled across a full day (UTC). Saturday is closed at EVERY hour.
const ALL_HOURS = [0, 1, 7, 8, 12, 13, 16, 21, 22, 23];

function at(date: string, hour: number): Date {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
}

// ── SATURDAY: market fully closed all day ──
Deno.test("Saturday — NO Gold/Oil/Forex signals generated at any hour", () => {
  for (const h of ALL_HOURS) {
    const now = at("2026-06-20", h); // Saturday
    for (const a of SESSION_ASSETS) {
      assertFalse(
        signalAllowed(a.requireSession, now),
        `${a.name} signal must be BLOCKED on Sat ${h}:00 UTC`,
      );
    }
    // Crypto keeps trading 24/7.
    assert(signalAllowed(CRYPTO_ASSET.requireSession, now), `BTC must trade on Sat ${h}:00`);
  }
});

Deno.test("Saturday — NO 'session open' posts produced at any hour", () => {
  for (const h of ALL_HOURS) {
    const now = at("2026-06-20", h);
    assert(sessionPostsSuppressed(now), `session posts must be suppressed Sat ${h}:00`);
    // Saturday is never a transition hour (close=Fri 22:00, open=Sun 22:00).
    assertEquals(dueMarketTransition(now), null, `no transition card on Sat ${h}:00`);
  }
});

Deno.test("Saturday — non-crypto bots blocked, crypto bots allowed", () => {
  for (const h of ALL_HOURS) {
    const now = at("2026-06-20", h);
    for (const a of SESSION_ASSETS) {
      assert(botWeekendBlocked(a.isCrypto, now), `${a.name} bot must be blocked Sat ${h}:00`);
      assert(miBotWeekendBlocked(a.isCrypto, now), "market-intel guard must agree with bots-engine");
    }
    assertFalse(botWeekendBlocked(CRYPTO_ASSET.isCrypto, now), `BTC bot must run Sat ${h}:00`);
  }
});

// ── SUNDAY: closed until 22:00 UTC, then reopens ──
Deno.test("Sunday before 22:00 — closed: no signals, no session posts, bots blocked", () => {
  for (const h of [0, 1, 7, 12, 16, 21]) {
    const now = at("2026-06-21", h); // Sunday pre-open
    for (const a of SESSION_ASSETS) {
      assertFalse(signalAllowed(a.requireSession, now), `${a.name} blocked Sun ${h}:00`);
      assert(botWeekendBlocked(a.isCrypto, now), `${a.name} bot blocked Sun ${h}:00`);
    }
    assert(sessionPostsSuppressed(now), `session posts suppressed Sun ${h}:00`);
    assert(signalAllowed(CRYPTO_ASSET.requireSession, now), `BTC trades Sun ${h}:00`);
  }
});

Deno.test("Sunday 22:00 — market reopens: signals allowed + exactly one OPEN card", () => {
  const now = at("2026-06-21", 22); // Sunday 22:00 UTC reopen
  for (const a of SESSION_ASSETS) {
    assert(signalAllowed(a.requireSession, now), `${a.name} allowed at Sun 22:00`);
    assertFalse(botWeekendBlocked(a.isCrypto, now), `${a.name} bot allowed at Sun 22:00`);
  }
  assertFalse(sessionPostsSuppressed(now), "session posts active at Sun 22:00");
  const t = dueMarketTransition(now);
  assertEquals(t?.kind, "open");
  assertEquals(t?.key, "Market:open:2026-06-21");
});

// ── FRIDAY 22:00: market closes for the weekend, exactly one CLOSE card ──
Deno.test("Friday 22:00 — market closes: signals blocked + exactly one CLOSE card", () => {
  const fri = at("2026-06-19", 22); // Friday 22:00 UTC close
  for (const a of SESSION_ASSETS) {
    assertFalse(signalAllowed(a.requireSession, fri), `${a.name} blocked at Fri 22:00`);
  }
  const t = dueMarketTransition(fri);
  assertEquals(t?.kind, "close");
  assertEquals(t?.key, "Market:close:2026-06-19");

  // 21:59 Friday is still open — proves the boundary is correct.
  const friOpen = at("2026-06-19", 21);
  for (const a of SESSION_ASSETS) {
    assert(signalAllowed(a.requireSession, friOpen), `${a.name} still open Fri 21:00`);
  }
});

// ── IDEMPOTENCY: the week-anchored key is stable & unique per transition ──
Deno.test("Idempotency — same transition always yields the same unique key", () => {
  // Two different invocations within the same close hour → identical key, so the
  // DB claim (UNIQUE region+kind+session_date) sends the notification only ONCE.
  const a = dueMarketTransition(new Date("2026-06-19T22:00:05Z"));
  const b = dueMarketTransition(new Date("2026-06-19T22:59:59Z"));
  assertEquals(a?.key, b?.key);
  assertEquals(a?.key, "Market:close:2026-06-19");

  // Different week → different key.
  const nextWeek = dueMarketTransition(new Date("2026-06-26T22:00:00Z"));
  assertEquals(nextWeek?.key, "Market:close:2026-06-26");
  assert(a?.key !== nextWeek?.key, "each weekly transition must have a distinct key");
});
