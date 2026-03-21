import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

let cachedPrices: Record<string, number> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30 * 1000;

// goldapi.io - metals (XAU, XAG, XPT, XPD)
async function fetchGoldApi(): Promise<Record<string, number>> {
  const apiKey = Deno.env.get("GOLD_API_KEY");
  if (!apiKey) return {};
  const results: Record<string, number> = {};

  const fetches = ["XAU", "XAG", "XPT", "XPD"].map(async (code) => {
    try {
      const res = await fetch(`https://www.goldapi.io/api/${code}/USD`, {
        headers: { "x-access-token": apiKey, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.price > 0) results[code] = data.price;
      } else { await res.text(); }
    } catch (_) {}
  });
  await Promise.all(fetches);
  if (Object.keys(results).length > 0) console.log("goldapi.io metals:", JSON.stringify(results));
  return results;
}

// Twelve Data - WTI oil (CL symbol)
async function fetchTwelveDataOil(): Promise<Record<string, number>> {
  const apiKey = Deno.env.get("TWELVE_DATA_API_KEY");
  if (!apiKey) return {};
  const results: Record<string, number> = {};

  try {
    const res = await fetch(`https://api.twelvedata.com/price?symbol=CL&apikey=${apiKey}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.price) {
        results.USOIL = parseFloat(data.price);
        console.log(`twelvedata WTI: $${data.price}`);
      }
    }
  } catch (_) {}

  // Estimate Brent as WTI + ~$4-5 spread (industry standard)
  if (results.USOIL) {
    results.UKOIL = Math.round((results.USOIL + 4.5) * 100) / 100;
    console.log(`Brent estimated from WTI spread: $${results.UKOIL}`);
  }

  return results;
}

// AI fallback for anything missing
async function fetchFallbackAI(missing: string[]): Promise<Record<string, number>> {
  if (missing.length === 0) return {};
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return {};

  try {
    const labels = missing.map(c => {
      const m: Record<string, string> = { XAU: "gold/oz", XAG: "silver/oz", XPT: "platinum/oz", XPD: "palladium/oz", USOIL: "WTI crude/barrel", UKOIL: "Brent crude/barrel" };
      return `${c}=${m[c] || c}`;
    }).join(", ");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: `Current USD spot prices: ${labels}. ONLY JSON like {"XAU":3050}. No markdown.` }],
        temperature: 0, max_tokens: 100,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim() || "";
      const match = content.match(/\{[^}]+\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const result: Record<string, number> = {};
        for (const key of missing) {
          if (typeof parsed[key] === "number" && parsed[key] > 0) result[key] = parsed[key];
        }
        return result;
      }
    }
  } catch (_) {}
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

    const [metals, oil] = await Promise.all([fetchGoldApi(), fetchTwelveDataOil()]);

    for (const [k, v] of Object.entries(metals)) results[k] = v;
    if (Object.keys(metals).length > 0) sources.push("goldapi.io");

    for (const [k, v] of Object.entries(oil)) results[k] = v;
    if (Object.keys(oil).length > 0) sources.push("twelvedata");

    const missing = allCodes.filter(c => !results[c]);
    if (missing.length > 0) {
      const fb = await fetchFallbackAI(missing);
      for (const [k, v] of Object.entries(fb)) results[k] = v;
      if (Object.keys(fb).length > 0) sources.push("ai-fallback");
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
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
