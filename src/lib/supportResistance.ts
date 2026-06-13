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
 */
export function computeSR(candles: OHLCCandle[], lookback = 30): SRLevels | null {
  if (!candles || candles.length < 2) return null;

  // Use the last completed candle for the pivot maths.
  const last = candles[candles.length - 1];
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
