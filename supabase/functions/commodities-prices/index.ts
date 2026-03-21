import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

let cachedPrices: Record<string, number> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30 * 1000; // 30s cache

// Primary: goldapi.io (real-time, reliable)
async function fetchGoldApi(): Promise<Record<string, number>> {
  const apiKey = Deno.env.get("GOLD_API_KEY");
  if (!apiKey) {
    console.error("GOLD_API_KEY not configured");
    return {};
  }

  const results: Record<string, number> = {};
  const symbols = [
    { code: "XAU", symbol: "XAU" },
    { code: "XAG", symbol: "XAG" },
    { code: "XPT", symbol: "XPT" },
    { code: "XPD", symbol: "XPD" },
  ];

  // Fetch all metals in parallel
  const fetches = symbols.map(async ({ code, symbol }) => {
    try {
      const res = await fetch(`https://www.goldapi.io/api/${symbol}/USD`, {
        headers: {
          "x-access-token": apiKey,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.price && data.price > 0) {
          results[code] = data.price;
          console.log(`goldapi.io ${code}: $${data.price}`);
        }
      } else {
        const text = await res.text();
        console.error(`goldapi.io ${code} status: ${res.status} - ${text}`);
      }
    } catch (e) {
      console.error(`goldapi.io ${code} error:`, e.message);
    }
  });

  await Promise.all(fetches);
  return results;
}

// Oil prices via AI (goldapi.io doesn't have oil)
async function fetchOilViaAI(): Promise<Record<string, number>> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return {};

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{
          role: "user",
          content: `What are the current WTI crude oil and Brent crude oil prices per barrel in USD right now? Reply ONLY with JSON: {"USOIL":number,"UKOIL":number}. No markdown, no explanation.`
        }],
        temperature: 0,
        max_tokens: 50,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim() || "";
      const jsonMatch = content.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const result: Record<string, number> = {};
        if (typeof parsed.USOIL === 'number' && parsed.USOIL > 0) result.USOIL = parsed.USOIL;
        if (typeof parsed.UKOIL === 'number' && parsed.UKOIL > 0) result.UKOIL = parsed.UKOIL;
        console.log("Oil prices from AI:", JSON.stringify(result));
        return result;
      }
    }
  } catch (e) {
    console.error("AI oil error:", e.message);
  }
  return {};
}

// Fallback for metals if goldapi.io fails
async function fetchMetalsFallbackAI(missing: string[]): Promise<Record<string, number>> {
  if (missing.length === 0) return {};
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return {};

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{
          role: "user",
          content: `Current spot prices in USD for: ${missing.join(', ')}. XAU=gold/oz, XAG=silver/oz, XPT=platinum/oz, XPD=palladium/oz. Reply ONLY JSON like {"XAU":3050}. No markdown.`
        }],
        temperature: 0,
        max_tokens: 100,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim() || "";
      const jsonMatch = content.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const result: Record<string, number> = {};
        for (const key of missing) {
          if (typeof parsed[key] === 'number' && parsed[key] > 0) {
            result[key] = parsed[key];
          }
        }
        return result;
      }
    }
  } catch (e) {
    console.error("AI metals fallback error:", e.message);
  }
  return {};
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check cache
    if (cachedPrices && (Date.now() - cacheTimestamp) < CACHE_TTL) {
      return new Response(JSON.stringify({ prices: cachedPrices, cached: true, timestamp: cacheTimestamp }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, number> = {};
    const sources: string[] = [];

    // Fetch metals from goldapi.io and oil from AI in parallel
    const [goldApiPrices, oilPrices] = await Promise.all([
      fetchGoldApi(),
      fetchOilViaAI(),
    ]);

    // Merge goldapi.io metals
    for (const code of ['XAU', 'XAG', 'XPT', 'XPD']) {
      if (goldApiPrices[code]) {
        results[code] = goldApiPrices[code];
      }
    }
    if (Object.keys(goldApiPrices).length > 0) sources.push('goldapi.io');

    // Merge oil
    if (oilPrices.USOIL) results.USOIL = oilPrices.USOIL;
    if (oilPrices.UKOIL) results.UKOIL = oilPrices.UKOIL;
    if (oilPrices.USOIL || oilPrices.UKOIL) sources.push('ai-oil');

    // Fallback for any missing metals
    const missingMetals = ['XAU', 'XAG', 'XPT', 'XPD'].filter(c => !results[c]);
    if (missingMetals.length > 0) {
      const fallback = await fetchMetalsFallbackAI(missingMetals);
      for (const code of missingMetals) {
        if (fallback[code]) results[code] = fallback[code];
      }
      if (Object.keys(fallback).length > 0) sources.push('ai-metals-fallback');
    }

    console.log("Final prices:", JSON.stringify(results), "Sources:", sources.join(', '));

    if (Object.keys(results).length > 0) {
      cachedPrices = results;
      cacheTimestamp = Date.now();
    }

    return new Response(JSON.stringify({ prices: results, sources, timestamp: Date.now() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
