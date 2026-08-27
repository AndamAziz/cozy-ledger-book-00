import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

// Lean structured trade plan tool used to auto-detect buy/sell targets from chart images.
const IMAGE_TRADE_TOOL = {
  type: "function",
  function: {
    name: "trade_summary",
    description:
      "Structured buy/sell trade plan read directly from candlestick chart screenshot(s).",
    parameters: {
      type: "object",
      properties: {
        recommendation: { type: "string", enum: ["buy", "sell", "hold"], description: "Auto-decided action from the chart." },
        confidence: { type: "integer", minimum: 0, maximum: 100, description: "Confidence percentage 0-100." },
        headline: { type: "string", description: "One short sentence in Kurdish Sorani." },
        headlineEn: { type: "string", description: "The SAME short sentence in clear English." },
        entry: { type: "string", description: "Entry price or zone read from the chart's price axis." },
        entryTiming: { type: "string", description: "Kurdish Sorani: when/where to enter (price area/condition)." },
        entryTimingEn: { type: "string", description: "The SAME in clear English." },
        exitTiming: { type: "string", description: "Kurdish Sorani: when/where to take profit / exit." },
        exitTimingEn: { type: "string", description: "The SAME in clear English." },
        targets: { type: "array", items: { type: "string" }, description: "1-3 take-profit price targets read from the chart." },
        stopLoss: { type: "string", description: "Stop-loss price placed just beyond a visible swing level." },
        stopLossBasis: { type: "string", description: "Kurdish Sorani: which visible level the stop is based on and why." },
        stopLossBasisEn: { type: "string", description: "The SAME explanation in clear English." },
        horizonDays: { type: "integer", description: "Estimated trade duration in days based on the timeframe." },
        validForMinutes: { type: "integer", description: "How many MINUTES this plan/targets stay valid before re-evaluation, based on the chart timeframe." },
        macroContext: { type: "string", description: "1-3 sentences Kurdish Sorani on macro drivers (USD/DXY, Fed/rates, CPI/PPI, war/geopolitics) for metals." },
        macroContextEn: { type: "string", description: "The SAME macro context in clear English." },
        riskLevel: { type: "string", enum: ["low", "medium", "high"], description: "Overall risk level." },
        riskNote: { type: "string", description: "One short risk note in Kurdish Sorani." },
        riskNoteEn: { type: "string", description: "The SAME risk note in clear English." },
        reasoning: { type: "string", description: "2-4 sentences in Kurdish Sorani citing the chart's trend/levels." },
        reasoningEn: { type: "string", description: "The SAME reasoning in clear fluent English." },
      },
      required: [
        "recommendation", "confidence", "headline", "headlineEn", "entry",
        "targets", "stopLoss", "horizonDays", "riskLevel", "reasoning", "reasoningEn",
      ],
      additionalProperties: false,
    },
  },
};


interface FFEvent {
  title?: string;
  country?: string;
  date?: string;
  impact?: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

/**
 * Fetch the LIVE economic calendar (same data as ForexFactory) so the analysis
 * is grounded in real high-impact events (CPI, PPI, NFP, FOMC...) rather than
 * the model's stale training knowledge. Returns a compact, AI-friendly summary
 * of recent + upcoming high/medium-impact events with a derived USD bias.
 * Fails soft: returns "" if the feed is unreachable.
 */
async function fetchMacroEvents(): Promise<string> {
  const urls = [
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
  ];
  try {
    const results = await Promise.allSettled(
      urls.map((u) =>
        fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) =>
          r.ok ? (r.json() as Promise<FFEvent[]>) : [],
        ),
      ),
    );
    let events: FFEvent[] = [];
    for (const r of results) if (r.status === "fulfilled" && Array.isArray(r.value)) events = events.concat(r.value);
    if (!events.length) return "";

    const now = Date.now();
    const DAY = 86400000;
    // Keep High/Medium impact within a -5d..+5d window, prioritising USD.
    const relevant = events.filter((e) => {
      const imp = (e.impact || "").toLowerCase();
      if (imp !== "high" && imp !== "medium") return false;
      const t = e.date ? Date.parse(e.date) : NaN;
      if (Number.isNaN(t)) return false;
      return t >= now - 5 * DAY && t <= now + 5 * DAY;
    });
    if (!relevant.length) return "";

