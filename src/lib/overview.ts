import { OHLCCandle } from './krakenApi';
import { computeIndicators, summarizeSignals, SignalSummary } from './indicators';

/** A single asset row shown in the at-a-glance overview grid. */
export interface OverviewEntry {
  /** Stable key used for selection (crypto pair or metal code). */
  key: string;
  /** Display symbol, e.g. BTC, XAU. */
  symbol: string;
  name: string;
  /** Emoji or character logo. */
  logo: string;
  price: number;
  /** 24h (or period) percentage change. */
  change: number;
  /** Recent closes used to draw the sparkline. */
  closes: number[];
  /** Computed Buy/Sell signal summary, or null when no candle data. */
  summary: SignalSummary | null;
  /** Accent color for the card. */
  accentColor: string;
}

/** Result of analyzing a candle series for the overview. */
export interface OverviewSignal {
  closes: number[];
  summary: SignalSummary | null;
}

/**
 * Compute the sparkline closes + Buy/Sell summary for a candle series.
 * Uses the exact same indicator + summary logic as the full analysis view,
 * so overview signals stay consistent with the detail screen.
 */
export function analyzeCandles(candles: OHLCCandle[], price: number): OverviewSignal {
  if (!candles || candles.length === 0) {
    return { closes: [], summary: null };
  }
  const closes = candles.map((c) => c.close);
  const ind = computeIndicators(candles);
  const refPrice = price > 0 ? price : closes[closes.length - 1];
  const summary = summarizeSignals(ind, refPrice);
  return { closes, summary };
}

/** Run async tasks with a bounded concurrency to stay friendly to public APIs. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
