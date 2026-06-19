// ─────────────────────────────────────────────────────────────────────────────
// signal-data.ts — candle fetching for the Telegram bot, using the SAME sources
// and the SAME timeframe/aggregation maps as the app (src/lib/signalData.ts):
//   • Gold  → commodities-prices edge function (history mode)  [identical to app]
//   • BTC   → Kraken OHLC                                       [identical to app]
//   • Oil   → Yahoo Finance CL=F (single series → buildLocalSignal; oil is not
//             an app asset, so it uses the same single-series decision core)
// ─────────────────────────────────────────────────────────────────────────────

import { OHLCCandle, SignalTF, SIGNAL_TIMEFRAMES, aggregateCandles } from "./signal-core.ts";

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

// ── Macro snapshot (DXY, Fear & Greed, S&P) — identical source to app ──
export async function fetchMacro(): Promise<{ dxyChangePct: number | null; fearGreed: number | null; spxChangePct: number | null }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/market-sentiment`, {
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => null);
    return {
      dxyChangePct: data?.dxy?.changePct ?? null,
      fearGreed: data?.sentiment?.value ?? null,
      spxChangePct: data?.spx?.changePct ?? null,
    };
  } catch {
    return { dxyChangePct: null, fearGreed: null, spxChangePct: null };
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
