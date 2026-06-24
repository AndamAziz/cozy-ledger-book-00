import { OHLCCandle, fetchOHLC } from './krakenApi';
import { calculateRSI, calculateMACD, bestIndicatorSettings, STANDARD_INDICATOR_SETTINGS } from './indicators';
import { calculateATR, atrLevels } from './risk';
import type { AssetKey, SignalTF } from './signalEngine';
import { getAssetMeta, fetchAssetTF } from './signalData';
// Single source of truth for Forex session windows / open-closed checks — shared
// with the canonical signal engine and the Telegram session label.
import {
  FX_SESSIONS,
  isSessionOpen,
  type FxSession,
  type SessionName,
} from '../../supabase/functions/market-intel/session-label';

export type TrendDir = 'up' | 'down' | 'neutral';

/** The six timeframes shown in the multi-timeframe summary. */
export interface TFConfig {
  /** Display label (D1, H4, ...). */
  label: string;
  /** Kraken interval in minutes for BTC. */
  krakenInterval: number;
  /** commodities-prices history range for gold. */
  goldRange: string;
  /** Aggregation factor applied to the gold candles (1 = none). */
  goldAgg: number;
}

export const AI_TIMEFRAMES: TFConfig[] = [
  { label: 'D1', krakenInterval: 1440, goldRange: '3mo', goldAgg: 1 },
  { label: 'H4', krakenInterval: 240, goldRange: '1mo', goldAgg: 4 },
  { label: 'H1', krakenInterval: 60, goldRange: '1mo', goldAgg: 1 },
  { label: 'M30', krakenInterval: 30, goldRange: '5d', goldAgg: 2 },
  { label: 'M15', krakenInterval: 15, goldRange: '15min', goldAgg: 1 },
  { label: 'M5', krakenInterval: 5, goldRange: '5min', goldAgg: 1 },
];

export interface TFTrend {
  label: string;
  dir: TrendDir;
  /** -100..100 signal score for the timeframe. */
  score: number;
  /** Raw RSI value for the timeframe (debug). */
  rsi: number | null;
  /** Raw MACD line / signal / histogram for the timeframe (debug). */
  macd: { macd: number; signal: number; histogram: number } | null;
  /** Number of candles used for this timeframe (debug). */
  candleCount: number;
  /** Whether RSI and MACD agree (strong) or disagree (neutral). */
  agreement: 'strong' | 'mixed' | 'none';
}

export interface KeyLevels {
  supports: number[];
  resistances: number[];
  nearestSupport: number | null;
  nearestResistance: number | null;
}

export interface TradeSetup {
  side: 'buy' | 'sell' | 'none';
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
}

export interface ConfluenceResult {
  /** 0..100 — how many timeframes agree with the dominant direction. */
  score: number;
  dir: TrendDir;
  label: string;
  upCount: number;
  downCount: number;
  neutralCount: number;
}

export interface AssetAnalysis {
  trends: TFTrend[];
  confluence: ConfluenceResult;
  levels: KeyLevels;
  setup: TradeSetup;
  price: number;
  /** Epoch ms when the confluence direction last flipped (null if unknown). */
  signalChangedAt: number | null;
}

/** Aggregate N consecutive candles into one (open/high/low/close). */
export function aggregateCandles(candles: OHLCCandle[], factor: number): OHLCCandle[] {
  if (factor <= 1) return candles;
  const out: OHLCCandle[] = [];
  for (let i = 0; i + factor <= candles.length; i += factor) {
    const group = candles.slice(i, i + factor);
    out.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((a, c) => a + (c.volume || 0), 0),
    });
  }
  return out;
}

/**
 * Trend direction for a candle series, derived from RSI + MACD:
 *  - RSI > 50  → bullish tendency
 *  - MACD line > Signal line → bullish
 *  - Both agree → strong directional signal
 *  - Disagreement → Flat / Neutral
 */
