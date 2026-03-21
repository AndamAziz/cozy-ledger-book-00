import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cache for 60 seconds
let cachedPrices: Record<string, number> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 1000;

// Source 1: metals.dev free API (real-time, 60s delay max)
async function fetchMetalsDev(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  try {
    const res = await fetch("https://api.metals.dev/v1/latest?api_key=demo&currency=USD&unit=toz", {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      console.log("metals.dev response:", JSON.stringify(data).substring(0, 500));
      if (data.metals) {
        if (data.metals.gold) results.XAU = data.metals.gold;
        if (data.metals.silver) results.XAG = data.metals.silver;
        if (data.metals.platinum) results.XPT = data.metals.platinum;
        if (data.metals.palladium) results.XPD = data.metals.palladium;
      }
    } else {
      console.error("metals.dev status:", res.status);
    }
  } catch (e) {
    console.error("metals.dev error:", e.message);
  }
  return results;
}

// Source 2: goldprice.org 
async function fetchGoldPriceOrg(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  try {
    const res = await fetch("https://data-asg.goldprice.org/dbXRates/USD", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Origin": "https://goldprice.org",
        "Referer": "https://goldprice.org/",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      const item = data.items?.[0];
      if (item) {
        if (item.xauPrice) results.XAU = item.xauPrice;
        if (item.xagPrice) results.XAG = item.xagPrice;
        if (item.xptPrice) results.XPT = item.xptPrice;
        if (item.xpdPrice) results.XPD = item.xpdPrice;
      }
    } else {
      console.log("goldprice.org status:", res.status);
    }
  } catch (e) {
    console.error("goldprice.org error:", e.message);
  }
  return results;
}

// Source 3: AI gateway as final fallback for any missing prices
async function fetchViaAI(missing: string[]): Promise<Record<string, number>> {
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
          content: `Current market prices in USD for: ${missing.join(', ')}. Where XAU=gold/oz, XAG=silver/oz, XPT=platinum/oz, XPD=palladium/oz, USOIL=WTI crude/barrel, UKOIL=Brent crude/barrel. Reply ONLY with JSON object like {"XAU":3050}. No markdown.`
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
    console.error("AI fallback error:", e.message);
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

    const allCodes = ['XAU', 'XAG', 'XPT', 'XPD', 'USOIL', 'UKOIL'];
    const results: Record<string, number> = {};
    const sources: string[] = [];

    // Try metals.dev and goldprice.org in parallel
    const [metalsDev, goldPrice] = await Promise.all([
      fetchMetalsDev(),
      fetchGoldPriceOrg(),
    ]);

    // Merge: prefer metals.dev, fallback to goldprice.org
    for (const code of ['XAU', 'XAG', 'XPT', 'XPD']) {
      if (metalsDev[code]) {
        results[code] = metalsDev[code];
      } else if (goldPrice[code]) {
        results[code] = goldPrice[code];
      }
    }

    if (Object.keys(metalsDev).length > 0) sources.push('metals.dev');
    if (Object.keys(goldPrice).length > 0) sources.push('goldprice.org');

    // Find missing codes and use AI fallback
    const missing = allCodes.filter(c => !results[c]);
    if (missing.length > 0) {
      const aiPrices = await fetchViaAI(missing);
      for (const code of missing) {
        if (aiPrices[code]) {
          results[code] = aiPrices[code];
        }
      }
      if (Object.keys(aiPrices).length > 0) sources.push('ai-fallback');
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
