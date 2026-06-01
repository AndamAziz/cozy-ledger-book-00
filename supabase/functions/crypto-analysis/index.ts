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
    const { symbol, price, change24h, indicators, summary, timeframe, mode, imageBase64, images, chartTimeframe, dayHigh, dayLow, lang } =
      await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Language selection: 'ku' (Kurdish only), 'en' (English only), 'both' (default)
    const langMode: "ku" | "en" | "both" = lang === "ku" || lang === "en" ? lang : "both";
    const narrativeLangRule =
      langMode === "en"
        ? "Respond ONLY in clear professional English."
        : langMode === "ku"
        ? "Respond ONLY in Kurdish Sorani (کوردیی ناوەندی)."
        : "Respond in BOTH languages: write each section first in Kurdish Sorani (کوردیی ناوەندی), then immediately below it the SAME content in English (prefix the English line with 'EN: ').";

    const hiLo =
      dayHigh != null && dayLow != null
        ? `\n24h high: $${dayHigh}\n24h low: $${dayLow}`
        : "";

    const baseContext = `Asset: ${symbol}/USD
Timeframe: ${timeframe}
Current price: $${price}
24h change: ${change24h}%${hiLo}
Technical signal summary: ${JSON.stringify(summary)}

Indicators: ${JSON.stringify(indicators)}`;

    // ----- Chart image analysis mode (read candles from one or more uploaded screenshots) -----
    if (mode === "image") {
      // Accept either a single imageBase64 or an array of images.
      const candidateImages: unknown[] = Array.isArray(images) && images.length
        ? images
        : typeof imageBase64 === "string"
        ? [imageBase64]
        : [];
      const validImages = candidateImages.filter(
        (u): u is string => typeof u === "string" && u.startsWith("data:image"),
      );

      if (validImages.length === 0) {
        return new Response(
          JSON.stringify({ error: "لانیکەم یەک وێنەی دروستی چارت پێویستە." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const multi = validImages.length > 1;
      const tfLine = chartTimeframe
        ? `The user states these charts are on the ${chartTimeframe} timeframe — interpret the candles accordingly.`
        : "";

      const imgLangRule =
        langMode === "en"
          ? "Respond ONLY in clear professional English."
          : langMode === "ku"
          ? "Respond ONLY in Kurdish Sorani (کوردیی ناوەندی)."
          : "Respond bilingually: for every section write the Kurdish Sorani (کوردیی ناوەندی) line first, then the SAME content in English on the next line prefixed with 'EN: '.";

      const adviceRule =
        "In the recommendation section ALWAYS state: a clear buy/sell/hold lean, the exact price area to ENTER (when to buy), the price area to take profit / EXIT (when to sell), and a suggested stop-loss area. Also report the highest and lowest visible price on the chart.";

      const singleSystem = `You are a professional candlestick chart analyst.
You will be given a screenshot of a trading chart. Carefully READ the candles, trend, and any visible levels.
${tfLine}
${imgLangRule} Be concise with short paragraphs and bullet points.
Cover these sections in order (keep the Kurdish header, and when bilingual add its English name):
1. **خوێندنەوەی چارت / Chart reading** - timeframe/asset and the overall candle structure.
2. **ڕەوت / Trend** - current trend (uptrend/downtrend/sideways).
3. **شێوەکان / Patterns** - candlestick patterns visible (doji, engulfing, etc.).
4. **بەرزترین و نزمترین / High & Low** - the highest and lowest visible price on the chart.
5. **ئاستە گرنگەکان / Key levels** - visible support/resistance levels.
6. **پێشنیار / Recommendation** - ${adviceRule}
7. **ئاگاداری / Warning** - one risk note. Always add: ئەمە ڕاوێژی دارایی نییە (this is not financial advice).
If the image is not a chart, say so politely.`;

      const multiSystem = `You are a professional candlestick chart analyst.
You will be given ${validImages.length} screenshots of trading charts (they may be different timeframes or assets).
Carefully READ the candles in EACH chart, then COMPARE the signals across all of them and produce ONE combined analysis.
${tfLine}
${imgLangRule} Be concise with short paragraphs and bullet points.
Cover these sections in order (keep the Kurdish header, and when bilingual add its English name):
1. **خوێندنەوەی هەر چارتێک / Per-chart reading** - read each chart in order (number them چارت ١، چارت ٢ ...).
2. **بەراوردی نیشانەکان / Signal comparison** - where the charts agree (هاوڕایی) and where they diverge (ناکۆک).
3. **ڕەوتی گشتی / Overall trend** - the combined overall trend conclusion.
4. **بەرزترین و نزمترین / High & Low** - the highest and lowest visible price across the charts.
5. **ئاستە گرنگەکان / Key levels** - key support/resistance levels.
6. **پێشنیار / Recommendation** - ONE combined view. ${adviceRule}
7. **ئاگاداری / Warning** - one risk note. Always add: ئەمە ڕاوێژی دارایی نییە (this is not financial advice).
If an image is not a chart, mention it politely and skip it.`;

      const userParts: unknown[] = [
        {
          type: "text",
          text: `${symbol ? `Possible asset: ${symbol}/USD. ` : ""}${
            chartTimeframe ? `Timeframe: ${chartTimeframe}. ` : ""
          }${
            multi
              ? `Read and COMPARE these ${validImages.length} trading charts and give one combined analysis in Kurdish Sorani.`
              : "Read this trading chart and analyse the candles in Kurdish Sorani."
          }`,
        },
        ...validImages.map((url, i) => [
          ...(multi ? [{ type: "text", text: `چارت ${i + 1}:` }] : []),
          { type: "image_url", image_url: { url } },
        ]).flat(),
      ];

      const visionResp = await fetch(AI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: multi ? multiSystem : singleSystem },
            { role: "user", content: userParts },
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
Every Kurdish field (headline, reasoning, riskNote, stopLossBasis, entryTiming, exitTiming, keyDrivers.note) MUST be written in Kurdish Sorani (کوردیی ناوەندی).
Every English field (headlineEn, reasoningEn, riskNoteEn, stopLossBasisEn, entryTimingEn, exitTimingEn, keyDrivers.noteEn) MUST be written in clear, fluent, professional English — NOT transliterated Kurdish. The English fields must be a real, natural English translation of their Kurdish counterpart, complete and grammatically correct.
Base your decision strictly on the provided price and indicator data, including the 24h high and 24h low when given.
Provide concrete numeric price levels derived from the current price, the 24h high/low, and indicators.
entry, targets and stopLoss must be realistic relative to the 24h high/low range.
entryTiming/entryTimingEn must clearly explain WHEN to buy (the exact price area or indicator condition that triggers entry).
exitTiming/exitTimingEn must clearly explain WHEN to sell (the price area or condition to take profit, and when to abandon the trade).
The stop-loss MUST be derived from a specific indicator level (e.g. the Bollinger lower/upper band, SMA20/SMA50, a recent swing level, or an RSI-based invalidation), NOT a random round number. Pick the single most relevant indicator for the stop and place the stop just beyond it.
Always fill stopLossIndicator with the indicator the stop is based on, stopLossIndicatorValue with the EXACT numeric level of that indicator (e.g. "SMA20 = $2,335" or "Bollinger lower band = $2,328"), stopLossBasis with a clear 1-2 sentence Kurdish explanation, and stopLossBasisEn with the SAME explanation in clear English. Both explanations must name the indicator, its exact value, the resulting stop-loss price, and why a break of that level invalidates the trade.
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
                    headlineEn: {
                      type: "string",
                      description: "The SAME short sentence as headline, in clear English.",
                    },
                    entry: {
                      type: "string",
                      description:
                        "Suggested entry price or zone (numbers, e.g. $64,200 - $64,800).",
                    },
                    entryTiming: {
                      type: "string",
                      description:
                        "Kurdish Sorani: WHEN to buy — the exact price area or indicator condition that should trigger entry.",
                    },
                    entryTimingEn: {
                      type: "string",
                      description:
                        "The SAME as entryTiming in clear English: when to buy (price area / condition).",
                    },
                    exitTiming: {
                      type: "string",
                      description:
                        "Kurdish Sorani: WHEN to sell — the price area/condition to take profit, and when to exit if it goes wrong.",
                    },
                    exitTimingEn: {
                      type: "string",
                      description:
                        "The SAME as exitTiming in clear English: when to sell / take profit / exit.",
                    },
                    targets: {
                      type: "array",
                      items: { type: "string" },
                      description: "1-3 take-profit price targets (numbers).",
                    },
                    stopLoss: {
                      type: "string",
                      description: "Suggested stop-loss price (number), placed just beyond the chosen indicator level.",
                    },
                    stopLossIndicator: {
                      type: "string",
                      enum: ["RSI", "MACD", "Bollinger", "SMA", "EMA", "Swing"],
                      description: "The indicator/level the stop-loss is based on.",
                    },
                    stopLossIndicatorValue: {
                      type: "string",
                      description:
                        "The EXACT numeric level of the indicator the stop is based on, formatted with the indicator name, e.g. \"SMA20 = $2,335\" or \"Bollinger lower band = $2,328\".",
                    },
                    stopLossBasis: {
                      type: "string",
                      description:
                        "1-2 sentences in Kurdish Sorani explaining WHY the stop-loss sits at this level, naming the indicator and its exact value, and what a break of it means.",
                    },
                    stopLossBasisEn: {
                      type: "string",
                      description:
                        "The SAME explanation as stopLossBasis but in clear English: indicator name, exact value, resulting stop-loss price, and what a break of it means.",
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
                    "stopLossIndicator",
                    "stopLossIndicatorValue",
                    "stopLossBasis",
                    "stopLossBasisEn",
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
