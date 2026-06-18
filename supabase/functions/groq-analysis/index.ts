import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Groq is OpenAI-compatible. Free + fast.
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

// ---- Simple in-memory 5 minute cache (warm-instance backstop for rate limits) ----
const CACHE_TTL_MS = 5 * 60 * 1000;
const summaryCache = new Map<string, { at: number; payload: unknown }>();

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
 * Fetch the LIVE economic calendar (ForexFactory feed) so the analysis is
 * grounded in real high/medium-impact events. Fails soft: returns "".
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
    const relevant = events.filter((e) => {
      const imp = (e.impact || "").toLowerCase();
      if (imp !== "high" && imp !== "medium") return false;
      const t = e.date ? Date.parse(e.date) : NaN;
      if (Number.isNaN(t)) return false;
      return t >= now - 5 * DAY && t <= now + 5 * DAY;
    });
    if (!relevant.length) return "";

    relevant.sort((a, b) => Date.parse(a.date || "") - Date.parse(b.date || ""));

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
      if (a > f) usdBeats++;
      else if (a < f) usdMisses++;
    }
    const usdBias =
      usdBeats === usdMisses
        ? "mixed/neutral"
        : usdBeats > usdMisses
        ? "leaning STRONGER (hotter data -> hawkish -> USD up, gold pressured)"
        : "leaning WEAKER (softer data -> dovish -> USD down, gold supported)";

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
      ? "زۆر داواکاری نێردراوە، تکایە دوای کەمێک هەوڵبدەرەوە. (Groq: 30/min)"
      : "هەڵەیەک ڕوویدا لە شیکاری AI.";
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const TRADE_SUMMARY_TOOL = {
  type: "function",
  function: {
    name: "trade_summary",
    description:
      "Structured trade recommendation with trend, levels, time horizon and risk.",
    parameters: {
      type: "object",
      properties: {
        recommendation: { type: "string", enum: ["buy", "sell", "hold"], description: "Trade recommendation. 'hold' = Wait." },
        confidence: { type: "integer", minimum: 0, maximum: 100, description: "Confidence 0-100." },
        headline: { type: "string", description: "One short sentence in Kurdish Sorani including trend direction (Bullish/Bearish/Neutral)." },
        headlineEn: { type: "string", description: "The SAME short sentence in clear English including trend direction." },
        entry: { type: "string", description: "Entry price or zone." },
        entryTiming: { type: "string", description: "Kurdish Sorani: when/where to enter." },
        entryTimingEn: { type: "string", description: "The SAME in clear English." },
        exitTiming: { type: "string", description: "Kurdish Sorani: when/where to take profit / exit." },
        exitTimingEn: { type: "string", description: "The SAME in clear English." },
        targets: { type: "array", items: { type: "string" }, description: "1-3 take-profit (resistance) targets." },
        stopLoss: { type: "string", description: "Stop-loss price near a key support/resistance level." },
        stopLossIndicator: { type: "string", description: "Indicator the stop is based on (EMA50, Bollinger band, swing low...)." },
        stopLossIndicatorValue: { type: "string", description: "Exact numeric level, e.g. 'EMA50 = $2,335'." },
        stopLossBasis: { type: "string", description: "Kurdish Sorani 1-2 sentence explanation of the stop." },
        stopLossBasisEn: { type: "string", description: "The SAME explanation in clear English." },
        horizonDays: { type: "integer", description: "Estimated trade duration in days." },
        validForMinutes: { type: "integer", description: "Minutes the plan stays valid before re-evaluation." },
        macroContext: { type: "string", description: "1-3 sentences Kurdish Sorani on macro drivers (USD/DXY, Fed/rates, CPI/PPI, news)." },
        macroContextEn: { type: "string", description: "The SAME macro context in clear English." },
        riskLevel: { type: "string", enum: ["low", "medium", "high"], description: "Risk level." },
        riskNote: { type: "string", description: "Short risk note in Kurdish Sorani." },
        riskNoteEn: { type: "string", description: "The SAME risk note in clear English." },
        reasoning: { type: "string", description: "2-4 sentences in Kurdish Sorani citing the indicators/levels and key support/resistance." },
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, price, change24h, indicators, summary, timeframe, mode, dayHigh, dayLow, lang } =
      await req.json();

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GROQ_API_KEY is not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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

    const macroEvents = await fetchMacroEvents();
    const macroBlock = macroEvents ? `\n\n${macroEvents}` : "";

    const baseContext = `Asset: ${symbol}/USD
Timeframe: ${timeframe}
Current price: $${price}
24h change: ${change24h}%${hiLo}
Technical signal summary: ${JSON.stringify(summary)}

Indicators: ${JSON.stringify(indicators)}${macroBlock}`;

    // ----- Structured summary mode -----
    if (mode === "summary") {
      // 5 minute cache key (price bucketed to ~0.05% so tiny ticks reuse cache).
      const bucket = price ? Math.round(Number(price) * 20) : 0;
      const cacheKey = `${symbol}|${timeframe}|${langMode}|${bucket}`;
      const cached = summaryCache.get(cacheKey);
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        return new Response(JSON.stringify(cached.payload), {
          headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" },
        });
      }

      const sysPrompt = `You are a professional XAU/USD (gold) and crypto technical analyst.
Analyze the asset using the provided current price, RSI, MACD, EMA values and recent macro/news, then output a structured trade plan covering:
1. Trend direction (Bullish/Bearish/Neutral) -> reflect it in headline/headlineEn and reasoning.
2. Key support/resistance levels -> use them for entry, targets and stopLoss.
3. Trade recommendation -> buy (Buy), sell (Sell) or hold (Wait).
4. Risk level -> low/medium/high.
5. Brief explanation in BOTH Kurdish Sorani and English.
Every Kurdish field MUST be in Kurdish Sorani (کوردیی ناوەندی). Every English field MUST be clear, fluent, professional English — a real translation, never transliterated Kurdish.
Provide concrete numeric levels realistic relative to the current price and the 24h high/low when given.
The stop-loss MUST be derived from a specific level (EMA9/EMA21/EMA50, Bollinger band, or a swing level). Fill stopLossIndicator and stopLossIndicatorValue with the exact level used.
For gold, factor in macro drivers (US Dollar/DXY, Fed/rates, CPI/PPI/NFP, geopolitics). If a "LIVE ECONOMIC CALENDAR" block is provided, base the USD judgement on those real events.
Set validForMinutes based on the timeframe and confidence honestly (0-100). This is educational, not financial advice.`;

      const resp = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.4,
          messages: [
            { role: "system", content: sysPrompt },
            { role: "user", content: `${baseContext}\n\nProduce a structured trade summary by calling trade_summary.` },
          ],
          tools: [TRADE_SUMMARY_TOOL],
          tool_choice: { type: "function", function: { name: "trade_summary" } },
        }),
      });

      if (!resp.ok) {
        if (resp.status === 429 || resp.status === 402) return rateLimitResponse(resp.status);
        const t = await resp.text();
        console.error("Groq error (summary):", resp.status, t);
        return new Response(JSON.stringify({ error: "هەڵە لە دروستکردنی پوختە." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await resp.json();
      const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) {
        return new Response(JSON.stringify({ error: "نەتوانرا پوختە دروست بکرێت." }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(args);
      } catch {
        return new Response(JSON.stringify({ error: "هەڵە لە پرۆسێسکردنی پوختە." }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!Array.isArray(parsed.targets)) parsed.targets = [];
      if (!Array.isArray(parsed.keyDrivers)) parsed.keyDrivers = [];

      const payload = { summary: parsed, generatedAt: new Date().toISOString() };
      summaryCache.set(cacheKey, { at: Date.now(), payload });
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
      });
    }

    // ----- Streaming narrative mode (default) -----
    const sysPrompt = `You are a professional XAU/USD (gold) and crypto technical analyst.
${narrativeLangRule}
Write a concise, well-structured analysis of the asset covering: trend direction (Bullish/Bearish/Neutral), key support/resistance levels, a clear trade recommendation (Buy/Sell/Wait), the risk level (Low/Medium/High), and a brief explanation grounded in the RSI, MACD, EMA values and the macro/news context provided. Use short headers and bullet points. This is educational, not financial advice.`;

    const resp = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.5,
        stream: true,
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: `${baseContext}\n\nWrite the analysis now.` },
        ],
      }),
    });

    if (!resp.ok || !resp.body) {
      if (resp.status === 429 || resp.status === 402) return rateLimitResponse(resp.status);
      const t = await resp.text().catch(() => "");
      console.error("Groq error (narrative):", resp.status, t);
      return new Response(JSON.stringify({ error: "هەڵەیەک ڕوویدا لە شیکاری AI." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Groq returns OpenAI-compatible SSE — proxy it straight through.
    return new Response(resp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (err) {
    console.error("groq-analysis fatal:", err);
    return new Response(JSON.stringify({ error: "هەڵەیەک ڕوویدا لە شیکاری AI." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
