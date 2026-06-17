// ───────────────────── volatility-based trade filter ─────────────────────
// Pure, side-effect-free volatility logic shared by the engine (index.ts) and
// the regression test suite (volatility.test.ts). Keeping this in its own module
// means tests can import and exercise it WITHOUT starting the Deno HTTP server.
//
// We no longer trade by the clock. The bot runs 24/7 and only opens trades when
// the market is actually moving and cheap to transact in. Two live signals
// decide this on every scan:
//   • SPREAD   — the real Ask-Bid cost of entering. For gold this is normally
//                0.30-0.80 pts. We have no live bid/ask feed, so we model it as
//                a realistic spread clamped to that band (NOT from candle wicks,
//                which previously produced absurd 2.9-3.5 values).
//   • MOVEMENT — the average candle range (High-Low) over the last few candles.
//                This is the real volatility measure that drives the level.
// Thresholds are calibrated to gold and scaled by price so they stay sensible
// for crypto / forex symbols too.

export type Candle = {
  time: number; open: number; high: number; low: number; close: number; volume: number;
};

export const VOL_REF_PRICE = 3000;        // gold reference price used for scaling
export const VOL_SPREAD_MIN_PTS = 0.30;   // realistic gold spread floor
export const VOL_SPREAD_MAX_PTS = 0.80;   // realistic gold spread ceiling / "too wide" gate
export const VOL_MOVE_LOW_PTS = 1.0;      // avg candle below this = too flat → wait (LOW)
export const VOL_MOVE_HIGH_PTS = 3.0;     // avg candle above this = strong move → full lot (HIGH)
export const VOL_LOOKBACK = 5;            // candles averaged for the movement check

export type VolLevel = "LOW" | "MEDIUM" | "HIGH";
export type VolReport = {
  level: VolLevel; spread: number; avgMove: number;
  spreadMax: number; moveLow: number; moveHigh: number; lotMult: number;
};

// Format a points value: 2 decimals for big instruments, 4 for forex.
export function pts(n: number): string {
  return Math.abs(n) >= 1 ? n.toFixed(2) : n.toFixed(4);
}

export function assessVolatility(price: number, candles: Candle[]): VolReport {
  const scale = price > 0 ? price / VOL_REF_PRICE : 1;
  const spreadMin = VOL_SPREAD_MIN_PTS * scale;
  const spreadMax = VOL_SPREAD_MAX_PTS * scale;
  const moveLow = VOL_MOVE_LOW_PTS * scale;
  const moveHigh = VOL_MOVE_HIGH_PTS * scale;

  // PRICE MOVEMENT — average candle size (High-Low) over the last N candles.
  // This is the volatility measure, NOT the spread.
  const recent = candles.slice(-VOL_LOOKBACK);
  const avgMove = recent.length
    ? recent.reduce((a, c) => a + (c.high - c.low), 0) / recent.length
    : 0;

  // SPREAD — model the real Ask-Bid cost. With no live bid/ask feed we estimate
  // it as a small fraction of recent movement, but clamp it into the realistic
  // gold band (0.30-0.80 pts, price-scaled). This keeps spread sane instead of
  // ballooning with wick size.
  const rawSpread = avgMove * 0.08; // spreads widen modestly with volatility
  const spread = Math.min(spreadMax, Math.max(spreadMin, rawSpread));

  // VOLATILITY LEVEL — driven by average candle size:
  //   < 1.0 pts  → LOW    → wait (no trade)
  //   1.0-3.0    → MEDIUM → half lot
  //   > 3.0      → HIGH   → full lot
  // Spread must also be within the acceptable band, otherwise we wait.
  const spreadOk = spread <= spreadMax;
  let level: VolLevel;
  let lotMult: number;
  if (!spreadOk || avgMove < moveLow) { level = "LOW"; lotMult = 0; }   // 🔴 wait
  else if (avgMove < moveHigh) { level = "MEDIUM"; lotMult = 0.5; }      // 🟡 half lot
  else { level = "HIGH"; lotMult = 1; }                                  // 🟢 full lot
  return { level, spread, avgMove, spreadMax, moveLow, moveHigh, lotMult };
}

// Continuous 0-100 gauge value, driven mainly by movement (the real volatility),
// with the realistic spread as a small modifier. Shared by the `volatility`
// action and the regression tests so both agree on the gauge math.
export function volatilityPercent(v: VolReport, price: number): number {
  const moveComp = Math.max(0, Math.min(1, v.avgMove / v.moveHigh));
  const spreadComp = Math.max(0, Math.min(1, 1 - (v.spread - VOL_SPREAD_MIN_PTS * (price / VOL_REF_PRICE)) / v.spreadMax));
  return Math.round((moveComp * 0.8 + spreadComp * 0.2) * 100);
}
