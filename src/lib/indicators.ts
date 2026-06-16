import { OHLCCandle } from './krakenApi';

export type SignalType = 'buy' | 'sell' | 'neutral';

export interface IndicatorResult {
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  bollinger: { upper: number; middle: number; lower: number; percentB: number } | null;
  /** Fast EMA (9) for the EMA crossover signal. */
  ema9: number | null;
  /** Slow EMA (21) for the EMA crossover signal. */
  ema21: number | null;
  /** Trend EMA (50): price above/below = up/down trend. */
  ema50: number | null;
}

export interface IndicatorSettings {
  rsiPeriod: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
}

export const STANDARD_INDICATOR_SETTINGS: IndicatorSettings = {
  rsiPeriod: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
};

export function bestIndicatorSettings(candleCount: number): IndicatorSettings {
  if (candleCount >= 35) return STANDARD_INDICATOR_SETTINGS;
  if (candleCount >= 26) return { rsiPeriod: 14, macdFast: 8, macdSlow: 21, macdSignal: 5 };
  if (candleCount >= 18) return { rsiPeriod: 14, macdFast: 5, macdSlow: 13, macdSignal: 5 };
  if (candleCount >= 11) return { rsiPeriod: 7, macdFast: 3, macdSlow: 8, macdSignal: 3 };
  return { rsiPeriod: Math.max(2, Math.min(7, candleCount - 1)), macdFast: 3, macdSlow: 8, macdSignal: 3 };
}

export interface SignalSummary {
  signal: SignalType;
  score: number; // -100 (strong sell) .. 100 (strong buy)
  buyCount: number;
  sellCount: number;
  neutralCount: number;
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
  if (avgLoss === 0 && avgGain === 0) return 50;
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
  if (closes.length < slow + signalPeriod - 1) return null;
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

export function computeIndicators(candles: OHLCCandle[], settings: IndicatorSettings = STANDARD_INDICATOR_SETTINGS): IndicatorResult {
  const closes = candles.map((c) => c.close);
  return {
    rsi: calculateRSI(closes, settings.rsiPeriod),
    macd: calculateMACD(closes, settings.macdFast, settings.macdSlow, settings.macdSignal),
    bollinger: calculateBollinger(closes),
    ema9: emaLast(closes, 9),
    ema21: emaLast(closes, 21),
    ema50: emaLast(closes, 50),
  };
}

export function summarizeSignals(ind: IndicatorResult, price: number): SignalSummary {
  const signals: SignalType[] = [];

  // RSI (14): oversold < 30 → buy, overbought > 70 → sell
  if (ind.rsi != null) {
    if (ind.rsi < 30) signals.push('buy');
    else if (ind.rsi > 70) signals.push('sell');
    else signals.push('neutral');
  }
  // MACD (12/26/9)
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
  // Price vs EMA50 (trend filter)
  if (ind.ema50 != null && price > 0) {
    if (price > ind.ema50) signals.push('buy');
    else if (price < ind.ema50) signals.push('sell');
    else signals.push('neutral');
  }
  // EMA9 vs EMA21 (fast/slow crossover)
  if (ind.ema9 != null && ind.ema21 != null) {
    if (ind.ema9 > ind.ema21) signals.push('buy');
    else if (ind.ema9 < ind.ema21) signals.push('sell');
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

export interface BuySellPct {
  /** Whether there is any signal data to compute percentages from. */
  hasData: boolean;
  buyPct: number;
  sellPct: number;
  neutralPct: number;
  total: number;
}

/**
 * Shared, pure helper for the 100% Buy/Sell breakdown.
 * Used identically by Crypto and Metals via CryptoAnalysis.
 * Guards against a zero total so we never divide by zero.
 */
export function computeBuySellPct(
  summary: Pick<SignalSummary, 'buyCount' | 'sellCount' | 'neutralCount'>
): BuySellPct {
  const buyCount = Math.max(0, summary.buyCount ?? 0);
  const sellCount = Math.max(0, summary.sellCount ?? 0);
  const neutralCount = Math.max(0, summary.neutralCount ?? 0);
  const total = buyCount + sellCount + neutralCount;

  if (total <= 0) {
    return { hasData: false, buyPct: 0, sellPct: 0, neutralPct: 0, total: 0 };
  }

  const buyPct = Math.round((buyCount / total) * 100);
  const sellPct = Math.round((sellCount / total) * 100);
  const neutralPct = Math.round((neutralCount / total) * 100);
  return { hasData: true, buyPct, sellPct, neutralPct, total };
}

export interface HoldSuggestion {
  /** Dominant side the analysis leans toward. */
  side: SignalType;
  /** Suggested holding time in minutes (0 when there is no clear bias). */
  minutes: number;
}

/**
 * Suggest how long to HOLD a Buy/Sell after analysis, based on the dominant
 * signal's conviction and the selected chart timeframe. Stronger agreement →
 * ride the move for more candles; a balanced read → a short scalp.
 */
export function suggestHoldMinutes(pct: Pick<BuySellPct, 'hasData' | 'buyPct' | 'sellPct'>, timeframeMinutes: number): HoldSuggestion {
  if (!pct.hasData || timeframeMinutes <= 0) return { side: 'neutral', minutes: 0 };
  const side: SignalType = pct.buyPct > pct.sellPct ? 'buy' : pct.sellPct > pct.buyPct ? 'sell' : 'neutral';
  if (side === 'neutral') return { side, minutes: 0 };
  const conviction = Math.max(pct.buyPct, pct.sellPct) / 100; // 0..1
  const candles = Math.round(2 + conviction * 6); // hold ~2..8 candles
  return { side, minutes: candles * timeframeMinutes };
}

/** Standard holding timeframes shown after analysis (label + minutes per candle). */
export const HOLD_TIMEFRAMES: { label: string; minutes: number }[] = [
  { label: 'M1', minutes: 1 },
  { label: '5M', minutes: 5 },
  { label: '15M', minutes: 15 },
  { label: '30M', minutes: 30 },
  { label: '1H', minutes: 60 },
  { label: '4H', minutes: 240 },
];

export interface TimeframeHold {
  /** Timeframe label (M1 / 5M / ...). */
  label: string;
  /** Suggested holding time in minutes for this timeframe. */
  minutes: number;
}

/**
 * Suggest holding times across the standard timeframes (M1..4H) for the
 * dominant side, so the user sees how long to hold the Buy/Sell on each.
 */
export function suggestHoldAcrossTimeframes(
  pct: Pick<BuySellPct, 'hasData' | 'buyPct' | 'sellPct'>
): { side: SignalType; rows: TimeframeHold[] } {
  if (!pct.hasData) return { side: 'neutral', rows: [] };
  const side: SignalType = pct.buyPct > pct.sellPct ? 'buy' : pct.sellPct > pct.buyPct ? 'sell' : 'neutral';
  if (side === 'neutral') return { side, rows: [] };
  const conviction = Math.max(pct.buyPct, pct.sellPct) / 100; // 0..1
  const candles = Math.round(2 + conviction * 6); // hold ~2..8 candles
  const rows = HOLD_TIMEFRAMES.map((tf) => ({ label: tf.label, minutes: candles * tf.minutes }));
  return { side, rows };
}

