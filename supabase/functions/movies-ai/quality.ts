// Pure helpers for prompt construction + output validation for movies-ai.
// Extracted so we can unit-test the no-spoiler + language-purity rules
// without hitting a real LLM.

export type InfoLang = "en" | "ku";

export const EN_SYSTEM_PROMPT =
  "You are a cinema expert. Write all answers in clear, fluent English. STRICT NO-SPOILER RULE: never reveal the ending, twists, deaths, betrayals, secret identities, or any late-plot events. Only describe the setup and premise (roughly the first act). Structure: (1) a short spoiler-free premise, (2) genre and tone, (3) director and main cast, (4) why it is worth watching. 3 to 5 short paragraphs. If you are unsure about a fact, omit it rather than invent.";

export const KU_SYSTEM_PROMPT =
  "تۆ شارەزایەکی سینەماییت. هەموو وەڵامەکە تەنها بە زمانی کوردیی سۆرانی ڕەسەن بنووسە، بە ڕستەی ڕوون و ڕەوان. هیچ وشەیەکی ئینگلیزی مەخە ناو دەقەکەوە، تەنیا ناوی فیلم و کەسایەتییە ڕاستەقینەکان (دەرهێنەر و ئەکتەر) بە ئینگلیزی بهێڵەرەوە. یاسای گرنگ: هەرگیز سپۆیلەر مەکە — کۆتایی فیلم، سووڕدانەوەکان، مردنی کەسایەتی، خیانەت، ناسنامەی نهێنی، یان هیچ ڕووداوێکی نیوەی دواتری فیلم ئاشکرا مەکە. تەنها دەستپێک و کێشەی سەرەکی باس بکە. ڕێکخستن: (١) کورتەیەکی بێ سپۆیلەر لە چیرۆک، (٢) جۆر و کەشوهەوا، (٣) دەرهێنەر و ئەکتەرە سەرەکییەکان، (٤) بۆچی شایانی سەیرکردنە. ٣ تا ٥ پەرەگرافی کورت. ئەگەر لە زانیارییەک دڵنیا نیت، بەجێی هەڵبەستن، بەجێی بهێڵە.";

export function buildInfoSystemPrompt(lang: InfoLang): string {
  return lang === "en" ? EN_SYSTEM_PROMPT : KU_SYSTEM_PROMPT;
}

export function buildInfoUserPrompt(
  lang: InfoLang,
  title: string,
  year = "",
  genre = "",
): string {
  if (lang === "en") {
    return `Give me spoiler-free information about this movie in English: "${title}"${year ? ` (${year})` : ""}${genre ? ` — genre: ${genre}` : ""}. Do NOT reveal the ending or any twists.`;
  }
  return `زانیاری بێ سپۆیلەرم دەربارەی ئەم فیلمە بدەرێ، تەنها بە کوردیی سۆرانی: "${title}"${year ? ` (${year})` : ""}${genre ? ` — جۆر: ${genre}` : ""}. کۆتایی فیلم یان هیچ سووڕدانەوەیەک ئاشکرا مەکە. هەموو دەقەکە دەبێت بە کوردیی سۆرانی بێت، نەک ئینگلیزی.`;
}

// ---------------------------------------------------------------------------
// Spoiler detection
// ---------------------------------------------------------------------------

// Phrases that reliably indicate the response is spoiling the ending.
// Kept conservative: single suggestive words like "dies" alone are OK inside
// a premise ("a soldier who fears he will die in battle"), but combined with
// "in the end" / "finally" they become spoilers.
const EN_SPOILER_PATTERNS: RegExp[] = [
  /\bthe (movie|film) ends? with\b/i,
  /\bin the (final|last) (act|scene|episode)\b/i,
  /\bit turns out that\b/i,
  /\bthe twist is\b/i,
  /\bplot twist:\s*/i,
  /\bthe killer (is|was)\b/i,
  /\bthe (real )?villain (is|was)\b/i,
  /\bis revealed to be\b/i,
  /\bthe ending reveals\b/i,
  /\bspoiler( alert)?\b/i,
  /\bfinally (dies|kills|betrays|reveals)\b/i,
  /\bat the end,?\s+\w+\s+(dies|kills|betrays)/i,
];

