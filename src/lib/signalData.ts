import { OHLCCandle, fetchOHLC } from './krakenApi';
import { aggregateCandles } from './aiAnalysis';
import { fetchForexCandles } from './forexApi';
import { COMMODITY_TF_FEED, FOREX_TF_FEED } from './timeframeFeed';
import {
  AssetKey,
  SignalTF,
  SIGNAL_TIMEFRAMES,
  MacroContext,
  NewsEvent,
} from './signalEngine';

export interface AssetMeta {
  key: AssetKey;
  label: string;
  short: string;
  emoji: string;
  decimals: number;
  /** News currencies relevant to this asset. */
  currencies: string[];
  source: 'btc' | 'gold' | 'forex' | 'commodity';
  /** Forex code (for forex source). */
  forexCode?: string;
  /** Invert forex candles (e.g. EUR/USD = 1 / USDEUR). */
  invert?: boolean;
  /** commodities-prices code (for gold/commodity source, e.g. XAU, USOIL). */
  commodityCode?: string;
}

export const SIGNAL_ASSETS: AssetMeta[] = [
  { key: 'gold', label: 'XAU/USD', short: 'Gold', emoji: '🥇', decimals: 2, currencies: ['USD', 'EUR', 'CHF', 'GBP', 'JPY'], source: 'gold', commodityCode: 'XAU' },
  { key: 'btc', label: 'BTC/USD', short: 'Bitcoin', emoji: '₿', decimals: 0, currencies: ['USD'], source: 'btc' },
  { key: 'usoil', label: 'USOIL', short: 'USOIL', emoji: '🛢️', decimals: 2, currencies: ['USD'], source: 'commodity', commodityCode: 'USOIL' },
  { key: 'eurusd', label: 'EUR/USD', short: 'EUR/USD', emoji: '🇪🇺', decimals: 4, currencies: ['EUR', 'USD'], source: 'forex', forexCode: 'EUR', invert: true },
  { key: 'gbpusd', label: 'GBP/USD', short: 'GBP/USD', emoji: '🇬🇧', decimals: 4, currencies: ['GBP', 'USD'], source: 'forex', forexCode: 'GBP', invert: true },
  { key: 'usdjpy', label: 'USD/JPY', short: 'USD/JPY', emoji: '🇯🇵', decimals: 2, currencies: ['USD', 'JPY'], source: 'forex', forexCode: 'JPY', invert: false },
];

export function getAssetMeta(key: AssetKey): AssetMeta {
  return SIGNAL_ASSETS.find((a) => a.key === key) ?? SIGNAL_ASSETS[0];
}

/**
 * Asset-selector dropdown options (UI only). Shared by the Signals and
 * Confluence tabs so both dropdowns stay identical. A key may be listed here
 * before the analysis engine supports it (e.g. USOIL) — selecting an
 * unsupported asset shows a friendly fallback instead of breaking analysis.
 */
export type DropdownAssetKey = AssetKey | 'usoil';

export interface DropdownAsset {
  key: DropdownAssetKey;
  emoji: string;
  label: string;
}

export const DROPDOWN_ASSETS: DropdownAsset[] = [
  { key: 'gold', emoji: '🥇', label: 'XAU/USD' },
  { key: 'btc', emoji: '₿', label: 'BTC/USD' },
  { key: 'usoil', emoji: '🛢️', label: 'USOIL' },
  { key: 'eurusd', emoji: '🇪🇺', label: 'EUR/USD' },
  { key: 'gbpusd', emoji: '🇬🇧', label: 'GBP/USD' },
  { key: 'usdjpy', emoji: '🇯🇵', label: 'USD/JPY' },
];

/** True when the analysis engine supports the given dropdown asset key. */
export function isSupportedAsset(key: string): key is AssetKey {
  return SIGNAL_ASSETS.some((a) => a.key === key);
}

/** Kraken interval (minutes) per timeframe for BTC. */
const BTC_INTERVAL: Record<SignalTF, number> = {
  M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440,
};

// Commodity (gold/oil) & forex history mappings now live in the shared
// timeframeFeed module so the chart and the signal engine stay in lock-step.
const GOLD_TF = COMMODITY_TF_FEED;
const FOREX_TF = FOREX_TF_FEED;

