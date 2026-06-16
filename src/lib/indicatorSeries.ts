import { OHLCCandle } from './krakenApi';

export interface TimeValue {
  time: number;
  value: number;
}

export interface MacdSeries {
  macd: TimeValue[];
  signal: TimeValue[];
  histogram: TimeValue[];
}

/** Full EMA series aligned so result[i] maps to values[i + period - 1]. */
function emaSeriesAligned(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/**
 * RSI as a time series (Wilder's smoothing) so it can be plotted in its own
 * pane below the price chart — the same calculation used for the single-value
 * RSI signal, expanded across every candle.
 */
export function rsiSeries(candles: OHLCCandle[], period = 14): TimeValue[] {
  if (candles.length < period + 1) return [];
  const closes = candles.map((c) => c.close);
  const out: TimeValue[] = [];

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const rsiAt = () => (avgLoss === 0 && avgGain === 0 ? 50 : avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  out.push({ time: candles[period].time, value: +rsiAt().toFixed(2) });

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out.push({ time: candles[i].time, value: +rsiAt().toFixed(2) });
  }
  return out;
}

/**
 * MACD (12, 26, 9) as time series for its own pane: the MACD line, the signal
 * line and the histogram (MACD − signal).
 */
export function macdSeries(
  candles: OHLCCandle[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): MacdSeries {
  const empty: MacdSeries = { macd: [], signal: [], histogram: [] };
  if (candles.length < slow + signalPeriod - 1) return empty;
  const closes = candles.map((c) => c.close);

  const fastEma = emaSeriesAligned(closes, fast);
  const slowEma = emaSeriesAligned(closes, slow);
  // Indices: fastEma[i] -> closes[i + fast - 1]; slowEma[j] -> closes[j + slow - 1].
  const offset = fast - slow; // negative; fast starts earlier
  const macdLine: number[] = [];
  const macdTimes: number[] = [];
  for (let j = 0; j < slowEma.length; j++) {
    const fi = j - offset; // align to same candle
    if (fi < 0 || fi >= fastEma.length) continue;
    const candleIdx = j + slow - 1;
    macdLine.push(fastEma[fi] - slowEma[j]);
    macdTimes.push(candles[candleIdx].time);
  }

  const signalEma = emaSeriesAligned(macdLine, signalPeriod);
  const macd: TimeValue[] = [];
  const signal: TimeValue[] = [];
  const histogram: TimeValue[] = [];
  for (let s = 0; s < signalEma.length; s++) {
    const mi = s + signalPeriod - 1;
    const t = macdTimes[mi];
    macd.push({ time: t, value: +macdLine[mi].toFixed(6) });
    signal.push({ time: t, value: +signalEma[s].toFixed(6) });
    histogram.push({ time: t, value: +(macdLine[mi] - signalEma[s]).toFixed(6) });
  }
  return { macd, signal, histogram };
}
