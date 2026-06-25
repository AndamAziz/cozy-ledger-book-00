import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Shared DB cache (cached_market_prices) so every isolate serves the same
// recent metals snapshot instead of each cold isolate re-hitting the upstreams. ───
const METALS_CACHE_KEY = "metals-live";
const METALS_DB_TTL = 10_000; // 10s shared TTL for metals (per requirements)

const _supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const _serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = _supabaseUrl && _serviceKey
  ? createClient(_supabaseUrl, _serviceKey, { auth: { persistSession: false } })
  : null;

interface CachedMetalsPayload {
  prices: Record<string, number>;
  sources: string[];
  unavailable: string[];
  spotStale: boolean;
  timestamp: number;
}

/** Read a still-valid metals snapshot from the shared DB cache, or null if missing/expired. */
async function readMetalsCache(): Promise<CachedMetalsPayload | null> {
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("cached_market_prices")
      .select("payload, expires_at")
      .eq("cache_key", METALS_CACHE_KEY)
      .maybeSingle();
    if (error || !data) return null;
    if (new Date(data.expires_at as string).getTime() <= Date.now()) return null;
    const payload = data.payload as CachedMetalsPayload;
    if (!payload?.prices || Object.keys(payload.prices).length === 0) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Persist a fresh metals snapshot to the shared DB cache with an explicit TTL. */
async function writeMetalsCache(payload: CachedMetalsPayload): Promise<void> {
  if (!db) return;
  try {
    await db.from("cached_market_prices").upsert({
      cache_key: METALS_CACHE_KEY,
      payload,
      expires_at: new Date(Date.now() + METALS_DB_TTL).toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* cache write failures must never break the response */
  }
}

const YAHOO_SYMBOLS: Record<string, string> = {
  XAU: "GC=F",
  XAG: "SI=F",
  XPT: "PL=F",
  XPD: "PA=F",
  USOIL: "CL=F",
  UKOIL: "BZ=F",
  NATGAS: "NG=F",
};

const SPOT_METAL_SYMBOLS: Record<string, string> = {
  XAU: "xauusd",
  XAG: "xagusd",
  XPT: "xptusd",
  XPD: "xpdusd",
};

const TWELVE_DATA_SYMBOLS: Record<string, string> = {
  XAU: "XAU/USD",
  XAG: "XAG/USD",
  XPT: "XPT/USD",
  XPD: "XPD/USD",
};



const yahooHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Referer": "https://finance.yahoo.com/",
};

// Primary FREE spot source — api.gold-api.com (no key required). Returns true broker
// spot for XAU/XAG/XPT/XPD, unlike Yahoo GC=F/SI=F futures which trade ~$30-40 higher.
async function fetchGoldApiComMetals(): Promise<Record<string, number>> {
  try {
    const results = await Promise.all(
      GOLDAPI_METALS.map(async (code) => {
        try {
          const res = await fetch(`https://api.gold-api.com/price/${code}`, {
            headers: { "Accept": "application/json" },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) { await res.text(); return [code, null] as const; }
          const d = await res.json();
          const p = Number(d?.price);
          return [code, Number.isFinite(p) && p > 0 ? Number(p.toFixed(4)) : null] as const;
        } catch { return [code, null] as const; }
      }),
    );
    const prices: Record<string, number> = {};
    for (const [code, p] of results) if (p != null) prices[code] = p;
    return prices;
  } catch (e) {
    console.error("gold-api.com fetch error:", e);
    return {};
  }
}

// ─── Live prices cache ───
// 4s matches the free gold-api.com upstream cadence (it sends Cache-Control: max-age=4),
// so polling faster yields duplicate data. This is the fastest *meaningful* refresh.
const CACHE_TTL = 4000;
let cachedPrices: Record<string, number> | null = null;
let cacheTimestamp = 0;

// ─── OilPriceAPI cache (longer TTL to stay within rate limits) ───
let oilApiCache: Record<string, number> | null = null;
let oilApiCacheTs = 0;
const OIL_API_CACHE_TTL = 3 * 60 * 1000; // 3 minutes (max 20 req/hour on demo)

// ─── Spot metals cache (XAU/XAG/XPT/XPD spot, not futures) ───
const GOLDAPI_METALS = ["XAU", "XAG", "XPT", "XPD"];
let metalsSpotCache: Record<string, number> | null = null;
let metalsSpotCacheTs = 0;
// 4s — free gold-api.com refreshes ~every 4s. Quota-limited keyed sources are NOT
// called at this cadence; they are isolated behind KEYED_METALS_TTL below.
const METALS_SPOT_CACHE_TTL = 4 * 1000;

// ─── Keyed metals fallback cache (goldapi.io / TwelveData — limited quotas) ───
// Only used to fill metals the free source can't provide. Cached far longer so the
// fast 4s spot refresh never burns the monthly/daily quotas on these keyed APIs.
let keyedMetalsCache: Record<string, number> | null = null;
let keyedMetalsCacheTs = 0;
const KEYED_METALS_TTL = 60 * 1000; // 60s

function parseStooqPrice(csv: string): number | null {
  const lines = csv.trim().split(/\r?\n/);
  const row = lines[1]?.split(",");
  const close = Number(row?.[6]);
  return Number.isFinite(close) && close > 0 ? Number(close.toFixed(4)) : null;
}

async function fetchStooqSpotMetals(): Promise<Record<string, number>> {
  try {
    const results = await Promise.all(
      Object.entries(SPOT_METAL_SYMBOLS).map(async ([code, symbol]) => {
        try {
          const url = `https://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=csv`;
          const res = await fetch(url, { headers: yahooHeaders, signal: AbortSignal.timeout(8000) });
          if (!res.ok) { await res.text(); return [code, null] as const; }
          return [code, parseStooqPrice(await res.text())] as const;
        } catch { return [code, null] as const; }
      }),
    );

    const prices: Record<string, number> = {};
    for (const [code, p] of results) if (p != null) prices[code] = p;
    return prices;
  } catch (e) {
    console.error("Stooq spot metals fetch error:", e);
    return {};
  }
}

async function fetchTwelveDataMetals(): Promise<Record<string, number>> {
  const key = Deno.env.get("TWELVE_DATA_API_KEY");
  if (!key) return {};

  // Single batched request for all metals (saves API credits vs. one call per symbol).
  const symbols = Object.values(TWELVE_DATA_SYMBOLS).join(",");
  const codeBySymbol = Object.fromEntries(
    Object.entries(TWELVE_DATA_SYMBOLS).map(([code, sym]) => [sym, code]),
  );

  try {
    const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbols)}&apikey=${encodeURIComponent(key)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) { await res.text(); return {}; }
    const data = await res.json();
    if (data?.status === "error") return {};

    const prices: Record<string, number> = {};
    // Batch response is keyed by symbol: { "XAU/USD": { price: "..." }, ... }.
    // A single-symbol response is a bare { price: "..." } object.
    const entries: [string, unknown][] = data?.price !== undefined && !data?.[symbols.split(",")[0]]
      ? [[symbols.split(",")[0], data]]
      : Object.entries(data);
    for (const [sym, val] of entries) {
      const code = codeBySymbol[sym];
      if (!code) continue;
      const p = Number((val as { price?: unknown })?.price);
      if (Number.isFinite(p) && p > 0) prices[code] = Number(p.toFixed(4));
    }
    return prices;
  } catch (e) {
    console.error("Twelve Data metals fetch error:", e);
    return {};
  }
}

// Last-resort metals fallback: Yahoo futures (GC=F/SI=F/PL=F/PA=F). These trade slightly
// above broker spot but are free and almost always reachable, so they keep a price on
// screen when the true spot sources (GoldAPI / TwelveData) are exhausted or unreachable.
async function fetchYahooFuturesMetals(): Promise<Record<string, number>> {
  try {
    const results = await Promise.all(
      GOLDAPI_METALS.map(async (code) => {
        const symbol = YAHOO_SYMBOLS[code];
        const p = symbol ? await fetchYahooPrice(symbol) : null;
        return [code, Number.isFinite(p) && (p as number) > 0 ? Number((p as number).toFixed(4)) : null] as const;
      }),
    );
    const prices: Record<string, number> = {};
    for (const [code, p] of results) if (p != null) prices[code] = p;
    return prices;
  } catch (e) {
    console.error("Yahoo futures metals fetch error:", e);
    return {};
  }
}

// Keyed/limited metals sources (goldapi.io, TwelveData, Yahoo futures), merged and
// cached for 60s. Only invoked to fill metals the free gold-api.com couldn't supply,
// so the fast 4s spot refresh never hammers these quota-limited APIs.
async function fetchKeyedMetalsFallback(): Promise<Record<string, number>> {
  if (keyedMetalsCache && Date.now() - keyedMetalsCacheTs < KEYED_METALS_TTL) {
    return keyedMetalsCache;
  }
  const [goldApi, twelveData, yahooFutures] = await Promise.all([
    fetchGoldApiMetals(),
    fetchTwelveDataMetals(),
    fetchYahooFuturesMetals(),
  ]);
  const merged: Record<string, number> = {};
  for (const code of GOLDAPI_METALS) {
    const v = goldApi[code] ?? twelveData[code] ?? yahooFutures[code];
    if (Number.isFinite(v) && (v as number) > 0) merged[code] = v as number;
  }
  if (Object.keys(merged).length > 0) {
    keyedMetalsCache = merged;
    keyedMetalsCacheTs = Date.now();
  }
  return keyedMetalsCache ?? merged;
}

async function fetchSpotMetals(): Promise<{ prices: Record<string, number>; sources: string[] }> {
  if (metalsSpotCache && Date.now() - metalsSpotCacheTs < METALS_SPOT_CACHE_TTL) {
    return { prices: metalsSpotCache, sources: ["spot-cache"] };
  }

  // Fast path: free gold-api.com (no key, ~4s cadence) — the ONLY source hit at 4s.
  const goldApiCom = await fetchGoldApiComMetals();
  const prices: Record<string, number> = {};
  const sources: string[] = [];
  for (const code of GOLDAPI_METALS) {
    if (goldApiCom[code]) {
      prices[code] = goldApiCom[code];
      if (!sources.includes("gold-api-com-spot")) sources.push("gold-api-com-spot");
    }
  }

  // Fill any metals the free source missed from the 60s-cached keyed fallback.
  const missing = GOLDAPI_METALS.filter((code) => !prices[code]);
  if (missing.length > 0) {
    const fallback = await fetchKeyedMetalsFallback();
    for (const code of missing) {
      if (fallback[code]) {
        prices[code] = fallback[code];
        if (!sources.includes("keyed-fallback")) sources.push("keyed-fallback");
      }
    }
  }

  if (Object.keys(prices).length > 0) {
    metalsSpotCache = prices;
    metalsSpotCacheTs = Date.now();
  }
  return { prices: metalsSpotCache || prices, sources };
}

// Fetch accurate SPOT metal prices from GoldAPI (Yahoo GC=F is futures and drifts ~$20+)
async function fetchGoldApiMetals(): Promise<Record<string, number>> {
  const key = Deno.env.get("GOLD_API_KEY");
  if (!key) return {};

  try {
    const results = await Promise.all(
      GOLDAPI_METALS.map(async (code) => {
        try {
          const res = await fetch(`https://www.goldapi.io/api/${code}/USD`, {
            headers: { "x-access-token": key },
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) { await res.text(); return [code, null] as const; }
          const d = await res.json();
          const p = Number(d?.price);
          return [code, Number.isFinite(p) && p > 0 ? Number(p.toFixed(4)) : null] as const;
        } catch { return [code, null] as const; }
      }),
    );

    const prices: Record<string, number> = {};
    for (const [code, p] of results) if (p != null) prices[code] = p;
    return prices;
  } catch (e) {
    console.error("GoldAPI fetch error:", e);
    return {};
  }
}

// ─── History cache ───
const historyCache = new Map<string, { data: unknown; ts: number }>();
const HISTORY_CACHE_TTL = 60_000;

const RANGE_MAP: Record<string, { range: string; interval: string }> = {
  "1min": { range: "1d", interval: "1m" },
  // Widen the lookback so intraday indicators (RSI 14 / MACD 26-9) always have
  // enough candles. Yahoo only returns ~34 bars for a single trading day at
  // these intervals, which leaves MACD/RSI unable to compute.
  "5min": { range: "5d", interval: "5m" },
  "15min": { range: "5d", interval: "15m" },
  "1d": { range: "5d", interval: "5m" },
  "5d": { range: "5d", interval: "15m" },
  "1mo": { range: "1mo", interval: "1h" },
  "3mo": { range: "3mo", interval: "1d" },
  "6mo": { range: "6mo", interval: "1d" },
  "1y": { range: "1y", interval: "1d" },
  "5y": { range: "5y", interval: "1wk" },
};

const TWELVE_HISTORY_MAP: Record<string, { interval: string; outputsize: number }> = {
  "1min": { interval: "1min", outputsize: 390 },
  "5min": { interval: "5min", outputsize: 288 },
  "15min": { interval: "15min", outputsize: 192 },
  "1d": { interval: "5min", outputsize: 288 },
  "5d": { interval: "15min", outputsize: 480 },
  "1mo": { interval: "1h", outputsize: 720 },
  "3mo": { interval: "1day", outputsize: 95 },
  "6mo": { interval: "1day", outputsize: 190 },
  "1y": { interval: "1day", outputsize: 370 },
  "5y": { interval: "1week", outputsize: 270 },
};

async function fetchTwelveDataHistory(code: string, range: string): Promise<{ time: number; open: number; close: number; high: number; low: number }[] | null> {
  const key = Deno.env.get("TWELVE_DATA_API_KEY");
  const symbol = TWELVE_DATA_SYMBOLS[code];
  if (!key || !symbol) return null;

  const config = TWELVE_HISTORY_MAP[range] || TWELVE_HISTORY_MAP["1mo"];
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", config.interval);
  url.searchParams.set("outputsize", String(config.outputsize));
  url.searchParams.set("apikey", key);
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("order", "ASC");

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    if (data?.status === "error" || !Array.isArray(data?.values)) return null;

    const candles = data.values
      .map((v: Record<string, string>) => {
        const time = Math.floor(new Date(`${v.datetime}Z`).getTime() / 1000);
        const close = Number(v.close);
        const high = Number(v.high);
        const low = Number(v.low);
        const openRaw = Number(v.open);
        const open = Number.isFinite(openRaw) && openRaw > 0 ? openRaw : close;
        if (![time, close, high, low].every(Number.isFinite) || close <= 0 || high <= 0 || low <= 0) return null;
        return { time, open: +open.toFixed(4), close: +close.toFixed(4), high: +high.toFixed(4), low: +low.toFixed(4) };
      })
      .filter(Boolean) as { time: number; open: number; close: number; high: number; low: number }[];

    return candles.length > 0 ? candles : null;
  } catch (e) {
    console.error("Twelve Data spot history fetch error:", e);
    return null;
  }
}


function getLastClose(quotes: unknown): number | null {
  if (!Array.isArray(quotes)) return null;
  for (let i = quotes.length - 1; i >= 0; i -= 1) {
    const v = quotes[i];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

async function fetchYahooPrice(symbol: string): Promise<number | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
    const res = await fetch(url, { headers: yahooHeaders, signal: AbortSignal.timeout(8000) });
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const metaPrice = result?.meta?.regularMarketPrice;
    if (typeof metaPrice === "number" && metaPrice > 0) return metaPrice;
    return getLastClose(result?.indicators?.quote?.[0]?.close);
  } catch { return null; }
}

// Fetch oil prices from OilPriceAPI (free demo, 20 req/hour)
async function fetchOilPriceApi(): Promise<Record<string, number>> {
  // Use cache if fresh
  if (oilApiCache && Date.now() - oilApiCacheTs < OIL_API_CACHE_TTL) {
    return oilApiCache;
  }

  try {
    const res = await fetch("https://api.oilpriceapi.com/v1/demo/prices", {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { await res.text(); return oilApiCache || {}; }
    const data = await res.json();

    const prices: Record<string, number> = {};
    if (data?.status === "success" && Array.isArray(data?.data?.prices)) {
      for (const item of data.data.prices) {
        if (item.code === "WTI_USD" && typeof item.price === "number" && item.price > 0) {
          prices.USOIL = Number(item.price.toFixed(4));
        }
        if (item.code === "BRENT_CRUDE_USD" && typeof item.price === "number" && item.price > 0) {
          prices.UKOIL = Number(item.price.toFixed(4));
        }
        if (item.code === "NATURAL_GAS_USD" && typeof item.price === "number" && item.price > 0) {
          prices.NATGAS = Number(item.price.toFixed(4));
        }
      }
    }

    if (Object.keys(prices).length > 0) {
      oilApiCache = prices;
      oilApiCacheTs = Date.now();
    }

    return prices;
  } catch (e) {
    console.error("OilPriceAPI fetch error:", e);
    return oilApiCache || {};
  }
}

async function handleLivePrices(): Promise<Response> {
  // L1: per-isolate memory cache (fastest path on a warm isolate).
  if (cachedPrices && Date.now() - cacheTimestamp < CACHE_TTL) {
    return new Response(
      JSON.stringify({ prices: cachedPrices, sources: ["multi-source"], cached: true, cacheSource: "memory", timestamp: cacheTimestamp }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // L2: shared DB cache — valid snapshots are returned immediately, with NO upstream calls.
  const dbCached = await readMetalsCache();
  if (dbCached) {
    cachedPrices = dbCached.prices;
    cacheTimestamp = dbCached.timestamp || Date.now();
    return new Response(
      JSON.stringify({
        prices: dbCached.prices,
        sources: dbCached.sources,
        unavailable: dbCached.unavailable,
        spotStale: dbCached.spotStale,
        cached: true,
        cacheSource: "db",
        timestamp: cacheTimestamp,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Fetch from Yahoo, OilPriceAPI and dedicated spot metals sources in parallel
  const [yahooResults, oilPrices, metalsSpot] = await Promise.all([
    Promise.all(
      Object.entries(YAHOO_SYMBOLS).map(async ([code, symbol]) =>
        [code, await fetchYahooPrice(symbol)] as const
      ),
    ),
    fetchOilPriceApi(),
    fetchSpotMetals(),
  ]);

  const yahooPrices: Record<string, number> = {};
  for (const [code, price] of yahooResults) {
    if (typeof price === "number" && price > 0) yahooPrices[code] = Number(price.toFixed(4));
  }

  // Merge priority: spot feeds for metals, OilPriceAPI for oil/gas, Yahoo as fallback (non-metals only)
  const prices: Record<string, number> = {};
  const sources: string[] = [];
  // Track metals where no real spot price could be obtained — surface as explicit errors,
  // never silently substitute Yahoo futures (GC=F/SI=F) which trade well above broker spot.
  const unavailable: string[] = [];

  for (const code of Object.keys(YAHOO_SYMBOLS)) {
    if ((code === "USOIL" || code === "UKOIL" || code === "NATGAS") && oilPrices[code]) {
      // Prefer OilPriceAPI for oil & gas prices
      prices[code] = oilPrices[code];
      if (!sources.includes("oilpriceapi")) sources.push("oilpriceapi");
    } else if (GOLDAPI_METALS.includes(code) && metalsSpot.prices[code]) {
      // Prefer real XAU/USD spot feeds for precious metals; never use futures when spot is available.
      prices[code] = metalsSpot.prices[code];
      for (const source of metalsSpot.sources) if (!sources.includes(source)) sources.push(source);
    } else if (GOLDAPI_METALS.includes(code)) {
      // Spot unavailable for this metal — do NOT fall back to Yahoo futures. Report as unavailable.
      unavailable.push(code);
    } else if (yahooPrices[code]) {
      prices[code] = yahooPrices[code];
      if (!sources.includes("yahoo-finance")) sources.push("yahoo-finance");
    }
  }

  // Flag whether the spot data we served is stale (cache fallback older than its TTL).
  const spotStale = metalsSpot.sources.includes("spot-cache") &&
    Date.now() - metalsSpotCacheTs >= METALS_SPOT_CACHE_TTL;

  if (Object.keys(prices).length === 0) {
    return new Response(
      JSON.stringify({ error: "No live prices available", unavailable }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  cachedPrices = prices;
  cacheTimestamp = Date.now();
  // Populate the shared DB cache so other isolates skip the upstream fetch for 10s.
  await writeMetalsCache({ prices, sources, unavailable, spotStale, timestamp: cacheTimestamp });
  return new Response(
    JSON.stringify({
      prices,
      sources,
      unavailable,
      spotStale,
      cached: false,
      cacheSource: "upstream",
      timestamp: cacheTimestamp,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

type Candle = { time: number; open: number; close: number; high: number; low: number };

async function fetchYahooCandles(symbol: string, range: string): Promise<Candle[] | null> {
  const rangeConfig = RANGE_MAP[range] || RANGE_MAP["1mo"];
  const yahooUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${rangeConfig.interval}&range=${rangeConfig.range}`;
  try {
    const res = await fetch(yahooUrl, { headers: yahooHeaders, signal: AbortSignal.timeout(10000) });
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamp || [];
    const opens: (number | null)[] = result.indicators?.quote?.[0]?.open || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
    const highs: (number | null)[] = result.indicators?.quote?.[0]?.high || [];
    const lows: (number | null)[] = result.indicators?.quote?.[0]?.low || [];

    const candles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i], h = highs[i], l = lows[i];
      const o = opens[i] != null && (opens[i] as number) > 0 ? opens[i] as number : c;
      if (c != null && h != null && l != null && o != null) {
        candles.push({ time: timestamps[i], open: +o.toFixed(4), close: +c.toFixed(4), high: +h.toFixed(4), low: +l.toFixed(4) });
      }
    }
    return candles.length > 0 ? candles : null;
  } catch (e) {
    console.error("Yahoo candles fetch error:", e);
    return null;
  }
}

// Shift futures candles so their level matches the current spot price.
// Futures (GC=F/SI=F) trade above broker spot by a fairly stable offset; subtracting
// (futuresLastClose - spotPrice) realigns the whole series to spot while keeping its shape.
function shiftCandlesToSpot(candles: Candle[], spotPrice: number): Candle[] {
  const lastClose = candles[candles.length - 1]?.close;
  if (!lastClose || lastClose <= 0) return candles;
  const offset = spotPrice - lastClose;
  if (!Number.isFinite(offset) || Math.abs(offset) < 1e-6) return candles;
  return candles.map((c) => ({
    time: c.time,
    open: +(c.open + offset).toFixed(4),
    close: +(c.close + offset).toFixed(4),
    high: +(c.high + offset).toFixed(4),
    low: +(c.low + offset).toFixed(4),
  }));
}

// Despike bad OHLC bars before serving them to the chart.
// Some upstream feeds (notably Yahoo GC=F/SI=F intraday) occasionally return a
// stale/erroneous `low` (or `high`) that is tens of dollars away from the bar's
// real body — e.g. dozens of consecutive Gold bars all sharing an identical
// low of 4155.89 while their open/close sit near 4210. That renders as a long
// fake wick under every candle. We use the robust MEDIAN candle range (immune
// to these outliers) to detect glitch bars, then rebuild the offending wick at
// the TYPICAL wick size for the series so the bar matches its neighbours
// instead of spiking to a phantom level. Genuine volatility is left untouched.
function despikeCandles(candles: Candle[]): Candle[] {
  if (candles.length < 8) return candles;
  const ranges = candles
    .map((c) => c.high - c.low)
    .filter((r) => Number.isFinite(r) && r > 0)
    .sort((a, b) => a - b);
  if (ranges.length < 8) return candles;
  const medianRange = ranges[Math.floor(ranges.length / 2)];
  if (!(medianRange > 0)) return candles;
  // A wick beyond 4× the median candle range is treated as a data glitch.
  const maxWick = medianRange * 4;

  const median = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  // Typical (non-glitch) wick sizes, used to rebuild corrupted wicks.
  const lowerWicks: number[] = [];
  const upperWicks: number[] = [];
  for (const c of candles) {
    const lw = Math.min(c.open, c.close) - c.low;
    const uw = c.high - Math.max(c.open, c.close);
    if (lw >= 0 && lw <= maxWick) lowerWicks.push(lw);
    if (uw >= 0 && uw <= maxWick) upperWicks.push(uw);
  }
  const typLower = median(lowerWicks);
  const typUpper = median(upperWicks);

  return candles.map((c) => {
    const bodyLow = Math.min(c.open, c.close);
    const bodyHigh = Math.max(c.open, c.close);
    let low = c.low;
    let high = c.high;
    // Replace clearly corrupted wicks with the series-typical wick size.
    if (bodyLow - low > maxWick) low = +(bodyLow - typLower).toFixed(4);
    if (high - bodyHigh > maxWick) high = +(bodyHigh + typUpper).toFixed(4);
    // Keep OHLC internally consistent.
    low = Math.min(low, bodyLow);
    high = Math.max(high, bodyHigh);
    return { ...c, low, high };
  });
}


// Seconds per candle for each timeframe (matches the provider interval).
const STEP_SECONDS: Record<string, number> = {
  "1min": 60, "5min": 300, "15min": 900, "1d": 300, "5d": 900,
  "1mo": 3600, "3mo": 86_400, "6mo": 86_400, "1y": 86_400, "5y": 604_800,
};

// Align a unix timestamp to the start of its UTC clock interval (TradingView /
// MT5 standard). Epoch 0 is 1970-01-01 00:00 UTC, so flooring lands exactly on
// :00 / :05 / :15 / hour / day boundaries. Weekly aligns to Monday 00:00 UTC.
function alignToUTCInterval(ts: number, step: number): number {
  if (step === 604_800) {
    const dayStart = Math.floor(ts / 86_400) * 86_400;
    // Epoch day 0 (1970-01-01) was a Thursday; shift back to Monday.
    const dow = (Math.floor(ts / 86_400) + 4) % 7; // 0 = Sunday
    const daysSinceMonday = (dow + 6) % 7;
    return dayStart - daysSinceMonday * 86_400;
  }
  return Math.floor(ts / step) * step;
}

function buildFlatSpotCandles(price: number, range: string): Candle[] {
  const now = Math.floor(Date.now() / 1000);
  const intraday = new Set(["1min", "5min", "15min", "1d", "5d"]);
  const step = STEP_SECONDS[range] ?? 86_400;
  const count = intraday.has(range) ? 96 : range === "1y" ? 180 : range === "3mo" ? 90 : 60;
  // Anchor the most recent candle to its UTC clock boundary so the chart matches
  // MT5 / TradingView instead of drifting from the fetch time.
  const lastTime = alignToUTCInterval(now, step);
  return Array.from({ length: count }, (_, i) => ({
    time: lastTime - (count - 1 - i) * step,
    open: +price.toFixed(4),
    high: +price.toFixed(4),
    low: +price.toFixed(4),
    close: +price.toFixed(4),
  }));
}



async function handleHistory(code: string, range: string): Promise<Response> {
  const yahooSymbol = YAHOO_SYMBOLS[code];
  if (!yahooSymbol) {
    return new Response(JSON.stringify({ error: `Unknown code: ${code}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cacheKey = `${code}_${range}`;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < HISTORY_CACHE_TTL) {
    return new Response(JSON.stringify(cached.data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (GOLDAPI_METALS.includes(code)) {
    // 1) Prefer true spot history from Twelve Data.
    const spotCandlesRaw = await fetchTwelveDataHistory(code, range);
    if (spotCandlesRaw) {
      const spotCandles = despikeCandles(spotCandlesRaw);
      const responseData = { code, range, candles: spotCandles, count: spotCandles.length, source: "twelvedata-spot" };
      historyCache.set(cacheKey, { data: responseData, ts: Date.now() });
      return new Response(JSON.stringify(responseData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Twelve Data unavailable (e.g. rate-limited). Fall back to Yahoo futures candles
    //    but realign them to the current spot price so the chart never shows the inflated
    //    futures level. Requires a known spot price; otherwise report unavailable.
    const [futuresCandles, spot] = await Promise.all([
      fetchYahooCandles(yahooSymbol, range),
      fetchSpotMetals(),
    ]);
    const spotPrice = spot.prices[code];
    if (futuresCandles && spotPrice && spotPrice > 0) {
      const candles = despikeCandles(shiftCandlesToSpot(futuresCandles, spotPrice));
      const responseData = { code, range, candles, count: candles.length, source: "yahoo-futures-spot-adjusted" };
      historyCache.set(cacheKey, { data: responseData, ts: Date.now() });
      return new Response(JSON.stringify(responseData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Nothing usable — still return HTTP 200 and safe chart data so the app
    //    never blanks on temporary upstream spot-history outages.
    const fallbackPrice = spotPrice || cachedPrices?.[code];
    if (fallbackPrice && fallbackPrice > 0) {
      const candles = buildFlatSpotCandles(fallbackPrice, range);
      const responseData = { code, range, candles, count: candles.length, source: "spot-price-continuity", fallback: true, warning: "Spot history temporarily unavailable" };
      historyCache.set(cacheKey, { data: responseData, ts: Date.now() });
      return new Response(JSON.stringify(responseData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ warning: "Spot history unavailable", code, range, candles: [], count: 0, unavailable: [code], fallback: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }




  const rangeConfig = RANGE_MAP[range] || RANGE_MAP["1mo"];
  const yahooUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${rangeConfig.interval}&range=${rangeConfig.range}`;

  try {
    const res = await fetch(yahooUrl, { headers: yahooHeaders, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      await res.text();
      return new Response(JSON.stringify({ error: "Failed to fetch history", fallback: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      return new Response(JSON.stringify({ error: "No data", fallback: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const timestamps: number[] = result.timestamp || [];
    const opens: (number | null)[] = result.indicators?.quote?.[0]?.open || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
    const highs: (number | null)[] = result.indicators?.quote?.[0]?.high || [];
    const lows: (number | null)[] = result.indicators?.quote?.[0]?.low || [];

    const candles: { time: number; open: number; close: number; high: number; low: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i], h = highs[i], l = lows[i];
      const o = opens[i] != null && (opens[i] as number) > 0 ? opens[i] as number : c;
      if (c != null && h != null && l != null && o != null) {
        candles.push({ time: timestamps[i], open: +o.toFixed(4), close: +c.toFixed(4), high: +h.toFixed(4), low: +l.toFixed(4) });
      }
    }


    const cleaned = despikeCandles(candles);
    const responseData = { code, range, candles: cleaned, count: cleaned.length };
    historyCache.set(cacheKey, { data: responseData, ts: Date.now() });

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ warning: error instanceof Error ? error.message : "History temporarily unavailable", candles: [], count: 0, fallback: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode");

    if (mode === "history") {
      const code = (url.searchParams.get("code") || "XAU").toUpperCase();
      const range = url.searchParams.get("range") || "1mo";
      return await handleHistory(code, range);
    }

    return await handleLivePrices();
  } catch (error) {
    try {
      const url = new URL(req.url);
      if (url.searchParams.get("mode") === "history") {
        return new Response(
          JSON.stringify({ warning: error instanceof Error ? error.message : "History temporarily unavailable", candles: [], count: 0, fallback: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } catch {}
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