export function trendFromCandles(candles: OHLCCandle[]): TFTrend {
  const candleCount = candles?.length ?? 0;
  // Need at least 35 candles for MACD(12,26,9); fall back to adaptive periods otherwise.
  if (!candles || candleCount < 28) {
    return { label: '', dir: 'neutral', score: 0, rsi: null, macd: null, candleCount, agreement: 'none' };
  }
  const closes = candles.map((c) => c.close);
  const cfg = candleCount >= 35 ? STANDARD_INDICATOR_SETTINGS : bestIndicatorSettings(candleCount);
  const rsi = calculateRSI(closes, cfg.rsiPeriod);
  const macd = calculateMACD(closes, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);

  const rsiBull = rsi != null ? rsi > 50 : null;
  const macdBull = macd != null ? macd.macd > macd.signal : null;

  let dir: TrendDir = 'neutral';
  let agreement: 'strong' | 'mixed' | 'none' = 'none';
  let score = 0;

  if (rsiBull != null && macdBull != null) {
    if (rsiBull && macdBull) {
      dir = 'up';
      agreement = 'strong';
      score = 100;
    } else if (!rsiBull && !macdBull) {
      dir = 'down';
      agreement = 'strong';
      score = -100;
    } else {
      // Disagreement → flat / neutral.
      dir = 'neutral';
      agreement = 'mixed';
      score = 0;
    }
  } else if (rsiBull != null) {
    dir = rsiBull ? 'up' : 'down';
    agreement = 'mixed';
    score = rsiBull ? 50 : -50;
  } else if (macdBull != null) {
    dir = macdBull ? 'up' : 'down';
    agreement = 'mixed';
    score = macdBull ? 50 : -50;
  }

  return { label: '', dir, score, rsi, macd, candleCount, agreement };
}

export function computeConfluence(trends: TFTrend[]): ConfluenceResult {
  const upCount = trends.filter((t) => t.dir === 'up').length;
  const downCount = trends.filter((t) => t.dir === 'down').length;
  const neutralCount = trends.filter((t) => t.dir === 'neutral').length;
  const total = trends.length || 1;
  const dominant = Math.max(upCount, downCount);
  const dir: TrendDir = upCount > downCount ? 'up' : downCount > upCount ? 'down' : 'neutral';
  const score = Math.round((dominant / total) * 100);

  let label: string;
  if (dir === 'neutral') {
    label = 'Mixed / No Clear Bias';
  } else {
    const side = dir === 'up' ? 'Buy' : 'Sell';
    if (score >= 80) label = `Strong ${side} Signal`;
    else if (score >= 60) label = `${side} Signal`;
    else label = `Weak ${side} Bias`;
  }
  return { score, dir, label, upCount, downCount, neutralCount };
}

/**
 * Detect swing (fractal) highs and lows over a candle window. A swing high is a
 * candle whose high is greater than `strength` candles on each side; a swing low
 * is the mirror. These are the real recent turning points in price action.
 */
export function findSwingLevels(candles: OHLCCandle[], lookback = 50, strength = 2): { highs: number[]; lows: number[] } {
  const window = candles.slice(-lookback);
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = strength; i < window.length - strength; i++) {
    const h = window[i].high;
    const l = window[i].low;
    let isHigh = true;
    let isLow = true;
    for (let j = i - strength; j <= i + strength; j++) {
      if (j === i) continue;
      if (window[j].high > h) isHigh = false;
      if (window[j].low < l) isLow = false;
    }
    if (isHigh) highs.push(h);
    if (isLow) lows.push(l);
  }
  return { highs, lows };
}

/** Merge price levels that sit within `tolerance` of each other into one zone (their mean). */
function clusterLevels(values: number[], tolerance: number): number[] {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = clusters[clusters.length - 1];
    if (Math.abs(sorted[i] - last[last.length - 1]) <= tolerance) last.push(sorted[i]);
    else clusters.push([sorted[i]]);
  }
  return clusters.map((c) => c.reduce((a, b) => a + b, 0) / c.length);
}

