import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callAI(messages: unknown[], maxTokens = 900): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const resp = await fetch(AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      max_tokens: maxTokens,
    }),
  });

  if (resp.status === 429) throw new Error("RATE_LIMIT");
  if (resp.status === 402) throw new Error("CREDITS");
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI error ${resp.status}: ${t.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data?.choices?.[0]?.message?.content?.trim() ?? "";
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
          ? "You are a cinema expert. Write all answers in clear, fluent English. Write in a clean, well-organized way: plot summary, genre, a short note about the director and main actors, and why the movie is worth watching. 3 to 5 paragraphs."
          : "تۆ شارەزایەکی سینەماییت. هەموو وەڵامەکانت تەنها بە زمانی کوردیی سۆرانی بنووسە. ناوی فیلمەکان بە ئینگلیزی بهێڵەرەوە. بە شێوەیەکی جوان و ڕێکخراو بنووسە: کورتەی چیرۆک، جۆر، باسێکی کورت لەسەر دەرهێنەر و ئەکتەرە سەرەکییەکان، و بۆچی فیلمەکە جێگەی سەیرکردنە. ٣ تا ٥ پەرەگراف.";

      const user =
        lang === "en"
          ? `Give me full information about this movie in English: "${title}"${year ? ` (${year})` : ""}${genre ? ` — genre: ${genre}` : ""}.`
          : `زانیاری تەواوم دەربارەی ئەم فیلمە بدەرێ بە کوردیی سۆرانی: "${title}"${year ? ` (${year})` : ""}${genre ? ` — جۆر: ${genre}` : ""}.`;

      const content = await callAI(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        1100,
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
    const status = msg === "RATE_LIMIT" ? 429 : msg === "CREDITS" ? 402 : 500;
    console.error("movies-ai error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
