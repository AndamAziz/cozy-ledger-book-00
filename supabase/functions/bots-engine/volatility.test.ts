// ───────────────────── volatility regression suite ─────────────────────
// Deterministic regression tests for the XAU/USD spread + volatility logic.
// Run on every deploy to guarantee spread stays inside the realistic gold band
// and that each volatility level maps to the expected lot size.
//
// These tests are pure: they feed synthetic candles into assessVolatility() and
// assert the result. No network, no server boot, no market dependency — so they
// give the SAME answer every time.
//
// Run with: the Supabase "test edge functions" tool, or
//   deno test supabase/functions/bots-engine/volatility.test.ts

import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assessVolatility,
  volatilityPercent,
  type Candle,
  VOL_SPREAD_MIN_PTS,
  VOL_SPREAD_MAX_PTS,
  VOL_MOVE_LOW_PTS,
  VOL_MOVE_HIGH_PTS,
  VOL_LOOKBACK,
} from "./volatility.ts";

// Reference gold price used for the bulk of the assertions. At this price the
// scale factor is exactly 1, so the points thresholds equal their nominal
// values (spread 0.30-0.80, move 1.0 / 3.0).
const XAU = 3000;

// Build N identical candles whose High-Low range == `moveRange`. The bot only
// looks at the last VOL_LOOKBACK candles, so we generate that many.
function candles(moveRange: number, n = VOL_LOOKBACK): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const low = XAU - moveRange / 2;
    const high = XAU + moveRange / 2;
    out.push({ time: i, open: low, high, low, close: high, volume: 1 });
  }
  return out;
}

// ───────────────────── spread band ─────────────────────

Deno.test("XAU spread never drops below the 0.30 floor", () => {
  // Tiny movement → raw spread ~0, must clamp up to the floor.
  const v = assessVolatility(XAU, candles(0.1));
  assertEquals(v.spread, VOL_SPREAD_MIN_PTS);
  assert(v.spread >= VOL_SPREAD_MIN_PTS, `spread ${v.spread} below floor`);
});

Deno.test("XAU spread never exceeds the 0.80 ceiling", () => {
  // Huge movement → raw spread big, must clamp down to the ceiling.
  const v = assessVolatility(XAU, candles(50));
  assertEquals(v.spread, VOL_SPREAD_MAX_PTS);
  assert(v.spread <= VOL_SPREAD_MAX_PTS, `spread ${v.spread} above ceiling`);
});

Deno.test("XAU spread stays inside the realistic 0.30-0.80 band across the range", () => {
  for (const move of [0.1, 0.5, 1.0, 2.0, 3.5, 8, 10, 25, 100]) {
    const v = assessVolatility(XAU, candles(move));
    assert(
      v.spread >= VOL_SPREAD_MIN_PTS - 1e-9 && v.spread <= VOL_SPREAD_MAX_PTS + 1e-9,
      `move ${move}: spread ${v.spread} outside [${VOL_SPREAD_MIN_PTS}, ${VOL_SPREAD_MAX_PTS}]`,
    );
  }
});

Deno.test("XAU spread is NOT derived from candle wicks (no 2.9-3.5 regression)", () => {
  // The old bug produced spreads of ~2.94-3.48. With 8-10pt candles the spread
  // must remain well under 1.0 — this guards against that regression.
  for (const move of [8, 9, 10]) {
    const v = assessVolatility(XAU, candles(move));
    assert(v.spread < 1.0, `regression: move ${move} produced spread ${v.spread}`);
  }
});

// ───────────────────── volatility levels ─────────────────────

Deno.test("avg candle < 1.0 pts → LOW → wait (no lot)", () => {
  const v = assessVolatility(XAU, candles(0.5));
  assertEquals(v.level, "LOW");
  assertEquals(v.lotMult, 0);
});

Deno.test("avg candle 1.0-3.0 pts → MEDIUM → half lot", () => {
  const v = assessVolatility(XAU, candles(2.0));
  assertEquals(v.level, "MEDIUM");
  assertEquals(v.lotMult, 0.5);
});

