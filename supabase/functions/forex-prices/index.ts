import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const yahooHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Referer": "https://finance.yahoo.com/",
};

// Currency codes we display (USD -> CODE). XAG handled via commodities feed.
const CODES = [
  "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "CNY", "INR", "TRY",
  "SAR", "AED", "IQD", "IRR", "KWD", "BHD", "QAR", "OMR", "JOD", "EGP",
  "KRW", "SGD", "HKD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "RUB",
  "BRL", "MXN", "ZAR", "THB", "MYR", "IDR", "PHP", "PKR", "NGN", "GEL",
];

interface LiveRate {
  price: number;
  prev: number;
  change: number;
  high: number;
  low: number;
}

// ─── Shared DB cache (cached_market_prices) so every isolate reads the same
// recent snapshot instead of each cold isolate re-fetching all 41 Yahoo pairs. ───
const FOREX_CACHE_KEY = "forex-live";
const LIVE_TTL = 5000; // 5s shared TTL for forex (per requirements)

// L1 per-isolate memory cache (avoids a DB round-trip on hot isolates).
let liveCache: Record<string, LiveRate> | null = null;
let liveCacheTs = 0;

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = supabaseUrl && serviceKey
  ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  : null;

interface CachedForexPayload {
  rates: Record<string, LiveRate>;
  timestamp: number;
}

