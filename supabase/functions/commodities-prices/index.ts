import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

let cachedPrices: Record<string, number> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30 * 1000;

// Source 1: goldapi.io for precious metals
async function fetchGoldApi(): Promise<Record<string, number>> {
  const apiKey = Deno.env.get("GOLD_API_KEY");
  if (!apiKey) return {};

  const results: Record<string, number> = {};
  const symbols = ["XAU", "XAG", "XPT", "XPD"];

  const fetches = symbols.map(async (code) => {
    try {
      const res = await fetch(`https://www.goldapi.io/api/${code}/USD`, {
        headers: { "x-access-token": apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.price > 0) {
          results[code] = data.price;
          console.log(`goldapi.io ${code}: $${data.price}`);
        }
      } else {
        console.error(`goldapi.io ${code}: ${res.status}`);
        await res.text();
      }
    } catch (e) {
      console.error(`goldapi.io ${code}:`, e.message);
    }
  });

  await Promise.all(fetches);
  return results;
}

// Source 2: Twelve Data for oil + any missing assets
async function fetchTwelveData(): Promise<Record<string, number>> {
  const apiKey = Deno.env.get("TWELVE_DATA_API_KEY");
  if (!apiKey) return {};

  const results: Record<string, number> = {};

  // Twelve Data symbols for commodities
  const pairs: [string, string][] = [
    ["USOIL", "CL"],   // WTI Crude
    ["UKOIL", "BZ"],   // Brent Crude  
  ];

  const fetches = pairs.map(async ([code, symbol]) => {
    try {
      const res = await fetch(
        `https://api.twelvedata.com/price?symbol=${symbol}&apikey=${apiKey}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.price) {
          results[code] = parseFloat(data.price);
          console.log(`twelvedata ${code} (${symbol}): $${data.price}`);
        }
      } else {
        console.error(`twelvedata ${code}: ${res.status}`);
        await res.text();
      }
    } catch (e) {
      console.error(`twelvedata ${code}:`, e.message);
    }
  });

  await Promise.all(fetches);
  return results;
}

// Fallback: AI for anything still missing
async function fetchFallbackAI(missing: string[]): Promise<Record<string, number>> {
  if (missing.length === 0) return {};
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return {};

  try {
    const labels = missing.map(c => {
      const map: Record<string, string> = { XAU: "gold/oz", XAG: "silver/oz", XPT: "platinum/oz", XPD: "palladium/oz", USOIL: "WTI crude/barrel", UKOIL: "Brent crude/barrel" };
      return `${c}=${map[c] || c}`;
    }).join(", ");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: `Current USD prices for: ${labels}. Reply ONLY JSON like {"XAU":3050}. No markdown.` }],
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
          if (typeof parsed[key] === "number" && parsed[key] > 0) result[key] = parsed[key];
        }
        return result;
      }
    }
  } catch (e) {
    console.error("AI fallback error:", e.message);
  }
  return {};
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (cachedPrices && (Date.now() - cacheTimestamp) < CACHE_TTL) {
      return new Response(JSON.stringify({ prices: cachedPrices, cached: true, timestamp: cacheTimestamp }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allCodes = ["XAU", "XAG", "XPT", "XPD", "USOIL", "UKOIL"];
    const results: Record<string, number> = {};
    const sources: string[] = [];

    // Fetch metals (goldapi.io) and oil (Twelve Data) in parallel
    const [metals, oil] = await Promise.all([fetchGoldApi(), fetchTwelveData()]);

    for (const [code, price] of Object.entries(metals)) { results[code] = price; }
    if (Object.keys(metals).length > 0) sources.push("goldapi.io");

    for (const [code, price] of Object.entries(oil)) { results[code] = price; }
    if (Object.keys(oil).length > 0) sources.push("twelvedata");

    // AI fallback for anything missing
    const missing = allCodes.filter(c => !results[c]);
    if (missing.length > 0) {
      const fallback = await fetchFallbackAI(missing);
      for (const [code, price] of Object.entries(fallback)) { results[code] = price; }
      if (Object.keys(fallback).length > 0) sources.push("ai-fallback");
    }

    console.log("Final:", JSON.stringify(results), "Sources:", sources.join(", "));

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
