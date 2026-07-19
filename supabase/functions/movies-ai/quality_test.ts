import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildInfoSystemPrompt,
  buildInfoUserPrompt,
  detectSpoilers,
  checkKurdishPurity,
  checkEnglishPurity,
  validateInfoOutput,
  EN_SYSTEM_PROMPT,
  KU_SYSTEM_PROMPT,
} from "./quality.ts";

// --- Prompt construction ----------------------------------------------------

Deno.test("EN system prompt enforces no-spoiler rule", () => {
  assert(/STRICT NO-SPOILER RULE/.test(EN_SYSTEM_PROMPT));
  assert(/never reveal the ending/i.test(EN_SYSTEM_PROMPT));
});

Deno.test("KU system prompt enforces no-spoiler + Kurdish-only rule", () => {
  assert(KU_SYSTEM_PROMPT.includes("سپۆیلەر"));
  assert(KU_SYSTEM_PROMPT.includes("کوردیی سۆرانی"));
  assert(KU_SYSTEM_PROMPT.includes("هیچ وشەیەکی ئینگلیزی"));
});

Deno.test("buildInfoUserPrompt injects title/year/genre", () => {
  const en = buildInfoUserPrompt("en", "Inception", "2010", "Sci-Fi");
  assert(en.includes("Inception"));
  assert(en.includes("(2010)"));
  assert(en.includes("Sci-Fi"));
  assert(/spoiler-free/i.test(en));

  const ku = buildInfoUserPrompt("ku", "Inception", "2010", "درامە");
  assert(ku.includes("Inception"));
  assert(ku.includes("کوردیی سۆرانی"));
  assert(ku.includes("سپۆیلەر"));
});

Deno.test("buildInfoSystemPrompt returns language-specific prompt", () => {
  assertEquals(buildInfoSystemPrompt("en"), EN_SYSTEM_PROMPT);
  assertEquals(buildInfoSystemPrompt("ku"), KU_SYSTEM_PROMPT);
});

// --- Spoiler detection ------------------------------------------------------

Deno.test("EN: clean premise passes", () => {
  const text =
    "A skilled thief who steals corporate secrets through dream-sharing " +
    "technology is offered a chance to have his criminal history erased. " +
    "Directed by Christopher Nolan and starring Leonardo DiCaprio.";
  const r = detectSpoilers(text, "en");
  assert(r.ok, `unexpected hits: ${r.hits.join(", ")}`);
});

Deno.test("EN: 'the movie ends with' is flagged", () => {
  const r = detectSpoilers("The film ends with the hero dying alone.", "en");
  assert(!r.ok);
  assert(r.hits.length > 0);
});

Deno.test("EN: 'plot twist:' and 'the killer is' are flagged", () => {
  assert(!detectSpoilers("Plot twist: he was dead all along.", "en").ok);
  assert(!detectSpoilers("It turns out that the mentor is the villain.", "en").ok);
  assert(!detectSpoilers("The killer is his own brother.", "en").ok);
});

Deno.test("KU: clean Kurdish premise passes", () => {
  const text =
    "چیرۆکی دزێکی لێزانە کە بە تەکنەلۆژیای خەون زانیاری کۆمپانیاکان دەدزێت. " +
    "دەرهێنەر: Christopher Nolan. ئەکتەرە سەرەکی: Leonardo DiCaprio.";
  const r = detectSpoilers(text, "ku");
  assert(r.ok, `unexpected hits: ${r.hits.join(", ")}`);
});

Deno.test("KU: 'لە کۆتایی' and 'سپۆیلەر' are flagged", () => {
  assert(!detectSpoilers("لە کۆتاییدا کەسایەتی سەرەکی دەمرێت.", "ku").ok);
  assert(!detectSpoilers("سپۆیلەر: بکوژەکە براکەیەتی.", "ku").ok);
  assert(!detectSpoilers("کۆتایی فیلمەکە زۆر خەمگینە.", "ku").ok);
});

// --- Language purity --------------------------------------------------------

Deno.test("KU purity: pure Sorani with allowed proper names passes", () => {
  const text =
    "چیرۆکێکی جوان لەلایەن Christopher Nolan، بە ئەکتەری Leonardo DiCaprio.";
  const r = checkKurdishPurity(text);
  assert(r.ok, `offending=${r.offendingWords.join(",")} ratio=${r.arabicRatio}`);
});

Deno.test("KU purity: embedded English sentence fails", () => {
  const text = "چیرۆکێکی جوان about a thief who steals dreams every night.";
  const r = checkKurdishPurity(text);
  assert(!r.ok);
  assert(r.offendingWords.length > 0);
});

Deno.test("KU purity: mostly-English text fails on arabicRatio", () => {
  const text = "This is mostly English with only ئەم دوو وشە.";
  const r = checkKurdishPurity(text);
  assert(!r.ok);
});

Deno.test("EN purity: any Arabic-script leakage fails", () => {
  const clean = checkEnglishPurity("A clean English premise about a thief.");
  assert(clean.ok);
  const dirty = checkEnglishPurity("A premise about ئەم فیلمە leaking Kurdish.");
  assert(!dirty.ok);
});

// --- Combined validator -----------------------------------------------------

Deno.test("validateInfoOutput: EN clean passes", () => {
  const text =
    "A skilled thief who leads a team through dream-sharing heists. " +
    "Directed by Christopher Nolan. Worth watching for its inventive premise.";
  const r = validateInfoOutput(text, "en");
  assert(r.ok);
});

Deno.test("validateInfoOutput: EN spoiler fails", () => {
  const text = "A skilled thief. The film ends with him choosing his family.";
  const r = validateInfoOutput(text, "en");
  assert(!r.ok);
  assert(!r.spoilers.ok);
});

Deno.test("validateInfoOutput: KU clean passes", () => {
  const text =
    "چیرۆکی دزێکی زیرەک کە خەون دەدزێت. دەرهێنەر: Christopher Nolan. " +
    "شایانی سەیرکردنە بۆ خەیاڵە ورد و ژیرەکەی.";
  const r = validateInfoOutput(text, "ku");
  assert(r.ok, JSON.stringify(r));
});

Deno.test("validateInfoOutput: KU language mix fails", () => {
  const text = "چیرۆکی دزێک who steals dreams from powerful executives nightly.";
  const r = validateInfoOutput(text, "ku");
  assert(!r.ok);
  assert(!r.language.ok);
});

Deno.test("validateInfoOutput: KU spoiler fails even with pure Kurdish", () => {
  const text =
    "چیرۆکێکی جوان. لە کۆتاییدا کەسایەتی سەرەکی دەمرێت و هەموو شت لەدەست دەدات.";
  const r = validateInfoOutput(text, "ku");
  assert(!r.ok);
  assert(!r.spoilers.ok);
});
