import { OHLCCandle } from './krakenApi';

export type SignalType = 'buy' | 'sell' | 'neutral';

export interface IndicatorResult {
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  bollinger: { upper: number; middle: number; lower: number; percentB: number } | null;
  sma20: number | null;
  sma50: number | null;
  ema12: number | null;
  ema26: number | null;
}

export interface SignalSummary {
  signal: SignalType;
  score: number; // -100 (strong sell) .. 100 (strong buy)
  buyCount: number;
  sellCount: number;
  neutralCount: number;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function emaSeries(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

function emaLast(values: number[], period: number): number | null {
  const series = emaSeries(values, period);
  return series.length ? series[series.length - 1] : null;
}

/** Relative Strength Index (Wilder's smoothing) */
export function calculateRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** MACD (12, 26, 9) */
export function calculateMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < slow + signalPeriod) return null;
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  // Align the two EMA series (fast is longer)
  const offset = fastEma.length - slowEma.length;
  const macdLine: number[] = [];
  for (let i = 0; i < slowEma.length; i++) {
    macdLine.push(fastEma[i + offset] - slowEma[i]);
  }
  const signalSeries = emaSeries(macdLine, signalPeriod);
  if (!signalSeries.length) return null;
  const macd = macdLine[macdLine.length - 1];
  const signal = signalSeries[signalSeries.length - 1];
  return { macd, signal, histogram: macd - signal };
}

/** Bollinger Bands (20, 2) */
export function calculateBollinger(
  closes: number[],
  period = 20,
  mult = 2
): { upper: number; middle: number; lower: number; percentB: number } | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - middle) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = middle + mult * sd;
  const lower = middle - mult * sd;
  const last = closes[closes.length - 1];
  const percentB = upper === lower ? 0.5 : (last - lower) / (upper - lower);
  return { upper, middle, lower, percentB };
}

export function computeIndicators(candles: OHLCCandle[]): IndicatorResult {
  const closes = candles.map((c) => c.close);
  return {
    rsi: calculateRSI(closes),
    macd: calculateMACD(closes),
    bollinger: calculateBollinger(closes),
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    ema12: emaLast(closes, 12),
    ema26: emaLast(closes, 26),
  };
}

export function summarizeSignals(ind: IndicatorResult, price: number): SignalSummary {
  const signals: SignalType[] = [];

  // RSI
  if (ind.rsi != null) {
    if (ind.rsi < 30) signals.push('buy');
    else if (ind.rsi > 70) signals.push('sell');
    else signals.push('neutral');
  }
  // MACD
  if (ind.macd) {
    if (ind.macd.histogram > 0) signals.push('buy');
    else if (ind.macd.histogram < 0) signals.push('sell');
    else signals.push('neutral');
  }
  // Bollinger %B
  if (ind.bollinger) {
    if (ind.bollinger.percentB < 0.1) signals.push('buy');
    else if (ind.bollinger.percentB > 0.9) signals.push('sell');
    else signals.push('neutral');
  }
  // Price vs SMA20
  if (ind.sma20 != null && price > 0) {
    if (price > ind.sma20) signals.push('buy');
    else if (price < ind.sma20) signals.push('sell');
    else signals.push('neutral');
  }
  // Price vs SMA50
  if (ind.sma50 != null && price > 0) {
    if (price > ind.sma50) signals.push('buy');
    else if (price < ind.sma50) signals.push('sell');
    else signals.push('neutral');
  }
  // EMA12 vs EMA26
  if (ind.ema12 != null && ind.ema26 != null) {
    if (ind.ema12 > ind.ema26) signals.push('buy');
    else if (ind.ema12 < ind.ema26) signals.push('sell');
    else signals.push('neutral');
  }

  const buyCount = signals.filter((s) => s === 'buy').length;
  const sellCount = signals.filter((s) => s === 'sell').length;
  const neutralCount = signals.filter((s) => s === 'neutral').length;
  const total = signals.length || 1;
  const score = Math.round(((buyCount - sellCount) / total) * 100);

  let signal: SignalType = 'neutral';
  if (score >= 25) signal = 'buy';
  else if (score <= -25) signal = 'sell';

  return { signal, score, buyCount, sellCount, neutralCount };
}
