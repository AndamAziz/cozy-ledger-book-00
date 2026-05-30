import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, price, change24h, indicators, summary, timeframe } =
      await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a professional crypto market technical analyst.
Respond ONLY in Kurdish Sorani (کوردیی ناوەندی).
Be concise and practical. Use short paragraphs and bullet points.
Structure your answer with these sections (use these exact Kurdish headers):
1. **پوختەی بازاڕ** - overall market read in 1-2 sentences.
2. **شیکاری تەکنیکی** - interpret RSI, MACD, Bollinger and moving averages.
3. **ئاستە گرنگەکان** - key support/resistance levels (use the provided numbers).
4. **ئەگەرەکان** - bullish vs bearish scenarios.
5. **ئاگاداری** - one risk-management note.
Never give financial guarantees. Always note this is not financial advice (ئەمە ڕاوێژی دارایی نییە).`;

    const userPrompt = `Asset: ${symbol}/USD
Timeframe: ${timeframe}
Current price: $${price}
24h change: ${change24h}%
Technical signal summary: ${JSON.stringify(summary)}
Indicators: ${JSON.stringify(indicators)}

Give a full technical analysis in Kurdish Sorani.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          stream: true,
        }),
      },
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: "زۆر داواکاری نێردراوە، تکایە دوای کەمێک هەوڵبدەرەوە.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error: "کرێدیتی AI تەواو بووە، تکایە باڵانس زیاد بکە.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("crypto-analysis error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
