import { OHLCCandle } from './krakenApi';

/**
 * CTP Confluence Buy/Sell Signal — a TypeScript port (and small upgrade) of the
 * Pine Script v5 indicator:
 *   - EMA fast / EMA slow trend filter
 *   - RSI momentum filter (bullish above 50 but below overbought, and mirrored)
 *   - MACD line vs signal line (state + crossover trigger)
 *   - Price above / below the fast EMA
 * A signal fires when the confluence score reaches the threshold AND the MACD
 * crosses on that same bar.
 *
 * Upgrades over the raw Pine version:
 *   - Signals carry the score, price and a confidence % so the UI can rank them.
 *   - Cooldown so repeated crosses on choppy bars don't spam the chart.
 */

export interface ConfluenceOptions {
  emaFastLen: number;
  emaSlowLen: number;
  rsiLen: number;
  rsiOB: number;
  rsiOS: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  /** Minimum confluence score (out of 4) required to fire. */
  scoreThreshold: number;
  /** Minimum bars between two signals of the same side. */
  cooldownBars: number;
}

export const DEFAULT_CONFLUENCE: ConfluenceOptions = {
  emaFastLen: 20,
  emaSlowLen: 50,
  rsiLen: 14,
  rsiOB: 70,
  rsiOS: 30,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  scoreThreshold: 3,
  cooldownBars: 3,
};

export interface ConfluenceSignal {
  time: number;
  side: 'buy' | 'sell';
  price: number;
  score: number;
  /** 0-100 confidence derived from score + RSI distance from 50. */
  confidence: number;
}

export interface ConfluenceResult {
  signals: ConfluenceSignal[];
  /** Latest bar readings for the score panel. */
  bullScore: number;
  bearScore: number;
  rsi: number;
  emaFast: number;
  emaSlow: number;
  macd: number;
  macdSignal: number;
  trend: 'up' | 'down' | 'flat';
  /** The most recent signal, if any. */
  last: ConfluenceSignal | null;
}

/** Running EMA over a value array; result has the same length (seeded by SMA). */
function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period || period <= 0) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder RSI aligned to the input array (NaN until enough data). */
function rsiAll(closes: number[], period: number): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const val = () => (avgLoss === 0 && avgGain === 0 ? 50 : avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  out[period] = val();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = val();
  }
  return out;
}

/**
 * Compute the confluence signals for a candle series.
 * Mirrors the Pine logic bar-by-bar so chart markers land on the exact candle.
 */
