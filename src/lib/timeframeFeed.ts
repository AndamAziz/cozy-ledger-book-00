import { SignalTF } from './signalEngine';

/**
 * Single source of truth for how each analysis timeframe pulls its history from
 * the backend (`commodities-prices` for gold/oil, `forex-prices` for FX).
 *
 * Consumed by BOTH:
 *   - the signal engine (`signalData.ts` → buildAssetSignal / Confluence), and
 *   - the price chart (`MetalsChart` via `useMetalsHistory`).
 *
 * Keeping one map guarantees the candles a user sees on the chart are the exact
 * same series the engine analyzes for that timeframe — no more D1 meaning
 * "one day of 5-minute bars" on the chart but "3 months of daily bars" in the
 * engine. `range` is the backend range key; `agg` is the client-side
 * aggregation factor applied to the returned candles.
 */
export interface FeedSpec {
  range: string;
  agg: number;
}

/** commodities-prices history range + aggregation per timeframe (gold + oil). */
export const COMMODITY_TF_FEED: Record<SignalTF, FeedSpec> = {
  M5: { range: '5min', agg: 1 },
  M15: { range: '15min', agg: 1 },
  M30: { range: '5d', agg: 2 },
  H1: { range: '1mo', agg: 1 },
  H4: { range: '1mo', agg: 4 },
  D1: { range: '3mo', agg: 1 },
};

/** forex-prices history range + aggregation per timeframe. */
export const FOREX_TF_FEED: Record<SignalTF, FeedSpec> = {
  M5: { range: '1d', agg: 1 },
  M15: { range: '5d', agg: 1 },
  M30: { range: '5d', agg: 2 },
  H1: { range: '1mo', agg: 1 },
  H4: { range: '1mo', agg: 4 },
  D1: { range: '3mo', agg: 1 },
};

/**
 * Chart timeframe buttons. For the M5→D1 timeframes these delegate straight to
 * `COMMODITY_TF_FEED`, so the chart and the signal engine share one mapping.
 * `1min` is chart-only (the engine's shortest timeframe is M5).
 */
export interface ChartTimeframe {
  /** Stable key stored as the chart's `range` state. */
  key: string;
  /** Button label. */
  label: string;
  /** Backend range + client aggregation. */
  feed: FeedSpec;
  /** Matching signal-engine timeframe (undefined for chart-only 1min). */
  signalTF?: SignalTF;
  /** Intraday timeframes show hour:minute axis ticks; D1 shows day/month. */
  intraday: boolean;
}

export const CHART_TIMEFRAMES: ChartTimeframe[] = [
  { key: '1min', label: '1m', feed: { range: '1min', agg: 1 }, intraday: true },
  { key: 'M5', label: '5m', feed: COMMODITY_TF_FEED.M5, signalTF: 'M5', intraday: true },
  { key: 'M15', label: '15m', feed: COMMODITY_TF_FEED.M15, signalTF: 'M15', intraday: true },
  { key: 'M30', label: '30m', feed: COMMODITY_TF_FEED.M30, signalTF: 'M30', intraday: true },
  { key: 'H1', label: '1H', feed: COMMODITY_TF_FEED.H1, signalTF: 'H1', intraday: true },
  { key: 'H4', label: '4H', feed: COMMODITY_TF_FEED.H4, signalTF: 'H4', intraday: true },
  { key: 'D1', label: '1D', feed: COMMODITY_TF_FEED.D1, signalTF: 'D1', intraday: false },
];

/** Resolve a chart timeframe key to its backend feed spec. Falls back to M15. */
export function chartFeedFor(key: string): FeedSpec {
  return CHART_TIMEFRAMES.find((t) => t.key === key)?.feed ?? COMMODITY_TF_FEED.M15;
}

/** Backend range key → bar length in seconds (matches the server intervals). */
const RANGE_STEP_SECONDS: Record<string, number> = {
  '1min': 60, '5min': 300, '15min': 900, '1d': 300, '5d': 900,
  '1mo': 3600, '3mo': 86_400, '6mo': 86_400, '1y': 86_400, '5y': 604_800,
};

/**
 * Bar length in seconds for a resolved feed (range × aggregation). Used to align
 * S/R pivot maths to real candle boundaries and skip synthetic spot candles.
 */
export function feedStepSeconds(feed: FeedSpec): number {
  const base = RANGE_STEP_SECONDS[feed.range] ?? 60;
  return base * (feed.agg > 1 ? feed.agg : 1);
}
