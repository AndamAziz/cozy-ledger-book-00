import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Quote shape returned for every supported asset. */
interface Quote {
  symbol: string;
  price: number;
  changePct: number;
  high24h: number;
  low24h: number;
}

const CRYPTO: Record<string, string> = {
  "BTC/USD": "BTCUSDT",
  "ETH/USD": "ETHUSDT",
  "BNB/USD": "BNBUSDT",
  "SOL/USD": "SOLUSDT",
  "XRP/USD": "XRPUSDT",
};

const METALS: Record<string, string> = {
  "XAU/USD": "XAU",
  "XAG/USD": "XAG",
};

// Short cache so client polling (~2s) gets fresh data without hammering upstreams.
const CACHE_TTL = 1500;
let cache: { ts: number; quotes: Record<string, Quote> } | null = null;

// In-memory daily open + high/low tracking for metals & forex (no free history API).
const dayStats: Record<string, { day: string; open: number; high: number; low: number }> = {};

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function trackDayStat(symbol: string, price: number): { changePct: number; high: number; low: number } {
  const day = utcDay();
  const s = dayStats[symbol];
  if (!s || s.day !== day) {
    dayStats[symbol] = { day, open: price, high: price, low: price };
    return { changePct: 0, high: price, low: price };
  }
  s.high = Math.max(s.high, price);
  s.low = Math.min(s.low, price);
  const changePct = s.open > 0 ? ((price - s.open) / s.open) * 100 : 0;
  return { changePct, high: s.high, low: s.low };
}

async function fetchCrypto(): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  try {
    const symbols = Object.values(CRYPTO);
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(
      JSON.stringify(symbols),
    )}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) { await res.text(); return out; }
    const data = await res.json();
    const bySym: Record<string, Record<string, string>> = {};
    for (const row of data) bySym[row.symbol] = row;
    for (const [pair, bin] of Object.entries(CRYPTO)) {
      const row = bySym[bin];
      if (!row) continue;
      const price = Number(row.lastPrice);
      if (!Number.isFinite(price) || price <= 0) continue;
      out[pair] = {
        symbol: pair,
        price,
        changePct: Number(row.priceChangePercent) || 0,
        high24h: Number(row.highPrice) || price,
        low24h: Number(row.lowPrice) || price,
      };
    }
  } catch (e) {
    console.error("crypto fetch error", e);
  }
  return out;
}

async function fetchMetals(): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  await Promise.all(
    Object.entries(METALS).map(async ([pair, code]) => {
      try {
        const res = await fetch(`https://api.gold-api.com/price/${code}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) { await res.text(); return; }
        const d = await res.json();
        const price = Number(d?.price);
        if (!Number.isFinite(price) || price <= 0) return;
        const stat = trackDayStat(pair, price);
        out[pair] = { symbol: pair, price: +price.toFixed(2), changePct: stat.changePct, high24h: stat.high, low24h: stat.low };
      } catch (e) {
        console.error("metal fetch error", pair, e);
      }
    }),
  );
  return out;
}

async function fetchForex(): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  try {
    const res = await fetch(
      "https://api.frankfurter.app/latest?base=USD&symbols=EUR,GBP,JPY",
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) { await res.text(); return out; }
    const data = await res.json();
    const r = data?.rates ?? {};
    const pairs: Record<string, number> = {};
    if (r.EUR) pairs["EUR/USD"] = 1 / r.EUR;
    if (r.GBP) pairs["GBP/USD"] = 1 / r.GBP;
    if (r.JPY) pairs["USD/JPY"] = r.JPY;
    for (const [pair, price] of Object.entries(pairs)) {
      if (!Number.isFinite(price) || price <= 0) continue;
      const dec = pair === "USD/JPY" ? 3 : 5;
      const p = +price.toFixed(dec);
      const stat = trackDayStat(pair, p);
      out[pair] = { symbol: pair, price: p, changePct: stat.changePct, high24h: stat.high, low24h: stat.low };
    }
  } catch (e) {
    console.error("forex fetch error", e);
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return new Response(JSON.stringify({ quotes: cache.quotes, cached: true, ts: cache.ts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const [crypto, metals, forex] = await Promise.all([
    fetchCrypto(),
    fetchMetals(),
    fetchForex(),
  ]);

  const quotes = { ...crypto, ...metals, ...forex };

  // Merge with previous cache so a transient upstream failure doesn't drop an asset.
  if (cache) {
    for (const [sym, q] of Object.entries(cache.quotes)) {
      if (!quotes[sym]) quotes[sym] = q;
    }
  }

  cache = { ts: Date.now(), quotes };

  return new Response(JSON.stringify({ quotes, cached: false, ts: cache.ts }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
