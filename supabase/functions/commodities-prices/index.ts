import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchGoldPriceOrg(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  try {
    const res = await fetch("https://data-asg.goldprice.org/dbXRates/USD", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
        "Referer": "https://goldprice.org/",
      },
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
    }
  } catch (e) {
    console.error("goldprice.org error:", e);
  }
  return results;
}

async function fetchMetalsDevApi(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  try {
    // metals-api.com free alternative endpoint
    const res = await fetch("https://api.metals.dev/v1/latest?api_key=demo&currency=USD&unit=toz", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.metals) {
        if (data.metals.gold) results.XAU = data.metals.gold;
        if (data.metals.silver) results.XAG = data.metals.silver;
        if (data.metals.platinum) results.XPT = data.metals.platinum;
        if (data.metals.palladium) results.XPD = data.metals.palladium;
      }
    }
  } catch (e) {
    console.error("metals.dev error:", e);
  }
  return results;
}

async function fetchMetalPriceApi(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  try {
    const res = await fetch("https://api.metalpriceapi.com/v1/latest?api_key=demo&base=USD&currencies=XAU,XAG,XPT,XPD", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.rates) {
        // These APIs return rates as 1/price (USD per unit)
        if (data.rates.XAU) results.XAU = 1 / data.rates.XAU;
        if (data.rates.XAG) results.XAG = 1 / data.rates.XAG;
        if (data.rates.XPT) results.XPT = 1 / data.rates.XPT;
        if (data.rates.XPD) results.XPD = 1 / data.rates.XPD;
      }
    }
  } catch (e) {
    console.error("metalpriceapi error:", e);
  }
  return results;
}

async function fetchOilPrices(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  try {
    // Try commodity-price-api from omkar.cloud for oil
    const wtiRes = await fetch("https://commodity-price-api.omkar.cloud/commodity-price?name=crude_oil", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (wtiRes.ok) {
      const data = await wtiRes.json();
      if (data.price_usd) results.USOIL = data.price_usd;
    }
  } catch (e) {
    console.error("Oil WTI fetch error:", e);
  }

  try {
    const brentRes = await fetch("https://commodity-price-api.omkar.cloud/commodity-price?name=brent_crude_oil", {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (brentRes.ok) {
      const data = await brentRes.json();
      if (data.price_usd) results.UKOIL = data.price_usd;
    }
  } catch (e) {
    console.error("Oil Brent fetch error:", e);
  }

  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Fetch from multiple sources in parallel
    const [goldPriceOrg, metalsDev, metalPriceApi, oilPrices] = await Promise.all([
      fetchGoldPriceOrg(),
      fetchMetalsDevApi(),
      fetchMetalPriceApi(),
      fetchOilPrices(),
    ]);

    // Merge results with priority: goldPriceOrg > metalsDev > metalPriceApi
    const results: Record<string, number> = {};
    
    for (const code of ['XAU', 'XAG', 'XPT', 'XPD']) {
      results[code] = goldPriceOrg[code] || metalsDev[code] || metalPriceApi[code] || 0;
    }

    results.USOIL = oilPrices.USOIL || 0;
    results.UKOIL = oilPrices.UKOIL || 0;

    // Track which sources worked
    const sources: string[] = [];
    if (Object.keys(goldPriceOrg).length > 0) sources.push('goldprice.org');
    if (Object.keys(metalsDev).length > 0) sources.push('metals.dev');
    if (Object.keys(metalPriceApi).length > 0) sources.push('metalpriceapi');
    if (Object.keys(oilPrices).length > 0) sources.push('commodity-api');

    console.log("Sources used:", sources.join(', '), "Prices:", JSON.stringify(results));

    return new Response(JSON.stringify({ 
      prices: results, 
      sources,
      timestamp: Date.now() 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
