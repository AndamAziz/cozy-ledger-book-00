import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CACHE_TTL = 1000; // 1s cache for near real-time polling
let cachedPrices: Record<string, number> | null = null;
let cacheTimestamp = 0;

const YAHOO_SYMBOLS: Record<string, string> = {
  XAU: "GC=F",   // Gold futures
  XAG: "SI=F",   // Silver futures
  XPT: "PL=F",   // Platinum futures
  XPD: "PA=F",   // Palladium futures
  USOIL: "CL=F", // WTI Crude futures
  UKOIL: "BZ=F", // Brent Crude futures
};

const yahooHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Referer": "https://finance.yahoo.com/",
};

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
    const res = await fetch(url, {
      headers: yahooHeaders,
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.error(`Yahoo ${symbol} status:`, res.status);
      await res.text();
      return null;
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const metaPrice = result?.meta?.regularMarketPrice;
    if (typeof metaPrice === "number" && metaPrice > 0) return metaPrice;

    const closes = result?.indicators?.quote?.[0]?.close;
    return getLastClose(closes);
  } catch (error) {
    console.error(`Yahoo ${symbol} fetch error:`, error instanceof Error ? error.message : String(error));
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (cachedPrices && Date.now() - cacheTimestamp < CACHE_TTL) {
      return new Response(
        JSON.stringify({ prices: cachedPrices, sources: ["yahoo-finance"], cached: true, timestamp: cacheTimestamp }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const entries = Object.entries(YAHOO_SYMBOLS);
    const fetched = await Promise.all(
      entries.map(async ([code, symbol]) => {
        const price = await fetchYahooPrice(symbol);
        return [code, price] as const;
      }),
    );

    const prices: Record<string, number> = {};
    for (const [code, price] of fetched) {
      if (typeof price === "number" && price > 0) {
        prices[code] = Number(price.toFixed(4));
      }
    }

    if (Object.keys(prices).length === 0) {
      return new Response(JSON.stringify({ error: "No live prices available" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    cachedPrices = prices;
    cacheTimestamp = Date.now();

    return new Response(
      JSON.stringify({ prices, sources: ["yahoo-finance"], cached: false, timestamp: cacheTimestamp }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