/** Read a still-valid snapshot from the shared DB cache, or null if missing/expired. */
async function readForexCache(): Promise<CachedForexPayload | null> {
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("cached_market_prices")
      .select("payload, expires_at")
      .eq("cache_key", FOREX_CACHE_KEY)
      .maybeSingle();
    if (error || !data) return null;
    if (new Date(data.expires_at as string).getTime() <= Date.now()) return null;
    const payload = data.payload as CachedForexPayload;
    if (!payload?.rates || Object.keys(payload.rates).length === 0) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Persist a fresh snapshot to the shared DB cache with an explicit TTL. */
async function writeForexCache(payload: CachedForexPayload): Promise<void> {
  if (!db) return;
  try {
    await db.from("cached_market_prices").upsert({
      cache_key: FOREX_CACHE_KEY,
      payload,
      expires_at: new Date(Date.now() + LIVE_TTL).toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* cache write failures must never break the response */
  }
}

/** Run async tasks with bounded concurrency to avoid Yahoo throttling 41 simultaneous hits. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Spot Forex trades roughly Sunday 22:00 UTC → Friday 22:00 UTC.
function isForexOpen(now = new Date()): boolean {
  const dow = now.getUTCDay(); // 0=Sun .. 6=Sat
  const hour = now.getUTCHours();
  if (dow === 6) return false;
  if (dow === 0) return hour >= 22;
  if (dow === 5) return hour < 22;
  return true;
}

async function fetchYahooMeta(symbol: string): Promise<LiveRate | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`;
    const res = await fetch(url, { headers: yahooHeaders, signal: AbortSignal.timeout(8000) });
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = Number(meta.regularMarketPrice);
    const prev = Number(meta.previousClose ?? meta.chartPreviousClose ?? price);
    if (!Number.isFinite(price) || price <= 0) return null;
    const change = prev > 0 ? ((price - prev) / prev) * 100 : 0;
    return {
      price: Number(price.toFixed(6)),
      prev: Number((prev > 0 ? prev : price).toFixed(6)),
      change: Number(change.toFixed(3)),
      high: Number((meta.regularMarketDayHigh ?? price).toFixed(6)),
      low: Number((meta.regularMarketDayLow ?? price).toFixed(6)),
    };
  } catch {
    return null;
  }
}

// Free no-key daily fallback for any currency Yahoo cannot provide.
async function fetchErApi(): Promise<Record<string, number>> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) { await res.text(); return {}; }
    const data = await res.json();
    return data?.rates ?? {};
  } catch {
    return {};
  }
}

async function handleLive(): Promise<Response> {
  // L1: per-isolate memory cache (fastest path on a warm isolate).
  if (liveCache && Date.now() - liveCacheTs < LIVE_TTL) {
    return new Response(
      JSON.stringify({ rates: liveCache, marketOpen: isForexOpen(), cached: true, cacheSource: "memory", timestamp: liveCacheTs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // L2: shared DB cache — valid snapshots are returned immediately, with NO upstream calls.
  const dbCached = await readForexCache();
  if (dbCached) {
    liveCache = dbCached.rates;
    liveCacheTs = dbCached.timestamp || Date.now();
    return new Response(
      JSON.stringify({ rates: dbCached.rates, marketOpen: isForexOpen(), cached: true, cacheSource: "db", timestamp: liveCacheTs }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Cache miss: fetch upstream. Yahoo pairs are fetched with bounded concurrency
  // (10 at a time) so a cold isolate never opens 41 simultaneous connections,
  // which is what produced the multi-second cold-start spikes.
  const [yahooResults, erRates] = await Promise.all([
    mapWithConcurrency(CODES, 10, async (code) => [code, await fetchYahooMeta(`USD${code}=X`)] as const),
    fetchErApi(),
  ]);

  const rates: Record<string, LiveRate> = {};
  for (const [code, live] of yahooResults) {
    if (live) {
      rates[code] = live;
    } else {
      const r = Number(erRates[code]);
      if (Number.isFinite(r) && r > 0) {
        rates[code] = { price: r, prev: r, change: 0, high: r, low: r };
      }
    }
  }

  // XAG (silver) — USD per troy oz inverted to USD->XAG units; pull spot via commodities feed.
  try {
    const silver = await fetchYahooMeta("SI=F");
    if (silver && silver.price > 0) {
      const r = 1 / silver.price;
      rates["XAG"] = {
        price: Number(r.toFixed(6)),
        prev: Number((1 / silver.prev).toFixed(6)),
        change: Number((-silver.change).toFixed(3)),
        high: Number((1 / silver.low).toFixed(6)),
        low: Number((1 / silver.high).toFixed(6)),
      };
    }
  } catch { /* ignore */ }

  if (Object.keys(rates).length === 0) {
    return new Response(
      JSON.stringify({ error: "No forex rates available" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  liveCache = rates;
  liveCacheTs = Date.now();
  // Populate the shared DB cache so other isolates skip the upstream fetch for 5s.
  await writeForexCache({ rates, timestamp: liveCacheTs });
  return new Response(
    JSON.stringify({ rates, marketOpen: isForexOpen(), cached: false, cacheSource: "upstream", timestamp: liveCacheTs }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

const RANGE_MAP: Record<string, { range: string; interval: string }> = {
  "1d": { range: "1d", interval: "5m" },
  "5d": { range: "5d", interval: "15m" },
  "1mo": { range: "1mo", interval: "1h" },
  "3mo": { range: "3mo", interval: "1d" },
};

const historyCache = new Map<string, { data: unknown; ts: number }>();
const HISTORY_TTL = 60_000;

async function handleHistory(code: string, range: string): Promise<Response> {
  const cacheKey = `${code}:${range}`;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < HISTORY_TTL) {
    return new Response(JSON.stringify(cached.data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const cfg = RANGE_MAP[range] || RANGE_MAP["1mo"];
  const symbol = code === "XAG" ? "SI=F" : `USD${code}=X`;
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${cfg.interval}&range=${cfg.range}`;
    const res = await fetch(url, { headers: yahooHeaders, signal: AbortSignal.timeout(10000) });
    if (!res.ok) { await res.text(); return new Response(JSON.stringify({ candles: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const ts: number[] = result?.timestamp ?? [];
    const q = result?.indicators?.quote?.[0] ?? {};
    const invert = code === "XAG";
    const candles = ts
      .map((t, i) => {
        let o = Number(q.open?.[i]);
        let h = Number(q.high?.[i]);
        let l = Number(q.low?.[i]);
        let c = Number(q.close?.[i]);
        if (![o, h, l, c].every((v) => Number.isFinite(v) && v > 0)) return null;
        if (invert) { o = 1 / o; c = 1 / c; const nh = 1 / l; const nl = 1 / h; h = nh; l = nl; }
        return { time: t, open: +o.toFixed(6), high: +h.toFixed(6), low: +l.toFixed(6), close: +c.toFixed(6) };
      })
      .filter(Boolean);

    const payload = { candles, marketOpen: isForexOpen() };
    historyCache.set(cacheKey, { data: payload, ts: Date.now() });
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ candles: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const history = url.searchParams.get("history");
    if (history) {
      const range = url.searchParams.get("range") || "1mo";
      return await handleHistory(history.toUpperCase(), range);
    }
    return await handleLive();
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
