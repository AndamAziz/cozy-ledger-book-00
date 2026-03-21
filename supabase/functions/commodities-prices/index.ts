import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cache prices for 2 minutes
let cachedPrices: Record<string, number> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 2 * 60 * 1000;

async function fetchPricesViaAI(): Promise<Record<string, number>> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    console.error("No LOVABLE_API_KEY");
    return {};
  }

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: `What are the current live spot prices right now (today, March 2026) for these commodities in USD? Respond with ONLY a JSON object, no markdown, no explanation:
{"XAU": gold_price_per_oz, "XAG": silver_price_per_oz, "XPT": platinum_price_per_oz, "XPD": palladium_price_per_oz, "USOIL": wti_crude_per_barrel, "UKOIL": brent_crude_per_barrel}
Use the most recent real market prices. Numbers only.`
        }],
        temperature: 0,
        max_tokens: 200,
      }),
    });

    if (!res.ok) {
      console.error("AI gateway error:", res.status);
      return {};
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    console.log("AI prices:", content);

    const jsonMatch = content.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const result: Record<string, number> = {};
      for (const key of ['XAU', 'XAG', 'XPT', 'XPD', 'USOIL', 'UKOIL']) {
        if (typeof parsed[key] === 'number' && parsed[key] > 0) {
          result[key] = parsed[key];
        }
      }
      return result;
    }
  } catch (e) {
    console.error("AI fetch error:", e.message);
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

    const prices = await fetchPricesViaAI();
    if (Object.keys(prices).length > 0) {
      cachedPrices = prices;
      cacheTimestamp = Date.now();
    }

    return new Response(JSON.stringify({ prices, cached: false, timestamp: Date.now() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