/**
 * Build support/resistance zones from real recent swing highs/lows (last 50
 * candles on the supplied higher timeframe). Resistances are swing highs above
 * price, supports are swing lows below price, each clustered into zones.
 */
export function buildKeyLevels(candles: OHLCCandle[], price: number): KeyLevels {
  if (!candles || candles.length < 5 || price <= 0) {
    return { supports: [], resistances: [], nearestSupport: null, nearestResistance: null };
  }
  const { highs, lows } = findSwingLevels(candles, 50, 2);
  const window = candles.slice(-50);
  const recentHigh = Math.max(...window.map((c) => c.high));
  const recentLow = Math.min(...window.map((c) => c.low));
  // Merge swings within ~0.15% of price into a single zone.
  const tol = price * 0.0015;

  const resCandidates = clusterLevels([...highs, recentHigh].filter((v) => Number.isFinite(v) && v > price), tol);
  const supCandidates = clusterLevels([...lows, recentLow].filter((v) => Number.isFinite(v) && v < price), tol);

  // Resistances: nearest above price first. Supports: nearest below price first.
  const resistances = Array.from(new Set(resCandidates.map((v) => +v.toFixed(2)))).sort((a, b) => a - b).slice(0, 3);
  const supports = Array.from(new Set(supCandidates.map((v) => +v.toFixed(2)))).sort((a, b) => b - a).slice(0, 3);

  return {
    supports,
    resistances,
    nearestSupport: supports.length ? supports[0] : null,
    nearestResistance: resistances.length ? resistances[0] : null,
  };
}

/**
 * Persist the latest confluence direction per asset and return the timestamp at
 * which the direction last changed. Used to show "signal changed X ago".
 */
export function recordDirection(asset: AssetKey, dir: TrendDir): number {
  const key = `ai_signal_dir_${asset}`;
  try {
    const raw = localStorage.getItem(key);
    const prev = raw ? (JSON.parse(raw) as { dir: TrendDir; changedAt: number }) : null;
    if (prev && prev.dir === dir && Number.isFinite(prev.changedAt)) return prev.changedAt;
    const changedAt = Date.now();
    localStorage.setItem(key, JSON.stringify({ dir, changedAt }));
    return changedAt;
  } catch {
    return Date.now();
  }
}

/**
 * Generate the trade setup of the day from the bias + the live price.
 *
 * Uses the SAME unified ATR-based risk model (`atrLevels`) as the Signals panel,
 * the Analyze card and the Telegram bot — so Entry / SL / TP / R:R are identical
 * across the whole platform. `atrSeries` is the candle series used to measure
 * ATR (the M5 / live series, matching the default Signals view).
 */
export function buildTradeSetup(
  dir: TrendDir,
  price: number,
  atrSeries: OHLCCandle[],
  decimals = 2,
): TradeSetup {
  if (price <= 0 || dir === 'neutral') {
    return { side: 'none', entry: +Math.max(price, 0).toFixed(decimals), stopLoss: 0, takeProfit1: 0, takeProfit2: 0, riskReward: 0 };
  }
  const side: 'buy' | 'sell' = dir === 'up' ? 'buy' : 'sell';
  const atr = calculateATR(atrSeries);
  const lv = atrLevels(side, price, atr, decimals);
  return {
    side,
    entry: lv.entry,
    stopLoss: lv.stopLoss,
    takeProfit1: lv.takeProfit1,
    takeProfit2: lv.takeProfit2,
    riskReward: lv.riskReward,
  };
}

/** Fetch BTC candles for a timeframe from Kraken. */
async function fetchBtcTF(tf: TFConfig): Promise<OHLCCandle[]> {
  try {
    return await fetchOHLC('XBT/USD', tf.krakenInterval);
  } catch {
    return [];
  }
}

