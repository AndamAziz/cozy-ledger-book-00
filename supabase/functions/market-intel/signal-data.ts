// ─────────────────────────────────────────────────────────────────────────────
// signal-data.ts — candle fetching for the Telegram bot, using the SAME sources
// and the SAME timeframe/aggregation maps as the app (src/lib/signalData.ts):
//   • Gold  → commodities-prices edge function (history mode)  [identical to app]
//   • BTC   → Kraken OHLC                                       [identical to app]
//   • Oil   → Yahoo Finance CL=F (single series → buildLocalSignal; oil is not
//             an app asset, so it uses the same single-series decision core)
// ─────────────────────────────────────────────────────────────────────────────

import { OHLCCandle, SignalTF, SIGNAL_TIMEFRAMES, aggregateCandles, MacroContext } from "./signal-core.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

// ── BTC: Kraken interval (minutes) per timeframe — identical to app ──
const BTC_INTERVAL: Record<SignalTF, number> = {
  M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440,
};

// ── Gold: commodities-prices range + aggregation per timeframe — identical to app ──
const GOLD_TF: Record<SignalTF, { range: string; agg: number }> = {
  M5: { range: "5min", agg: 1 },
  M15: { range: "15min", agg: 1 },
  M30: { range: "5d", agg: 2 },
  H1: { range: "1mo", agg: 1 },
  H4: { range: "1mo", agg: 4 },
  D1: { range: "3mo", agg: 1 },
};

const REST_PAIR_MAP: Record<string, string> = { "XBT/USD": "XXBTZUSD" };

async function fetchKrakenOHLC(pair: string, interval: number): Promise<OHLCCandle[]> {
  try {
    const restPair = REST_PAIR_MAP[pair] || pair.replace("/", "");
    const candleCount = 300;
    const since = Math.floor(Date.now() / 1000) - candleCount * interval * 60;
    const url = `https://api.kraken.com/0/public/OHLC?pair=${restPair}&interval=${interval}&since=${since}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data.error && data.error.length > 0) return [];
    const resultKey = Object.keys(data.result).find((k) => k !== "last");
    if (!resultKey) return [];
    return data.result[resultKey].map((c: number[]) => ({
      time: c[0],
      open: parseFloat(String(c[1])),
      high: parseFloat(String(c[2])),
      low: parseFloat(String(c[3])),
      close: parseFloat(String(c[4])),
      volume: parseFloat(String(c[6])),
    }));
  } catch {
    return [];
  }
}

async function fetchGoldCandles(range: string, agg: number): Promise<OHLCCandle[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/commodities-prices?mode=history&code=XAU&range=${range}`,
      {
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !Array.isArray(data.candles)) return [];
    const candles: OHLCCandle[] = data.candles.map(
      (c: { time: number; open: number; high: number; low: number; close: number }) => ({
        time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0,
      }),
    );
    return aggregateCandles(candles, agg);
  } catch {
    return [];
  }
}

// ── Oil (WTI) single series via Yahoo CL=F — 5-minute bars over 5 days ──
async function fetchOilSeries(): Promise<OHLCCandle[]> {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/CL=F?interval=5m&range=5d",
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) },
    );
    const data = await res.json().catch(() => null);
    const r = data?.chart?.result?.[0];
    const ts: number[] = r?.timestamp ?? [];
    const q = r?.indicators?.quote?.[0];
    if (!ts.length || !q) return [];
    const out: OHLCCandle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      if ([o, h, l, c].some((v) => v == null || !Number.isFinite(v))) continue;
      out.push({ time: ts[i], open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 });
    }
    return out;
  } catch {
    return [];
  }
}

export async function fetchGoldAllTF(): Promise<Partial<Record<SignalTF, OHLCCandle[]>>> {
  const entries = await Promise.all(
    SIGNAL_TIMEFRAMES.map(async (tf) => {
      const c = GOLD_TF[tf];
      return [tf, await fetchGoldCandles(c.range, c.agg)] as const;
    }),
  );
  const out: Partial<Record<SignalTF, OHLCCandle[]>> = {};
  for (const [tf, c] of entries) out[tf] = c;
  return out;
}

export async function fetchBtcAllTF(): Promise<Partial<Record<SignalTF, OHLCCandle[]>>> {
  const entries = await Promise.all(
    SIGNAL_TIMEFRAMES.map(async (tf) => [tf, await fetchKrakenOHLC("XBT/USD", BTC_INTERVAL[tf])] as const),
  );
  const out: Partial<Record<SignalTF, OHLCCandle[]>> = {};
  for (const [tf, c] of entries) out[tf] = c;
  return out;
}

export async function fetchOilAllTF(): Promise<OHLCCandle[]> {
  return await fetchOilSeries();
}

