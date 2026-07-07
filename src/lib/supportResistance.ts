import { OHLCCandle } from './krakenApi';

export interface SRLevels {
  /** Classic floor-trader pivot. */
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
  /** Highest high over the lookback window. */
  recentHigh: number;
  /** Lowest low over the lookback window. */
  recentLow: number;
}

/**
 * Classic pivot-point support/resistance from the most recent completed
 * candle, plus recent swing high/low over a lookback window.
 *
 * `stepSeconds` is the timeframe's bar length in seconds. When provided, the
 * pivot maths only uses a candle whose timestamp is aligned to that boundary
 * (`time % stepSeconds === 0`). This skips the synthetic spot-price candles some
 * feeds append (flat H==L==C bars carrying an unaligned fetch-time timestamp),
 * which would otherwise collapse pivot/R1/R2/S1/S2 to a single value.
 */
export function computeSR(candles: OHLCCandle[], lookback = 30, stepSeconds?: number): SRLevels | null {
  if (!candles || candles.length < 2) return null;

  // Scan backwards from the second-to-last bar (never the live, still-forming
  // last candle) for the last REAL completed candle: it must have a non-zero
  // range (not a flat synthetic candle) and, when the timeframe step is known,
  // an aligned timestamp.
  let last: OHLCCandle | null = null;
  for (let i = candles.length - 2; i >= 0; i--) {
    const c = candles[i];
    if (!c) continue;
    const range = c.high - c.low;
    if (!(range > 0)) continue; // flat / synthetic spot candle
    if (stepSeconds && stepSeconds > 0 && Math.round(c.time) % stepSeconds !== 0) continue;
    last = c;
    break;
  }
  if (!last) return null;

  const high = last.high;
  const low = last.low;
  const close = last.close;
  if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return null;

  const pivot = (high + low + close) / 3;
  const range = high - low;

  const r1 = 2 * pivot - low;
  const s1 = 2 * pivot - high;
  const r2 = pivot + range;
  const s2 = pivot - range;
  const r3 = high + 2 * (pivot - low);
  const s3 = low - 2 * (high - pivot);

  const window = candles.slice(-lookback);
  const recentHigh = Math.max(...window.map((c) => c.high));
  const recentLow = Math.min(...window.map((c) => c.low));

  return { pivot, r1, r2, r3, s1, s2, s3, recentHigh, recentLow };
}
