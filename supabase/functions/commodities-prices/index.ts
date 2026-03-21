import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const results: Record<string, number> = {};
    const errors: string[] = [];

    // Source 1: goldprice.org
    try {
      const res = await fetch("https://data-asg.goldprice.org/dbXRates/USD", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "Origin": "https://goldprice.org",
          "Referer": "https://goldprice.org/",
        },
      });
      const text = await res.text();
      console.log("goldprice.org status:", res.status, "body preview:", text.substring(0, 300));
      if (res.ok) {
        const data = JSON.parse(text);
        const item = data.items?.[0];
        if (item) {
          if (item.xauPrice) results.XAU = item.xauPrice;
          if (item.xagPrice) results.XAG = item.xagPrice;
          if (item.xptPrice) results.XPT = item.xptPrice;
          if (item.xpdPrice) results.XPD = item.xpdPrice;
        }
      }
    } catch (e) {
      errors.push(`goldprice: ${e.message}`);
      console.error("goldprice.org error:", e.message);
    }

    // Source 2: Yahoo Finance API (scrape quote page)
    if (!results.XAU) {
      try {
        const symbols = [
          { sym: "GC=F", code: "XAU" },
          { sym: "SI=F", code: "XAG" },
          { sym: "PL=F", code: "XPT" },
          { sym: "PA=F", code: "XPD" },
          { sym: "CL=F", code: "USOIL" },
          { sym: "BZ=F", code: "UKOIL" },
        ];
        
        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.map(s => s.sym).join(",")}`;
        console.log("Trying Yahoo Finance:", url);
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        });
        const text = await res.text();
        console.log("Yahoo status:", res.status, "body preview:", text.substring(0, 500));
        if (res.ok) {
          const data = JSON.parse(text);
          const quotes = data.quoteResponse?.result || [];
          for (const q of quotes) {
            const match = symbols.find(s => s.sym === q.symbol);
            if (match && q.regularMarketPrice) {
              results[match.code] = q.regularMarketPrice;
            }
          }
        }
      } catch (e) {
        errors.push(`yahoo: ${e.message}`);
        console.error("Yahoo error:", e.message);
      }
    }

    // Source 3: Try Google Finance scraping via simple fetch
    if (!results.XAU) {
      try {
        // Use forex-data-fixer as backup
        const res = await fetch("https://cdn.jsdelivr.net/npm/@nicolo-ribaudo/chk-utils@0.0.0/package.json");
        console.log("CDN test status:", res.status);
      } catch (e) {
        console.error("CDN test:", e.message);
      }
      
      // Try direct Kitco-style endpoint
      try {
        const res = await fetch("https://proxy.kitco.com/getPM?symbol=AU&currency=USD&unit=oz", {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        const text = await res.text();
        console.log("Kitco status:", res.status, "body:", text.substring(0, 300));
      } catch (e) {
        errors.push(`kitco: ${e.message}`);
      }
    }

    // If still no oil prices, try marketstack or other
    if (!results.USOIL) {
      try {
        // Try a direct fetch to see what works from edge function
        const testRes = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
        console.log("exchangerate-api status:", testRes.status);
        if (testRes.ok) {
          console.log("External fetch works! Just need right commodity source");
        }
      } catch (e) {
        console.error("exchangerate test:", e.message);
      }
    }

    console.log("Final results:", JSON.stringify(results));
    console.log("Errors:", errors.join("; "));

    return new Response(JSON.stringify({ 
      prices: results, 
      errors,
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