export function computeConfluence(
  candles: OHLCCandle[],
  opts: Partial<ConfluenceOptions> = {},
): ConfluenceResult {
  const o = { ...DEFAULT_CONFLUENCE, ...opts };
  const empty: ConfluenceResult = {
    signals: [], bullScore: 0, bearScore: 0, rsi: 50, emaFast: 0, emaSlow: 0,
    macd: 0, macdSignal: 0, trend: 'flat', last: null,
  };
  if (!candles || candles.length < o.emaSlowLen + o.macdSignal) return empty;

  const closes = candles.map((c) => c.close);
  const fast = ema(closes, o.emaFastLen);
  const slow = ema(closes, o.emaSlowLen);
  const rsi = rsiAll(closes, o.rsiLen);

  const mFast = ema(closes, o.macdFast);
  const mSlow = ema(closes, o.macdSlow);
  const macdLine = closes.map((_, i) => (Number.isNaN(mFast[i]) || Number.isNaN(mSlow[i]) ? NaN : mFast[i] - mSlow[i]));
  const macdDefined = macdLine.filter((v) => !Number.isNaN(v));
  const sigCompact = ema(macdDefined, o.macdSignal);
  const firstMacd = macdLine.findIndex((v) => !Number.isNaN(v));
  const signalLine = new Array<number>(closes.length).fill(NaN);
  if (firstMacd >= 0) {
    for (let i = 0; i < sigCompact.length; i++) {
      if (!Number.isNaN(sigCompact[i])) signalLine[firstMacd + i] = sigCompact[i];
    }
  }

  const signals: ConfluenceSignal[] = [];
  let lastBuyIdx = -Infinity;
  let lastSellIdx = -Infinity;

  const scoreAt = (i: number) => {
    const trendUp = fast[i] > slow[i];
    const trendDown = fast[i] < slow[i];
    const r = rsi[i];
    const rsiBull = r > 50 && r < o.rsiOB;
    const rsiBear = r < 50 && r > o.rsiOS;
    const macdBull = macdLine[i] > signalLine[i];
    const macdBear = macdLine[i] < signalLine[i];
    const aboveEma = closes[i] > fast[i];
    const belowEma = closes[i] < fast[i];
    const bull = (trendUp ? 1 : 0) + (rsiBull ? 1 : 0) + (macdBull ? 1 : 0) + (aboveEma ? 1 : 0);
    const bear = (trendDown ? 1 : 0) + (rsiBear ? 1 : 0) + (macdBear ? 1 : 0) + (belowEma ? 1 : 0);
    return { bull, bear };
  };

  for (let i = 1; i < candles.length; i++) {
    if (Number.isNaN(signalLine[i]) || Number.isNaN(signalLine[i - 1]) || Number.isNaN(slow[i]) || Number.isNaN(rsi[i])) continue;
    const crossUp = macdLine[i - 1] <= signalLine[i - 1] && macdLine[i] > signalLine[i];
    const crossDown = macdLine[i - 1] >= signalLine[i - 1] && macdLine[i] < signalLine[i];
    if (!crossUp && !crossDown) continue;

    const { bull, bear } = scoreAt(i);
    if (crossUp && bull >= o.scoreThreshold && i - lastBuyIdx >= o.cooldownBars) {
      lastBuyIdx = i;
      signals.push({
        time: candles[i].time,
        side: 'buy',
        price: closes[i],
        score: bull,
        confidence: confidenceOf(bull, rsi[i], 'buy'),
      });
    } else if (crossDown && bear >= o.scoreThreshold && i - lastSellIdx >= o.cooldownBars) {
      lastSellIdx = i;
      signals.push({
        time: candles[i].time,
        side: 'sell',
        price: closes[i],
        score: bear,
        confidence: confidenceOf(bear, rsi[i], 'sell'),
      });
    }
  }

  const li = candles.length - 1;
  const { bull, bear } = scoreAt(li);
  return {
    signals,
    bullScore: bull,
    bearScore: bear,
    rsi: +(rsi[li] || 50).toFixed(1),
    emaFast: fast[li],
    emaSlow: slow[li],
    macd: macdLine[li],
    macdSignal: signalLine[li],
    trend: fast[li] > slow[li] ? 'up' : fast[li] < slow[li] ? 'down' : 'flat',
    last: signals.length ? signals[signals.length - 1] : null,
  };
}

/** Blend the 0-4 score with the RSI momentum distance into a 0-100 confidence. */
export function confidenceOf(score: number, rsiValue: number, side: 'buy' | 'sell'): number {
  const base = (score / 4) * 80;
  const momentum = side === 'buy'
    ? Math.max(0, Math.min(20, ((rsiValue - 50) / 20) * 20))
    : Math.max(0, Math.min(20, ((50 - rsiValue) / 20) * 20));
  return Math.round(base + momentum);
}

/**
 * Selectable minimum-confidence thresholds for the chart UI. `0` shows every
 * signal the engine fires; the higher steps hide the weaker ones so only the
 * strongest BUY/SELL arrows stay on the chart.
 */
export const CONFIDENCE_STEPS = [0, 60, 70, 80, 90] as const;

/** Keep only signals whose confidence reaches `minConfidence` (0 = keep all). */
export function filterByConfidence(signals: ConfluenceSignal[], minConfidence: number): ConfluenceSignal[] {
  if (!minConfidence) return signals;
  return signals.filter((s) => s.confidence >= minConfidence);
}