/** Fetch gold candles for a timeframe from the commodities-prices function. */
async function fetchGoldTF(tf: TFConfig): Promise<OHLCCandle[]> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const res = await fetch(
      `${supabaseUrl}/functions/v1/commodities-prices?mode=history&code=XAU&range=${tf.goldRange}`,
      { headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey } },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !Array.isArray(data.candles)) return [];
    const candles: OHLCCandle[] = data.candles.map((c: { time: number; open: number; high: number; low: number; close: number }) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: 0,
    }));
    return aggregateCandles(candles, tf.goldAgg);
  } catch {
    return [];
  }
}

/** Run the full multi-timeframe analysis for one asset. */
export async function analyzeAsset(asset: 'btc' | 'gold', price: number): Promise<AssetAnalysis> {
  const fetcher = asset === 'btc' ? fetchBtcTF : fetchGoldTF;
  const series = await Promise.all(AI_TIMEFRAMES.map((tf) => fetcher(tf)));

  const trends: TFTrend[] = AI_TIMEFRAMES.map((tf, i) => {
    const t = trendFromCandles(series[i]);
    return { ...t, label: tf.label };
  });

  const confluence = computeConfluence(trends);

  // Use H4 (index 1) for key levels, fall back to D1, then H1.
  const levelSeries = series[1]?.length ? series[1] : series[0]?.length ? series[0] : series[2] || [];
  const effectivePrice = price > 0 ? price : levelSeries.length ? levelSeries[levelSeries.length - 1].close : 0;
  const levels = buildKeyLevels(levelSeries, effectivePrice);
  // ATR for the trade setup uses the M15 series — the SAME base timeframe the
  // Telegram bot uses (computeEngine → buildAssetSignal @ M15) — so Confluence,
  // Signals@M15 and Telegram all produce identical ATR-based Entry/SL/TP.
  // AI_TIMEFRAMES order: [D1, H4, H1, M30, M15, M5] → index 4 = M15.
  const atrSeries = series[4]?.length ? series[4] : series[5]?.length ? series[5] : levelSeries;
  const decimals = asset === 'btc' ? 0 : 2;
  const setup = buildTradeSetup(confluence.dir, effectivePrice, atrSeries, decimals);
  const signalChangedAt = recordDirection(asset, confluence.dir);

  return { trends, confluence, levels, setup, price: effectivePrice, signalChangedAt };
}

// ─── Forex sessions ───
// Session windows / open-closed checks come from the shared session-label.ts
// (imported at the top). The UI here just adds live open/close countdowns on top
// of that shared check, so the cards, the signal engine and the Telegram label
// can never drift apart.

export interface SessionStatus {
  name: string;
  emoji: string;
  active: boolean;
  /** Countdown label to the next state flip (open or close). */
  countdown: string;
  /** Whether the countdown is until this session opens (false = until close). */
  untilOpen: boolean;
}

// Familiar chronological display order (Asian → London → New York).
const SESSION_DISPLAY_ORDER: SessionName[] = ['Asian', 'London', 'New York'];
const SESSIONS_FOR_DISPLAY: FxSession[] = SESSION_DISPLAY_ORDER.map(
  (n) => FX_SESSIONS.find((s) => s.name === n)!,
);

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Next future UTC time whose hour equals `hour` (today or tomorrow). */
function nextUtcHour(now: Date, hour: number): Date {
  const d = new Date(now);
  d.setUTCHours(hour, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export function getSessionStatuses(now = new Date()): SessionStatus[] {
  return SESSIONS_FOR_DISPLAY.map((s) => {
    const active = isSessionOpen(s, now);
    const flipAt = active ? nextUtcHour(now, s.close) : nextUtcHour(now, s.open);
    return {
      name: s.name,
      emoji: s.emoji,
      active,
      countdown: fmtCountdown(flipAt.getTime() - now.getTime()),
      untilOpen: !active,
    };
  });
}

