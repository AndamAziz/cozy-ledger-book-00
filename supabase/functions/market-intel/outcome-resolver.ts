// ─────────────────────────────────────────────────────────────────────────────
// outcome-resolver.ts — CANDLE-BASED, FIRST-TOUCH outcome resolution.
//
// The old logic decided win/loss from a single price-direction snapshot taken a
// short time after the signal (ignoring whether SL or TP was actually reached).
// This module walks the OHLC candles that occurred AFTER a signal was opened and
// determines which level — Stop-Loss, Take-Profit 1 (1.5R) or Take-Profit 2 (3R)
// — was touched FIRST, using each candle's high/low (intrabar), not just close.
//
// Conservatism rule (industry standard for backtests): if a single candle's range
// spans BOTH the stop-loss and a take-profit while no TP has yet been locked in,
// we assume the STOP-LOSS was hit first (worst case). Once TP1 is locked in, a
// later stop is treated as a TP1 win (you'd move the stop to break-even / bank the
// first target), and only a subsequent TP2 touch upgrades the result to TP2.
// ─────────────────────────────────────────────────────────────────────────────

export interface Candle {
  time: number; // epoch SECONDS
  high: number;
  low: number;
  close: number;
  open?: number;
}

export type Outcome = "tp1" | "tp2" | "sl" | "expired" | "open";
export type Side = "BUY" | "SELL";

export interface ResolveInput {
  side: Side;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  /** Candles AT or AFTER the signal's open time, in chronological order. */
  candles: Candle[];
  /** Epoch ms the signal opened — candles before this are ignored. */
  openedAtMs: number;
}

export interface ResolveResult {
  outcome: Outcome;
  /** Price the trade is considered closed at (the level that was hit, or last close). */
  exitPrice: number;
  /** Epoch ms the deciding candle closed (null when still open / no data). */
  closedAtMs: number | null;
  /** How far the trade progressed: 0 = none, 1 = TP1 locked, 2 = TP2. */
  stage: 0 | 1 | 2;
}

/**
 * Walk candles chronologically and return the first-touch outcome.
 *
 * Returns `outcome: "open"` only when there are no candles at all after the open
 * time (cannot decide). When candles exist but no level was touched, the result
 * is `"expired"` (the trade ran its course without hitting SL/TP1/TP2).
 */
export function resolveOutcome(input: ResolveInput): ResolveResult {
  const { side, entry, sl, tp1, tp2, openedAtMs } = input;
  const isBuy = side === "BUY";

  const after = input.candles
    .filter((c) => Number.isFinite(c.high) && Number.isFinite(c.low))
    .filter((c) => c.time * 1000 >= openedAtMs - 60_000) // small grace for the opening candle
    .sort((a, b) => a.time - b.time);

  if (after.length === 0) {
    return { outcome: "open", exitPrice: entry, closedAtMs: null, stage: 0 };
  }

  let tp1Locked = false;

  for (const c of after) {
    const tMs = c.time * 1000;
    // Did this candle's range touch each level?
    const slHit = isBuy ? c.low <= sl : c.high >= sl;
    const tp1Hit = isBuy ? c.high >= tp1 : c.low <= tp1;
    const tp2Hit = isBuy ? c.high >= tp2 : c.low <= tp2;

    if (!tp1Locked) {
      // Worst-case: a candle that spans SL and any TP counts as a stop first.
      if (slHit) {
        return { outcome: "sl", exitPrice: sl, closedAtMs: tMs, stage: 0 };
      }
      if (tp2Hit) {
        return { outcome: "tp2", exitPrice: tp2, closedAtMs: tMs, stage: 2 };
      }
      if (tp1Hit) {
        tp1Locked = true;
        // keep scanning: a later candle may reach TP2 (upgrade) or stop out (still a TP1 win)
        continue;
      }
    } else {
      // TP1 already banked. TP2 upgrades; a later stop is still a TP1 win.
      if (tp2Hit) {
        return { outcome: "tp2", exitPrice: tp2, closedAtMs: tMs, stage: 2 };
      }
      if (slHit) {
        return { outcome: "tp1", exitPrice: tp1, closedAtMs: tMs, stage: 1 };
      }
    }
  }

  // Ran out of candles without a decisive SL/TP2 close.
  const last = after[after.length - 1];
  if (tp1Locked) {
    return { outcome: "tp1", exitPrice: tp1, closedAtMs: last.time * 1000, stage: 1 };
  }
  return { outcome: "expired", exitPrice: last.close, closedAtMs: last.time * 1000, stage: 0 };
}

/** Pips for an outcome, using the asset's pip size. SL is negative; expired is signed by direction. */
export function outcomePips(
  res: ResolveResult,
  side: Side,
  entry: number,
  pip: number,
): number {
  const move = side === "BUY" ? res.exitPrice - entry : entry - res.exitPrice;
  const sign = res.outcome === "sl" ? -1 : move >= 0 ? 1 : -1;
  return sign * Math.round(Math.abs(move) / pip);
}

/** Maps an outcome to the legacy `status` column used by existing reports. */
export function outcomeToStatus(outcome: Outcome): string {
  if (outcome === "tp1" || outcome === "tp2") return "target_hit";
  if (outcome === "sl") return "stopped_out";
  if (outcome === "expired") return "expired";
  return "open";
}

/** True when the outcome is a decisive win/loss that should count toward win-rate. */
export function isDecisive(outcome: Outcome): boolean {
  return outcome === "tp1" || outcome === "tp2" || outcome === "sl";
}
