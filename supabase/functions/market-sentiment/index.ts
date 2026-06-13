import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Returns USD-index (DXY) snapshot + market sentiment (Fear & Greed),
// plus a derived gold bias (gold moves inverse to the dollar).

interface DxySnapshot {
  price: number | null;
  changePct: number | null;
  available: boolean;
}

interface SentimentSnapshot {
  value: number | null;        // 0..100
  classification: string;      // e.g. "Fear", "Greed"
  available: boolean;
}

async function fetchDxyYahoo(): Promise<DxySnapshot> {
  try {
    const r = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=5d",
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!r.ok) return { price: null, changePct: null, available: false };
    const j = await r.json();
    const meta = j?.chart?.result?.[0]?.meta;
    if (!meta) return { price: null, changePct: null, available: false };
    const price = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
    const prev =
      typeof meta.chartPreviousClose === "number"
        ? meta.chartPreviousClose
        : typeof meta.previousClose === "number"
          ? meta.previousClose
          : null;
    let changePct: number | null = null;
    if (price !== null && prev) changePct = ((price - prev) / prev) * 100;
    return {
      price,
      changePct: Number.isFinite(changePct as number) ? changePct : null,
      available: price !== null,
    };
  } catch {
    return { price: null, changePct: null, available: false };
  }
}

async function fetchDxyTwelve(): Promise<DxySnapshot> {
  const key = Deno.env.get("TWELVE_DATA_API_KEY");
  if (!key) return { price: null, changePct: null, available: false };
  try {
    const r = await fetch(
      `https://api.twelvedata.com/quote?symbol=DXY&apikey=${key}`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    const j = await r.json();
    if (!r.ok || j?.status === "error" || j?.code) {
      return { price: null, changePct: null, available: false };
    }
    const price = j.close ? parseFloat(j.close) : null;
    let changePct: number | null = j.percent_change ? parseFloat(j.percent_change) : null;
    if (changePct === null && j.close && j.previous_close) {
      const c = parseFloat(j.close);
      const p = parseFloat(j.previous_close);
      if (p) changePct = ((c - p) / p) * 100;
    }
    return {
      price: Number.isFinite(price as number) ? price : null,
      changePct: Number.isFinite(changePct as number) ? changePct : null,
      available: price !== null,
    };
  } catch {
    return { price: null, changePct: null, available: false };
  }
}

async function fetchDxy(): Promise<DxySnapshot> {
  const yahoo = await fetchDxyYahoo();
  if (yahoo.available) return yahoo;
  return fetchDxyTwelve();
}

async function fetchFearGreed(): Promise<SentimentSnapshot> {
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=1", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const j = await r.json();
    const item = Array.isArray(j?.data) ? j.data[0] : null;
    if (!item) return { value: null, classification: "", available: false };
    const value = item.value ? parseInt(item.value, 10) : null;
    return {
      value: Number.isFinite(value as number) ? value : null,
      classification: item.value_classification ?? "",
      available: value !== null,
    };
  } catch {
    return { value: null, classification: "", available: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const [dxy, sentiment] = await Promise.all([fetchDxy(), fetchFearGreed()]);

    // Gold moves inverse to the dollar.
    let goldBias: "bullish" | "bearish" | "neutral" = "neutral";
    if (dxy.changePct !== null) {
      if (dxy.changePct <= -0.1) goldBias = "bullish";
      else if (dxy.changePct >= 0.1) goldBias = "bearish";
    }

    return new Response(
      JSON.stringify({
        dxy,
        sentiment,
        goldBias,
        generatedAt: new Date().toISOString(),
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=120",
        },
      },
    );
  } catch (e) {
    console.error("market-sentiment error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
        dxy: { price: null, changePct: null, available: false },
        sentiment: { value: null, classification: "", available: false },
        goldBias: "neutral",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
