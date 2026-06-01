import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function rateLimitResponse(status: number) {
  const msg =
    status === 429
      ? "زۆر داواکاری نێردراوە، تکایە دوای کەمێک هەوڵبدەرەوە."
      : "کرێدیتی AI تەواو بووە، تکایە باڵانس زیاد بکە.";
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, price, change24h, indicators, summary, timeframe, mode, imageBase64 } =
      await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const baseContext = `Asset: ${symbol}/USD
Timeframe: ${timeframe}
Current price: $${price}
24h change: ${change24h}%
Technical signal summary: ${JSON.stringify(summary)}
Indicators: ${JSON.stringify(indicators)}`;

    // ----- Chart image analysis mode (read candles from an uploaded screenshot) -----
    if (mode === "image") {
      if (typeof imageBase64 !== "string" || !imageBase64.startsWith("data:image")) {
        return new Response(
          JSON.stringify({ error: "وێنەیەکی دروستی چارت پێویستە." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const visionSystem = `You are a professional candlestick chart analyst.
You will be given a screenshot of a trading chart. Carefully READ the candles, trend, and any visible levels.
Respond ONLY in Kurdish Sorani (کوردیی ناوەندی). Be concise with short paragraphs and bullet points.
Use these exact Kurdish section headers:
1. **خوێندنەوەی چارت** - what timeframe/asset appears and the overall candle structure you see.
2. **ڕەوت** - current trend (uptrend/downtrend/sideways) based on the candles.
3. **شێوەکان** - candlestick patterns or formations visible (e.g. doji, engulfing, head & shoulders).
4. **ئاستە گرنگەکان** - visible support/resistance levels (estimate numbers if axis is readable).
5. **پێشنیار** - a buy/sell/hold lean (کڕین/فرۆشتن/هەڵگرتن) with reasoning and a suggested stop area.
6. **ئاگاداری** - one risk note. Always add: ئەمە ڕاوێژی دارایی نییە.
If the image is not a chart, say so politely in Kurdish.`;

      const visionResp = await fetch(AI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: visionSystem },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `${symbol ? `Possible asset: ${symbol}/USD. ` : ""}Read this trading chart and analyse the candles in Kurdish Sorani.`,
                },
                { type: "image_url", image_url: { url: imageBase64 } },
              ],
            },
          ],
          stream: true,
        }),
      });

      if (!visionResp.ok || !visionResp.body) {
        if (visionResp.status === 429 || visionResp.status === 402)
          return rateLimitResponse(visionResp.status);
        const t = await visionResp.text();
        console.error("AI gateway error (image):", visionResp.status, t);
        return new Response(JSON.stringify({ error: "هەڵە لە شیکاری وێنە." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(visionResp.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // ----- Structured summary mode (recommendation, levels, dates, risk) -----
    if (mode === "summary") {
      const sysPrompt = `You are a professional crypto technical analyst.
All text fields MUST be written in Kurdish Sorani (کوردیی ناوەندی).
Base your decision strictly on the provided price and indicator data.
Provide concrete numeric price levels derived from the current price and indicators.
Estimate a realistic time horizon for the trade in days based on the timeframe.
Never guarantee outcomes; this is educational, not financial advice.`;

      const resp = await fetch(AI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: sysPrompt },
            {
              role: "user",
              content: `${baseContext}\n\nProduce a structured trade summary.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "trade_summary",
                description:
                  "Structured trade recommendation with levels, time horizon and risk.",
                parameters: {
                  type: "object",
                  properties: {
                    recommendation: {
                      type: "string",
                      enum: ["buy", "sell", "hold"],
                      description: "Overall action signal.",
                    },
                    confidence: {
                      type: "integer",
                      minimum: 0,
                      maximum: 100,
                      description: "Confidence percentage 0-100.",
                    },
                    headline: {
                      type: "string",
                      description: "One short sentence in Kurdish Sorani.",
                    },
                    entry: {
                      type: "string",
                      description:
                        "Suggested entry price or zone (numbers, e.g. $64,200 - $64,800).",
                    },
                    targets: {
                      type: "array",
                      items: { type: "string" },
                      description: "1-3 take-profit price targets (numbers).",
                    },
                    stopLoss: {
                      type: "string",
                      description: "Suggested stop-loss price (number).",
                    },
                    horizonDays: {
                      type: "integer",
                      description: "Estimated trade duration in days.",
                    },
                    riskLevel: {
                      type: "string",
                      enum: ["low", "medium", "high"],
                      description: "Overall risk level.",
                    },
                    riskNote: {
                      type: "string",
                      description:
                        "One short risk-management note in Kurdish Sorani.",
                    },
                    reasoning: {
                      type: "string",
                      description:
                        "2-4 sentences in Kurdish Sorani explaining WHY this buy/sell/hold decision was made, referencing the indicator readings.",
                    },
                    keyDrivers: {
                      type: "array",
                      description:
                        "The indicators that most influenced the decision, ordered from most to least influential.",
                      items: {
                        type: "object",
                        properties: {
                          indicator: {
                            type: "string",
                            enum: ["RSI", "MACD", "Bollinger", "SMA", "EMA"],
                            description: "Indicator name.",
                          },
                          effect: {
                            type: "string",
                            enum: ["buy", "sell", "neutral"],
                            description: "Direction this indicator pushed.",
                          },
                          influence: {
                            type: "string",
                            enum: ["high", "medium", "low"],
                            description: "How influential it was in the decision.",
                          },
                          note: {
                            type: "string",
                            description:
                              "Very short reason in Kurdish Sorani (max ~8 words).",
                          },
                        },
                        required: ["indicator", "effect", "influence", "note"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: [
                    "recommendation",
                    "confidence",
                    "headline",
                    "entry",
                    "targets",
                    "stopLoss",
                    "horizonDays",
                    "riskLevel",
                    "riskNote",
                    "reasoning",
                    "keyDrivers",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "trade_summary" },
          },
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429 || resp.status === 402)
          return rateLimitResponse(resp.status);
        const t = await resp.text();
        console.error("AI gateway error (summary):", resp.status, t);
        return new Response(JSON.stringify({ error: "AI gateway error" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await resp.json();
      const call = data.choices?.[0]?.message?.tool_calls?.[0];
      const args = call?.function?.arguments;
      if (!args) {
        return new Response(
          JSON.stringify({ error: " نەتوانرا پوختە دروست بکرێت." }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(args);
      } catch {
        return new Response(
          JSON.stringify({ error: "هەڵە لە پرۆسێسکردنی پوختە." }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Attach reference date (today) for the recommendation
      const generatedAt = new Date().toISOString();
      return new Response(
        JSON.stringify({ summary: parsed, generatedAt }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ----- Detailed streaming narrative (default) -----
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

    const userPrompt = `${baseContext}\n\nGive a full technical analysis in Kurdish Sorani.`;

    const response = await fetch(AI_URL, {
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
    });

    if (!response.ok) {
      if (response.status === 429 || response.status === 402)
        return rateLimitResponse(response.status);
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
