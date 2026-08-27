import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
async function callGemini(
  apiKey: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
): Promise<string> {
  const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
  const userMsgs = messages.filter((m) => m.role !== "system");
  const body = {
    contents: userMsgs.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    ...(systemMsg
      ? { systemInstruction: { parts: [{ text: systemMsg }] } }
      : {}),
    generationConfig: {
      maxOutputTokens: Math.max(maxTokens, 2048),
      temperature: 0.7,
    },
  };
  const resp = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (resp.status === 429) throw new Error("RATE_LIMIT");
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Gemini error ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  return text.trim();
}
async function callAI(
  messages: Array<{ role: string; content: string }>,
  maxTokens = 900,
): Promise<string> {
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) throw new Error("GEMINI_API_KEY is not configured");
  return await callGemini(geminiKey, messages, maxTokens);
}
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json();
    const action = body?.action as string;
    if (action === "resolve-title") {
      const query = (body?.query as string)?.slice(0, 300) ?? "";
      if (!query.trim()) {
        return new Response(JSON.stringify({ title: "", corrected: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const content = await callAI(
        [
          {
            role: "system",
            content:
              "You are a movie identification expert. The user gives a movie name that may be a social-media nickname, a description, a translated/foreign name, or a misspelling. Reply with ONLY the REAL original English theatrical title of the movie, nothing else. No quotes, no year, no explanation. If you are not confident, return the user's text unchanged.",
          },
          {
            role: "user",
            content: `What is the real original English title of this movie: "${query}"`,
          },
        ],
        60,
      );
      const title = content.replace(/^["'`]+|["'`]+$/g, "").trim();
      const corrected =
        !!title && title.toLowerCase() !== query.trim().toLowerCase();
      return new Response(JSON.stringify({ title: title || query, corrected }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action === "info") {
      const title = (body?.title as string) ?? "";
      const year = (body?.year as string) ?? "";
      const genre = (body?.genre as string) ?? "";
      const lang = (body?.lang as string) === "en" ? "en" : "ku";
      const system =
        lang === "en"
          ? "You are a cinema expert. Write all answers in clear, fluent English. STRICT NO-SPOILER RULE: never reveal the ending, twists, deaths, betrayals, secret identities, or any late-plot events. Only describe the setup and premise (roughly the first act). Structure: (1) a short spoiler-free premise, (2) genre and tone, (3) director and main cast, (4) why it is worth watching. 3 to 5 short paragraphs. If you are unsure about a fact, omit it rather than invent."
          : "تۆ شارەزایەکی سینەماییت. هەموو وەڵامەکە تەنها بە زمانی کوردیی سۆرانی ڕەسەن بنووسە، بە ڕستەی ڕوون و ڕەوان. هیچ وشەیەکی ئینگلیزی مەخە ناو دەقەکەوە، تەنیا ناوی فیلم و کەسایەتییە ڕاستەقینەکان (دەرهێنەر و ئەکتەر) بە ئینگلیزی بهێڵەرەوە.\nیاسای گرنگ: هەرگیز سپۆیلەر مەکە — کۆتایی فیلم، سووڕدانەوەکان، مردنی کەسایەتی، خیانەت، ناسنامەی نهێنی، یان هیچ ڕووداوێکی نیوەی دواتری فیلم ئاشکرا مەکە. تەنها دەستپێک و کێشەی سەرەکی باس بکە. ڕێکخستن: (١) کورتەیەکی بێ سپۆیلەر لە چیرۆک، (٢) جۆر و کەشوهەوا، (٣) دەرهێنەر و ئەکتەرە سەرەکییەکان، (٤) بۆچی شایانی سەیرکردنە. ٣ تا ٥ پەرەگرافی کورت. ئەگەر لە زانیارییەک دڵنیا نیت، بەجێی هەڵبەستن، بەجێی بهێڵە.";
      const user =
        lang === "en"
          ? `Give me spoiler-free information about this movie in English: "${title}"${year ? ` (${year})` : ""}${genre ? ` — genre: ${genre}` : ""}. Do NOT reveal the ending or any twists.`
          : `زانیاری بێ سپۆیلەرم دەربارەی ئەم فیلمە بدەرێ، تەنها بە کوردیی سۆرانی: "${title}"${year ? ` (${year})` : ""}${genre ? ` — جۆر: ${genre}` : ""}. کۆتایی فیلم یان هیچ سووڕدانەوەیەک ئاشکرا مەکە. هەموو دەقەکە دەبێت بە کوردیی سۆرانی بێت، نەک ئینگلیزی.`;
      const content = await callAI(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        2048,
      );
      return new Response(JSON.stringify({ info: content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("movies-ai error:", msg);
    const info =
      msg === "CREDITS"
        ? "AI credits exhausted for this workspace. Please add credits to continue using AI info."
        : msg === "RATE_LIMIT"
          ? "AI is temporarily rate-limited. Please try again in a moment."
          : "AI service is temporarily unavailable. Please try again later.";
    return new Response(JSON.stringify({ info, soft_error: msg }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