/** Fetch OHLC candles from the commodities-prices function (gold XAU, oil USOIL, …). */
async function fetchCommodityCandles(code: string, range: string, agg: number): Promise<OHLCCandle[]> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const res = await fetch(
      `${supabaseUrl}/functions/v1/commodities-prices?mode=history&code=${encodeURIComponent(code)}&range=${range}`,
      { headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey } },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !Array.isArray(data.candles)) return [];
    const candles: OHLCCandle[] = data.candles.map((c: { time: number; open: number; high: number; low: number; close: number }) => ({
      time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0,
    }));
    return aggregateCandles(candles, agg);
  } catch {
    return [];
  }
}

function invertCandles(candles: OHLCCandle[]): OHLCCandle[] {
  return candles
    .filter((c) => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0)
    .map((c) => ({
      time: c.time,
      open: 1 / c.open,
      close: 1 / c.close,
      high: 1 / c.low,
      low: 1 / c.high,
      volume: 0,
    }));
}

async function fetchForexTF(code: string, range: string, agg: number, invert: boolean): Promise<OHLCCandle[]> {
  const raw = await fetchForexCandles(code, range);
  const candles: OHLCCandle[] = raw.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0 }));
  const fixed = invert ? invertCandles(candles) : candles;
  return aggregateCandles(fixed, agg);
}

/** Fetch OHLC candles for one asset + timeframe. */
export async function fetchAssetTF(meta: AssetMeta, tf: SignalTF): Promise<OHLCCandle[]> {
  try {
    if (meta.source === 'btc') return await fetchOHLC('XBT/USD', BTC_INTERVAL[tf]);
    if (meta.source === 'gold' || meta.source === 'commodity') {
      const c = GOLD_TF[tf];
      return await fetchCommodityCandles(meta.commodityCode ?? 'XAU', c.range, c.agg);
    }
    const c = FOREX_TF[tf];
    return await fetchForexTF(meta.forexCode!, c.range, c.agg, !!meta.invert);
  } catch {
    return [];
  }
}

/** Fetch candles for every timeframe of an asset (used for conflict detection). */
export async function fetchAssetAllTF(meta: AssetMeta): Promise<Partial<Record<SignalTF, OHLCCandle[]>>> {
  const entries = await Promise.all(
    SIGNAL_TIMEFRAMES.map(async (tf) => [tf, await fetchAssetTF(meta, tf)] as const),
  );
  const out: Partial<Record<SignalTF, OHLCCandle[]>> = {};
  for (const [tf, c] of entries) out[tf] = c;
  return out;
}

const headers = {
  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
};

/**
 * Fetch the shared macro snapshot (DXY, Fear & Greed, S&P 500).
 * Fear & Greed source depends on the asset: BTC/crypto uses the alternative.me
 * crypto index; gold / forex / SPX use the CNN (US stock market) index.
 */
export async function fetchMacro(asset?: AssetKey): Promise<MacroContext> {
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-sentiment`, { headers });
    const data = await res.json();
    const isCrypto = asset === 'btc';
    const cnnFg = data?.sentimentCnn?.value ?? null;
    const cryptoFg = data?.sentimentCrypto?.value ?? data?.sentiment?.value ?? null;
    return {
      dxyChangePct: data?.dxy?.changePct ?? null,
      fearGreed: isCrypto ? cryptoFg : (cnnFg ?? cryptoFg),
      spxChangePct: data?.spx?.changePct ?? null,
      vix: data?.vix?.price ?? null,
      us10y: data?.us10y?.price ?? null,
      us10yChangePct: data?.us10y?.changePct ?? null,
    };
  } catch {
    return { dxyChangePct: null, fearGreed: null, spxChangePct: null, vix: null, us10y: null, us10yChangePct: null };
  }
}

/** Fetch the economic calendar events. */
export async function fetchEvents(): Promise<NewsEvent[]> {
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-news`, { headers });
    const data = await res.json();
    return Array.isArray(data?.events) ? data.events : [];
  } catch {
    return [];
  }
}
