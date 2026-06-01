import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

// ─── Live prices cache ───
const CACHE_TTL = 1000;
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
const METALS_SPOT_CACHE_TTL = 30 * 1000; // 30s — spot prices, keeps API calls low

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

  try {
    const results = await Promise.all(
      Object.entries(TWELVE_DATA_SYMBOLS).map(async ([code, symbol]) => {
        try {
          const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`;
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) { await res.text(); return [code, null] as const; }
          const data = await res.json();
          const p = Number(data?.price);
          return [code, Number.isFinite(p) && p > 0 ? Number(p.toFixed(4)) : null] as const;
        } catch { return [code, null] as const; }
      }),
    );

    const prices: Record<string, number> = {};
    for (const [code, p] of results) if (p != null) prices[code] = p;
    return prices;
  } catch (e) {
    console.error("Twelve Data metals fetch error:", e);
    return {};
  }
}

async function fetchSpotMetals(): Promise<{ prices: Record<string, number>; sources: string[] }> {
  if (metalsSpotCache && Date.now() - metalsSpotCacheTs < METALS_SPOT_CACHE_TTL) {
    return { prices: metalsSpotCache, sources: ["spot-cache"] };
  }

  const [stooq, twelveData, goldApi] = await Promise.all([
    fetchStooqSpotMetals(),
    fetchTwelveDataMetals(),
    fetchGoldApiMetals(),
  ]);

  const prices: Record<string, number> = {};
  const sources: string[] = [];
  for (const code of GOLDAPI_METALS) {
    if (stooq[code]) {
      prices[code] = stooq[code];
      if (!sources.includes("stooq-spot")) sources.push("stooq-spot");
    } else if (twelveData[code]) {
      prices[code] = twelveData[code];
      if (!sources.includes("twelvedata-spot")) sources.push("twelvedata-spot");
    } else if (goldApi[code]) {
      prices[code] = goldApi[code];
      if (!sources.includes("goldapi-spot")) sources.push("goldapi-spot");
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
  if (metalsSpotCache && Date.now() - metalsSpotCacheTs < METALS_SPOT_CACHE_TTL) {
    return metalsSpotCache;
  }
  const key = Deno.env.get("GOLD_API_KEY");
  if (!key) return metalsSpotCache || {};

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

    if (Object.keys(prices).length > 0) {
      metalsSpotCache = prices;
      metalsSpotCacheTs = Date.now();
      return prices;
    }
    return metalsSpotCache || {};
  } catch (e) {
    console.error("GoldAPI fetch error:", e);
    return metalsSpotCache || {};
  }
}

// ─── History cache ───
const historyCache = new Map<string, { data: unknown; ts: number }>();
const HISTORY_CACHE_TTL = 60_000;

const RANGE_MAP: Record<string, { range: string; interval: string }> = {
  "1d": { range: "1d", interval: "5m" },
  "5d": { range: "5d", interval: "15m" },
  "1mo": { range: "1mo", interval: "1h" },
  "3mo": { range: "3mo", interval: "1d" },
  "6mo": { range: "6mo", interval: "1d" },
  "1y": { range: "1y", interval: "1d" },
  "5y": { range: "5y", interval: "1wk" },
};

const TWELVE_HISTORY_MAP: Record<string, { interval: string; outputsize: number }> = {
  "1d": { interval: "5min", outputsize: 288 },
  "5d": { interval: "15min", outputsize: 480 },
  "1mo": { interval: "1h", outputsize: 720 },
  "3mo": { interval: "1day", outputsize: 95 },
  "6mo": { interval: "1day", outputsize: 190 },
  "1y": { interval: "1day", outputsize: 370 },
  "5y": { interval: "1week", outputsize: 270 },
};

async function fetchTwelveDataHistory(code: string, range: string): Promise<{ time: number; close: number; high: number; low: number }[] | null> {
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
        if (![time, close, high, low].every(Number.isFinite) || close <= 0 || high <= 0 || low <= 0) return null;
        return { time, close: +close.toFixed(4), high: +high.toFixed(4), low: +low.toFixed(4) };
      })
      .filter(Boolean) as { time: number; close: number; high: number; low: number }[];

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
  if (cachedPrices && Date.now() - cacheTimestamp < CACHE_TTL) {
    return new Response(
      JSON.stringify({ prices: cachedPrices, sources: ["multi-source"], cached: true, timestamp: cacheTimestamp }),
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
  return new Response(
    JSON.stringify({
      prices,
      sources,
      unavailable,
      spotStale,
      cached: false,
      timestamp: cacheTimestamp,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
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
    const spotCandles = await fetchTwelveDataHistory(code, range);
    if (spotCandles) {
      const responseData = { code, range, candles: spotCandles, count: spotCandles.length, source: "twelvedata-spot" };
      historyCache.set(cacheKey, { data: responseData, ts: Date.now() });
      return new Response(JSON.stringify(responseData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Spot history unavailable for this metal — never fall back to Yahoo futures (GC=F/SI=F).
    return new Response(
      JSON.stringify({ error: "Spot history unavailable", code, range, unavailable: [code] }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }


  const rangeConfig = RANGE_MAP[range] || RANGE_MAP["1mo"];
  const yahooUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${rangeConfig.interval}&range=${rangeConfig.range}`;

  try {
    const res = await fetch(yahooUrl, { headers: yahooHeaders, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      await res.text();
      return new Response(JSON.stringify({ error: "Failed to fetch history" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      return new Response(JSON.stringify({ error: "No data" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const timestamps: number[] = result.timestamp || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
    const highs: (number | null)[] = result.indicators?.quote?.[0]?.high || [];
    const lows: (number | null)[] = result.indicators?.quote?.[0]?.low || [];

    const candles: { time: number; close: number; high: number; low: number }[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = closes[i], h = highs[i], l = lows[i];
      if (c != null && h != null && l != null) {
        candles.push({ time: timestamps[i], close: +c.toFixed(4), high: +h.toFixed(4), low: +l.toFixed(4) });
      }
    }

    const responseData = { code, range, candles, count: candles.length };
    historyCache.set(cacheKey, { data: responseData, ts: Date.now() });

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