// ── Silver (XAG) — commodities-prices history, identical range/agg map to gold ──
async function fetchSilverCandles(range: string, agg: number): Promise<OHLCCandle[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/commodities-prices?mode=history&code=XAG&range=${range}`,
      {
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !Array.isArray(data.candles)) return [];
    const candles: OHLCCandle[] = data.candles.map(
      (c: { time: number; open: number; high: number; low: number; close: number }) => ({
        time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0,
      }),
    );
    return aggregateCandles(candles, agg);
  } catch {
    return [];
  }
}

export async function fetchSilverAllTF(): Promise<Partial<Record<SignalTF, OHLCCandle[]>>> {
  const entries = await Promise.all(
    SIGNAL_TIMEFRAMES.map(async (tf) => {
      const c = GOLD_TF[tf];
      return [tf, await fetchSilverCandles(c.range, c.agg)] as const;
    }),
  );
  const out: Partial<Record<SignalTF, OHLCCandle[]>> = {};
  for (const [tf, c] of entries) out[tf] = c;
  return out;
}

// ── Forex (EUR/USD, GBP/USD, USD/JPY) — forex-prices history, identical to app ──
const FOREX_TF: Record<SignalTF, { range: string; agg: number }> = {
  M5: { range: "1d", agg: 1 },
  M15: { range: "5d", agg: 1 },
  M30: { range: "5d", agg: 2 },
  H1: { range: "1mo", agg: 1 },
  H4: { range: "1mo", agg: 4 },
  D1: { range: "3mo", agg: 1 },
};

// Yahoo gives USD/CODE (e.g. USD/EUR); EUR/USD = 1/that. Invert candles for
// pairs quoted as XXX/USD (EUR, GBP); USD/JPY is already USD-base (no invert).
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

async function fetchForexCandles(code: string, range: string, agg: number, invert: boolean): Promise<OHLCCandle[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/forex-prices?history=${encodeURIComponent(code)}&range=${range}`,
      {
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !Array.isArray(data.candles)) return [];
    const candles: OHLCCandle[] = data.candles.map(
      (c: { time: number; open: number; high: number; low: number; close: number }) => ({
        time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: 0,
      }),
    );
    const fixed = invert ? invertCandles(candles) : candles;
    return aggregateCandles(fixed, agg);
  } catch {
    return [];
  }
}

export async function fetchForexAllTF(code: string, invert: boolean): Promise<Partial<Record<SignalTF, OHLCCandle[]>>> {
  const entries = await Promise.all(
    SIGNAL_TIMEFRAMES.map(async (tf) => {
      const c = FOREX_TF[tf];
      return [tf, await fetchForexCandles(code, c.range, c.agg, invert)] as const;
    }),
  );
  const out: Partial<Record<SignalTF, OHLCCandle[]>> = {};
  for (const [tf, c] of entries) out[tf] = c;
  return out;
}

// ── Crypto (ETH/SOL/XRP/BNB) — Binance klines (BNB is not on Kraken) ──
const BINANCE_INTERVAL: Record<SignalTF, string> = {
  M5: "5m", M15: "15m", M30: "30m", H1: "1h", H4: "4h", D1: "1d",
};

async function fetchBinanceKlines(binanceSym: string, interval: string): Promise<OHLCCandle[]> {
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=${interval}&limit=300`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) { await res.text(); return []; }
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((c: (string | number)[]) => ({
      time: Math.floor(Number(c[0]) / 1000),
      open: parseFloat(String(c[1])),
      high: parseFloat(String(c[2])),
      low: parseFloat(String(c[3])),
      close: parseFloat(String(c[4])),
      volume: parseFloat(String(c[5])),
    }));
  } catch {
    return [];
  }
}

export async function fetchCryptoAllTF(binanceSym: string): Promise<Partial<Record<SignalTF, OHLCCandle[]>>> {
  const entries = await Promise.all(
    SIGNAL_TIMEFRAMES.map(async (tf) => [tf, await fetchBinanceKlines(binanceSym, BINANCE_INTERVAL[tf])] as const),
  );
  const out: Partial<Record<SignalTF, OHLCCandle[]>> = {};
  for (const [tf, c] of entries) out[tf] = c;
  return out;
}


// ── Macro snapshot (DXY, Fear & Greed, VIX, US10Y, S&P) — identical source/logic
// to the web Signals panel. Fear & Greed is asset-aware:
//   fgSource 'cnn'    → CNN US-stock index   (gold / silver / forex)
//   fgSource 'crypto' → alternative.me index (BTC / crypto)
export async function fetchMacro(
  fgSource: "cnn" | "crypto" = "cnn",
): Promise<MacroContext> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/market-sentiment`, {
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => null);
    const cnnFg = data?.sentimentCnn?.value ?? null;
    const cryptoFg = data?.sentimentCrypto?.value ?? data?.sentiment?.value ?? null;
    return {
      dxyChangePct: data?.dxy?.changePct ?? null,
      fearGreed: fgSource === "crypto" ? cryptoFg : (cnnFg ?? cryptoFg),
      spxChangePct: data?.spx?.changePct ?? null,
      vix: data?.vix?.price ?? null,
      us10y: data?.us10y?.price ?? null,
      us10yChangePct: data?.us10y?.changePct ?? null,
    };
  } catch {
    return { dxyChangePct: null, fearGreed: null, spxChangePct: null, vix: null, us10y: null, us10yChangePct: null };
  }
}

// ── Economic calendar events — identical source to app ──
export async function fetchEvents(): Promise<Array<{ title: string; country: string; impact: string; date: string; forecast: string; previous: string; actual: string }>> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/market-news`, {
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => null);
    return Array.isArray(data?.events) ? data.events : [];
  } catch {
    return [];
  }
}