    relevant.sort((a, b) => Date.parse(a.date || "") - Date.parse(b.date || ""));

    // Derive a simple USD bias from released vs forecast on inflation/jobs/growth.
    const num = (s?: string) => {
      if (!s) return NaN;
      const m = s.replace(/[,%KMB]/g, "").match(/-?\d+(\.\d+)?/);
      return m ? parseFloat(m[0]) : NaN;
    };
    let usdBeats = 0;
    let usdMisses = 0;
    for (const e of relevant) {
      if ((e.country || "") !== "USD" || !e.actual) continue;
      const a = num(e.actual);
      const f = num(e.forecast);
      if (Number.isNaN(a) || Number.isNaN(f)) continue;
      // Higher-than-forecast inflation/jobs/growth = USD-positive (hawkish).
      if (a > f) usdBeats++;
      else if (a < f) usdMisses++;
    }
    const usdBias =
      usdBeats === usdMisses
        ? "mixed/neutral"
        : usdBeats > usdMisses
        ? "leaning STRONGER (hotter data → hawkish → USD up, gold pressured)"
        : "leaning WEAKER (softer data → dovish → USD down, gold supported)";

    const fmtLine = (e: FFEvent) => {
      const d = e.date ? new Date(e.date) : null;
      const when = d
        ? d.toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false }) + " UTC"
        : "?";
      const released = e.actual ? `actual ${e.actual}` : "not released yet";
      return `- [${e.country}|${e.impact}] ${when} ${e.title}: ${released} (forecast ${e.forecast || "—"}, previous ${e.previous || "—"})`;
    };

    const lines = relevant.slice(0, 24).map(fmtLine).join("\n");
    return `LIVE ECONOMIC CALENDAR (real high/medium-impact events, ForexFactory feed):
Derived USD bias from released-vs-forecast: ${usdBias} (beats ${usdBeats}, misses ${usdMisses}).
${lines}`;
  } catch (err) {
    console.error("fetchMacroEvents failed:", err);
    return "";
  }
}

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

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

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

    // Live macro/news context (real economic calendar). Only needed for the
    // text/structured analysis modes, so skip the network call for pure image modes.
    const needsMacro = mode !== "image";
    const macroEvents = needsMacro ? await fetchMacroEvents() : "";
    const macroBlock = macroEvents ? `\n\n${macroEvents}` : "";

    const baseContext = `Asset: ${symbol}/USD
Timeframe: ${timeframe}
Current price: $${price}
24h change: ${change24h}%${hiLo}
Technical signal summary: ${JSON.stringify(summary)}

Indicators: ${JSON.stringify(indicators)}${macroBlock}`;

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
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-3.6-flash",
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

    // ----- Auto-detect buy/sell targets from chart image(s) (structured) -----
    if (mode === "image-summary") {
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

      const sys = `You are a professional candlestick chart analyst.
Carefully READ the candles, trend, and visible support/resistance levels in the uploaded chart screenshot(s)${
        chartTimeframe ? ` (timeframe ${chartTimeframe})` : ""
      }.
Decide AUTOMATICALLY whether this is a BUY, SELL, or HOLD setup.
All price levels (entry, targets, stopLoss) MUST be realistic numbers READ DIRECTLY from the chart's visible price axis, using the same number format/scale shown on the chart.
For a BUY: place the stop-loss just BELOW a visible support / recent swing low, and put targets ABOVE toward visible resistance.
For a SELL: place the stop-loss just ABOVE a visible resistance / recent swing high, and put targets BELOW toward visible support.
Every Kurdish field MUST be in Kurdish Sorani (کوردیی ناوەندی). Every English field MUST be clear, fluent, professional English (a real translation, never transliterated Kurdish).
For gold/precious metals also fill macroContext/macroContextEn with the key macro drivers (US Dollar/DXY, Fed & rates, CPI/PPI inflation, war/geopolitical safe-haven demand) that support a rise or fall.
Set validForMinutes to how many MINUTES the plan/targets stay valid before re-evaluation, based on the chart timeframe, and reflect that discipline in exitTiming.
This is educational, not financial advice.`;

      const userParts: unknown[] = [
        {
          type: "text",
          text: `${symbol ? `Asset: ${symbol}/USD. ` : ""}${
            chartTimeframe ? `Timeframe: ${chartTimeframe}. ` : ""
          }Analyse the chart${validImages.length > 1 ? "s" : ""} and output ONE structured buy/sell trade plan with entry, take-profit targets and stop-loss read from the chart.`,
        },
        ...validImages.map((url) => ({ type: "image_url", image_url: { url } })),
      ];

      const resp = await fetch(AI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-3.6-flash",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: userParts },
          ],
          tools: [IMAGE_TRADE_TOOL],
          tool_choice: { type: "function", function: { name: "trade_summary" } },
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429 || resp.status === 402)
          return rateLimitResponse(resp.status);
        const t = await resp.text();
        console.error("AI gateway error (image-summary):", resp.status, t);
        return new Response(JSON.stringify({ error: "هەڵە لە دیاریکردنی ئامانجەکان." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await resp.json();
      const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) {
        return new Response(JSON.stringify({ error: "نەتوانرا ئامانجەکان دیاری بکرێن." }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(args);
      } catch {
        return new Response(JSON.stringify({ error: "هەڵە لە پرۆسێسکردنی ئامانجەکان." }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!Array.isArray(parsed.targets)) parsed.targets = [];
      if (!Array.isArray(parsed.keyDrivers)) parsed.keyDrivers = [];
      return new Response(
        JSON.stringify({ summary: parsed, generatedAt: new Date().toISOString() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
The stop-loss MUST be derived from a specific indicator level (e.g. the Bollinger lower/upper band, EMA9/EMA21/EMA50, a recent swing level, or an RSI-based invalidation), NOT a random round number. Pick the single most relevant indicator for the stop and place the stop just beyond it.
Always fill stopLossIndicator with the indicator the stop is based on, stopLossIndicatorValue with the EXACT numeric level of that indicator (e.g. "EMA50 = $2,335" or "Bollinger lower band = $2,328"), stopLossBasis with a clear 1-2 sentence Kurdish explanation, and stopLossBasisEn with the SAME explanation in clear English. Both explanations must name the indicator, its exact value, the resulting stop-loss price, and why a break of that level invalidates the trade.
Estimate a realistic time horizon for the trade in days based on the timeframe.
MACRO / FUNDAMENTAL AWARENESS: For gold and precious metals (XAU, XAG, XPT, XPD) especially, factor in the key macro drivers that move the price: the US Dollar / DXY strength (a stronger dollar usually pushes gold DOWN, a weaker dollar pushes it UP), US interest-rate and Fed/FOMC expectations, the latest monthly economic reports (NFP jobs report, CPI/PPI inflation, GDP, central-bank monthly statements), trade/tariff and war/geopolitical safe-haven demand. Fill macroContext (Kurdish Sorani) and macroContextEn (clear English) with 1-3 sentences naming which of these forces currently support a rise or a fall, referencing the most recent known monthly releases and whether they leaned hawkish/dovish, and how they shaped this decision. If you do not have confirmed live news, state the typical/assumed macro stance and the next major scheduled report clearly rather than inventing specific headlines.
LIVE DATA PRIORITY: If a "LIVE ECONOMIC CALENDAR" block is provided in the user message, you MUST base the macro/USD judgement on THOSE real events (actual vs forecast vs previous) and the derived USD bias, NOT on memory. Explicitly weigh whether each released USD figure (CPI/PPI/NFP/GDP) came in hotter (USD-stronger, bearish for gold) or softer (USD-weaker, bullish for gold) than forecast, and let high-impact releases or war/geopolitical risk shift the recommendation and confidence accordingly. Name the specific event(s) and numbers that drove the up/down decision in macroContext/macroContextEn.
TARGET VALIDITY: Set validForMinutes to the number of minutes this trade plan and its targets should be trusted before it must be re-evaluated, derived from the timeframe (e.g. a 1H chart plan is typically valid ~60-240 minutes, a 1D plan longer). The plan expires after that many minutes; mention this discipline inside exitTiming as well.
Set confidence honestly (0-100) reflecting how strongly the technical + macro picture align.
Never guarantee outcomes; this is educational, not financial advice.`;

      const resp = await fetch(AI_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-3.6-flash",
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
                      enum: ["RSI", "MACD", "Bollinger", "EMA", "Swing"],
                      description: "The indicator/level the stop-loss is based on.",
                    },
                    stopLossIndicatorValue: {
                      type: "string",
                      description:
                        "The EXACT numeric level of the indicator the stop is based on, formatted with the indicator name, e.g. \"EMA50 = $2,335\" or \"Bollinger lower band = $2,328\".",
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
                    validForMinutes: {
                      type: "integer",
                      description:
                        "How many MINUTES this trade plan and its targets stay valid before they must be re-evaluated, derived from the timeframe.",
                    },
                    macroContext: {
                      type: "string",
                      description:
                        "1-3 sentences in Kurdish Sorani on the macro/fundamental drivers (US Dollar/DXY, Fed/rates, CPI/PPI inflation, war/geopolitical safe-haven demand) supporting a rise or fall.",
                    },
                    macroContextEn: {
                      type: "string",
                      description:
                        "The SAME macro/fundamental context as macroContext, in clear professional English.",
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
                    riskNoteEn: {
                      type: "string",
                      description: "The SAME risk note in clear English.",
                    },
                    reasoning: {
                      type: "string",
                      description:
                        "2-4 sentences in Kurdish Sorani explaining WHY this buy/sell/hold decision was made, referencing the indicator readings.",
                    },
                    reasoningEn: {
                      type: "string",
                      description:
                        "The SAME reasoning as the Kurdish field, in clear fluent English.",
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
                            enum: ["RSI", "MACD", "Bollinger", "EMA"],
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
                          noteEn: {
                            type: "string",
                            description:
                              "The SAME short reason in English (max ~8 words).",
                          },
                        },
                        required: ["indicator", "effect", "influence", "note", "noteEn"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: [
                    "recommendation",
                    "confidence",
                    "headline",
                    "headlineEn",
                    "entry",
                    "entryTiming",
                    "entryTimingEn",
                    "exitTiming",
                    "exitTimingEn",
                    "targets",
                    "stopLoss",
                    "stopLossIndicator",
                    "stopLossIndicatorValue",
                    "stopLossBasis",
                    "stopLossBasisEn",
                    "horizonDays",
                    "validForMinutes",
                    "macroContext",
                    "macroContextEn",
                    "riskLevel",
                    "riskNote",
                    "riskNoteEn",
                    "reasoning",
                    "reasoningEn",
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
${narrativeLangRule}
Be concise and practical. Use short paragraphs and bullet points.
Cover these sections in order (keep the Kurdish header, and when bilingual add its English name):
1. **پوختەی بازاڕ / Market summary** - overall market read in 1-2 sentences.
2. **شیکاری تەکنیکی / Technical analysis** - interpret RSI, MACD, Bollinger and moving averages.
3. **بەرزترین و نزمترین / 24h High & Low** - the 24h high and 24h low and what they mean for range.
4. **ئاستە گرنگەکان / Key levels** - key support/resistance levels (use the provided numbers).
5. **کەی بکڕیت و کەی بفرۆشیت / When to buy & sell** - the price area/condition to enter (buy) and the area/condition to take profit (sell).
6. **هۆکارە ئابووری و سیاسییەکان / Macro & news drivers** - for gold/metals especially, explain how the US Dollar/DXY, Fed & interest rates, the latest monthly economic reports (NFP jobs, CPI/PPI inflation, FOMC/central-bank decisions, GDP), trade & tariff news, and war/geopolitical safe-haven demand currently support a rise or fall. If a "LIVE ECONOMIC CALENDAR" block is given in the user message, you MUST use those REAL events (actual vs forecast vs previous) and the derived USD bias as the basis — quote the specific figures, judge whether each USD release came in hotter (USD-stronger → gold down) or softer (USD-weaker → gold up) than forecast, flag any war/geopolitical risk, and conclude clearly whether the market leans UP or DOWN. Only fall back to typical/assumed stance and the next scheduled report if no live block is present.
7. **ماوەی متمانە / Plan validity** - state in MINUTES how long this plan and its targets stay trustworthy before re-evaluation, derived from the timeframe.
8. **ئەگەرەکان / Scenarios** - bullish vs bearish scenarios.
9. **ئاگاداری / Warning** - one risk-management note.
Never give financial guarantees. Always note this is not financial advice (ئەمە ڕاوێژی دارایی نییە / this is not financial advice).`;

    const userPrompt = `${baseContext}\n\nGive a full technical analysis following the language rule above.`;

    const response = await fetch(AI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-3.6-flash",
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