const KU_SPOILER_PATTERNS: RegExp[] = [
  /سپۆیلەر/,
  /لە کۆتایی(دا)?/,
  /کۆتایی فیلم(ەکە)?/,
  /دەرکەوت کە/,
  /ئاشکرا (دە|)بێت(ەوە)? کە/,
  /بکوژەکە.{0,20}(ە|بوو)/,
  /(دەم|دە)ردنی سەرەکی/,
];

export interface SpoilerCheck {
  ok: boolean;
  hits: string[];
}

export function detectSpoilers(text: string, lang: InfoLang): SpoilerCheck {
  const patterns = lang === "en" ? EN_SPOILER_PATTERNS : KU_SPOILER_PATTERNS;
  const hits: string[] = [];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) hits.push(m[0]);
  }
  return { ok: hits.length === 0, hits };
}

// ---------------------------------------------------------------------------
// Language purity for Kurdish Sorani output
// ---------------------------------------------------------------------------

// Arabic-script block used by Sorani/Arabic/Persian.
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
// Latin-letter runs (>=3 chars) are candidate English words. Proper names are
// allowed; we filter obvious names using a Title-Case heuristic.
const LATIN_WORD = /[A-Za-z]{3,}/g;

export interface LanguagePurityCheck {
  ok: boolean;
  // English-looking words that appear in Kurdish output and are not names.
  offendingWords: string[];
  // Ratio of Arabic-script chars vs Arabic+Latin chars. Should be high (>0.85).
  arabicRatio: number;
}

function isLikelyProperName(word: string): boolean {
  // Title-Case single word (e.g., "Nolan", "DiCaprio") or ALL-CAPS acronym.
  return /^[A-Z][a-zA-Z'’-]*$/.test(word) || /^[A-Z]{2,}$/.test(word);
}

export function checkKurdishPurity(text: string): LanguagePurityCheck {
  // Strip allowed proper-name runs (e.g. "Christopher Nolan") so they don't
  // pollute the arabic/latin ratio — proper names are permitted per the prompt.
  const stripped = text.replace(
    /\b[A-Z][a-zA-Z'’-]*(?:\s+[A-Z][a-zA-Z'’-]*)*\b/g,
    "",
  );
  const arabicChars = (stripped.match(new RegExp(ARABIC_SCRIPT, "g")) || []).length;
  const latinChars = (stripped.match(/[A-Za-z]/g) || []).length;
  const denom = arabicChars + latinChars || 1;
  const arabicRatio = arabicChars / denom;

  const latinWords = text.match(LATIN_WORD) || [];
  const offending = latinWords.filter((w) => !isLikelyProperName(w));

  return {
    ok: offending.length === 0 && arabicRatio >= 0.85,
    offendingWords: offending,
    arabicRatio,
  };
}

// Language purity for English output: reject Arabic-script leakage entirely.
export function checkEnglishPurity(text: string): LanguagePurityCheck {
  const arabicChars = (text.match(new RegExp(ARABIC_SCRIPT, "g")) || []).length;
  const latinChars = (text.match(/[A-Za-z]/g) || []).length;
  const denom = arabicChars + latinChars || 1;
  const arabicRatio = arabicChars / denom;
  return {
    ok: arabicChars === 0,
    offendingWords: [],
    arabicRatio,
  };
}

export interface InfoQualityReport {
  spoilers: SpoilerCheck;
  language: LanguagePurityCheck;
  ok: boolean;
}

export function validateInfoOutput(
  text: string,
  lang: InfoLang,
): InfoQualityReport {
  const spoilers = detectSpoilers(text, lang);
  const language =
    lang === "en" ? checkEnglishPurity(text) : checkKurdishPurity(text);
  return { spoilers, language, ok: spoilers.ok && language.ok };
}
