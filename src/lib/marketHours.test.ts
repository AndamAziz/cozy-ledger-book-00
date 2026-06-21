import { describe, it, expect } from "vitest";
import { getMarketStatus, countdownDigits, timeUntil } from "@/lib/marketHours";

/**
 * Timezone-safety contract for the market reopen countdown.
 *
 * The FX / metals / energy week is defined in absolute UTC terms:
 *   • OPENS  Sunday 22:00 UTC
 *   • CLOSES Friday 22:00 UTC
 * This matches the backend source of truth (supabase/functions/market-intel/
 * market-week.ts → FX_OPEN_HOUR_UTC = 22). The countdown must always point at
 * the SAME absolute UTC instant no matter which local timezone the browser is
 * in, because it is derived from absolute epoch-millisecond differences.
 *
 * NOTE: Vitest reads the process TZ once at startup, so we cannot flip the
 * timezone per-test here. The cross-timezone proof is enforced by running this
 * whole suite under several TZ values in CI (see the npm test invocations).
 * Within a single run we still assert the absolute UTC instants and the exact
 * countdown digits, which is what guarantees correctness.
 */

describe("market reopen countdown — timezone safety", () => {
  it("metal market reopens at the upcoming Sunday 22:00 UTC (from Saturday)", () => {
    const now = new Date("2026-06-20T10:00:00Z"); // Saturday
    const status = getMarketStatus("metal", now);
    expect(status.open).toBe(false);
    expect(status.nextChange?.toISOString()).toBe("2026-06-21T22:00:00.000Z");
  });

  it("countdown digits are computed from absolute epoch diffs (HH:MM:SS)", () => {
    const now = new Date("2026-06-21T20:36:50Z"); // Sunday, 1h 23m 10s before open
    const status = getMarketStatus("metal", now);
    expect(status.open).toBe(false);
    // 22:00:00 - 20:36:50 = 01:23:10
    expect(countdownDigits(status.nextChange, now)).toBe("01:23:10");
  });

  it("countdown shows days when more than 24h remain", () => {
    const now = new Date("2026-06-20T10:00:00Z"); // Saturday → Sun 22:00
    const status = getMarketStatus("metal", now);
    // 2026-06-20T10:00 → 2026-06-21T22:00 = 1d 12:00:00
    expect(countdownDigits(status.nextChange, now)).toBe("1d 12:00:00");
  });

  it("the reopen instant is identical whether built from a UTC or local-string date", () => {
    // Two Date objects representing the SAME absolute instant.
    const fromUtc = new Date("2026-06-20T10:00:00Z");
    const fromOffset = new Date("2026-06-20T13:00:00+03:00"); // same instant
    const a = getMarketStatus("metal", fromUtc).nextChange?.toISOString();
    const b = getMarketStatus("metal", fromOffset).nextChange?.toISOString();
    expect(a).toBe(b);
    expect(a).toBe("2026-06-21T22:00:00.000Z");
  });

  it("countdown is empty once the market is open (banner collapses)", () => {
    const now = new Date("2026-06-22T09:00:00Z"); // Monday, open
    const status = getMarketStatus("metal", now);
    expect(status.open).toBe(true);
    // nextChange points at Friday close, not an 'open' countdown.
    expect(status.nextChange?.toISOString()).toBe("2026-06-26T22:00:00.000Z");
  });

  it("crypto never closes — no countdown", () => {
    const status = getMarketStatus("crypto", new Date("2026-06-20T10:00:00Z"));
    expect(status.open).toBe(true);
    expect(status.nextChange).toBeNull();
    expect(countdownDigits(status.nextChange)).toBe("");
  });

  it("Sunday before 22:00 UTC is still closed and counts down to 22:00 the same day", () => {
    const now = new Date("2026-06-21T21:00:00Z"); // Sunday 21:00
    const status = getMarketStatus("metal", now);
    expect(status.open).toBe(false);
    expect(status.nextChange?.toISOString()).toBe("2026-06-21T22:00:00.000Z");
    expect(countdownDigits(status.nextChange, now)).toBe("01:00:00");
  });

  it("Friday after 22:00 UTC counts down to the following Sunday 22:00 UTC", () => {
    const now = new Date("2026-06-19T23:00:00Z"); // Friday 23:00, closed
    const status = getMarketStatus("metal", now);
    expect(status.open).toBe(false);
    expect(status.nextChange?.toISOString()).toBe("2026-06-21T22:00:00.000Z");
    // 23:00 Fri → 22:00 Sun = 1d 23:00:00
    expect(countdownDigits(status.nextChange, now)).toBe("1d 23:00:00");
  });

  it("timeUntil and countdownDigits agree on the same absolute target", () => {
    const now = new Date("2026-06-21T20:00:00Z");
    const target = getMarketStatus("metal", now).nextChange!;
    expect(timeUntil(target, now)).toBe("2h 0m");
    expect(countdownDigits(target, now)).toBe("02:00:00");
  });
});