Deno.test("avg candle > 3.0 pts → HIGH → full lot", () => {
  const v = assessVolatility(XAU, candles(5.0));
  assertEquals(v.level, "HIGH");
  assertEquals(v.lotMult, 1);
});

Deno.test("8-10pt gold candles are HIGH, not MEDIUM (calibration regression)", () => {
  for (const move of [8, 9, 10]) {
    const v = assessVolatility(XAU, candles(move));
    assertEquals(v.level, "HIGH", `move ${move} should be HIGH`);
    assertEquals(v.lotMult, 1);
  }
});

Deno.test("level boundaries are inclusive/exclusive as documented", () => {
  // Exactly at the LOW->MEDIUM boundary (1.0): MEDIUM.
  assertEquals(assessVolatility(XAU, candles(VOL_MOVE_LOW_PTS)).level, "MEDIUM");
  // Just below the boundary: LOW.
  assertEquals(assessVolatility(XAU, candles(VOL_MOVE_LOW_PTS - 0.01)).level, "LOW");
  // Exactly at the MEDIUM->HIGH boundary (3.0): HIGH.
  assertEquals(assessVolatility(XAU, candles(VOL_MOVE_HIGH_PTS)).level, "HIGH");
  // Just below: MEDIUM.
  assertEquals(assessVolatility(XAU, candles(VOL_MOVE_HIGH_PTS - 0.01)).level, "MEDIUM");
});

Deno.test("avgMove is the average High-Low over the lookback window", () => {
  const v = assessVolatility(XAU, candles(2.5));
  assertEquals(Number(v.avgMove.toFixed(6)), 2.5);
});

// ───────────────────── price scaling (crypto / other symbols) ─────────────────────

Deno.test("thresholds scale with price so they stay sane for crypto", () => {
  const btc = 60000; // 20x the gold reference
  const scale = btc / XAU; // 20
  const v = assessVolatility(btc, candles2(btc, VOL_MOVE_HIGH_PTS * scale + 1));
  // Scaled spread band must also widen by the same factor.
  assertEquals(Number(v.spreadMax.toFixed(6)), Number((VOL_SPREAD_MAX_PTS * scale).toFixed(6)));
  assertEquals(v.level, "HIGH");
});

// Helper that builds candles around an arbitrary price.
function candles2(price: number, moveRange: number, n = VOL_LOOKBACK): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const low = price - moveRange / 2;
    const high = price + moveRange / 2;
    out.push({ time: i, open: low, high, low, close: high, volume: 1 });
  }
  return out;
}

// ───────────────────── gauge percentage ─────────────────────

Deno.test("volatility gauge is 0-100 and rises with movement", () => {
  const low = volatilityPercent(assessVolatility(XAU, candles(0.2)), XAU);
  const mid = volatilityPercent(assessVolatility(XAU, candles(2)), XAU);
  const high = volatilityPercent(assessVolatility(XAU, candles(6)), XAU);
  for (const p of [low, mid, high]) {
    assert(p >= 0 && p <= 100, `percent ${p} out of range`);
  }
  assert(low < mid && mid <= high, `gauge not monotonic: ${low}/${mid}/${high}`);
});

// ───────────────────── edge cases ─────────────────────

Deno.test("no candles → LOW, spread clamped to floor, no NaN", () => {
  const v = assessVolatility(XAU, []);
  assertEquals(v.avgMove, 0);
  assertEquals(v.level, "LOW");
  assertEquals(v.spread, VOL_SPREAD_MIN_PTS);
  assert(!Number.isNaN(v.spread) && !Number.isNaN(v.avgMove));
});

Deno.test("only the last VOL_LOOKBACK candles count toward avgMove", () => {
  // Prepend noisy big candles that should be ignored.
  const noisy = candles2(XAU, 100, 10);
  const calm = candles(0.4, VOL_LOOKBACK);
  const v = assessVolatility(XAU, [...noisy, ...calm]);
  assertEquals(v.level, "LOW");
});
