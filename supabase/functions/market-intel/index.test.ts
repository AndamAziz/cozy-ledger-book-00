import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  NEWS_MIN_HEADLINE_WORDS,
  NEWS_MIN_SUMMARY_WORDS,
  passesNewsQualityGate,
  wordCount,
} from "./news-quality.ts";

// Helper: build a string with an exact number of words.
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

const goodHeadline = "Gold climbs to a fresh record high above 4000 dollars today";
const goodSummary =
  "Gold prices surged on Thursday as investors piled into safe haven assets " +
  "after renewed geopolitical tension and softer than expected inflation data. " +
  "The metal broke through a key resistance level and analysts now expect further " +
  "gains while the dollar weakens and real yields continue to drift lower across markets.";

Deno.test("wordCount counts words and ignores extra whitespace", () => {
  assertEquals(wordCount(""), 0);
  assertEquals(wordCount("   "), 0);
  assertEquals(wordCount("hello"), 1);
  assertEquals(wordCount("  hello   world  "), 2);
  assertEquals(wordCount(words(40)), 40);
});

Deno.test("wordCount tolerates null/undefined input", () => {
  // deno-lint-ignore no-explicit-any
  assertEquals(wordCount(null as any), 0);
  // deno-lint-ignore no-explicit-any
  assertEquals(wordCount(undefined as any), 0);
});

Deno.test("gate REJECTS a completely empty news card", () => {
  assertFalse(passesNewsQualityGate("", "", ""));
});

Deno.test("gate REJECTS the useless 'MARKETS NEUTRAL' card (no real content)", () => {
  // This is the exact failure the user reported: header + impact, no real news.
  assertFalse(passesNewsQualityGate("MARKETS", "MARKETS", "Market Impact: NEUTRAL"));
});

Deno.test("gate REJECTS a short headline even with a good summary", () => {
  const shortTitle = words(NEWS_MIN_HEADLINE_WORDS - 1);
  assertFalse(passesNewsQualityGate(shortTitle, shortTitle, goodSummary));
});

Deno.test("gate REJECTS a short summary even with a good headline", () => {
  const shortSummary = words(NEWS_MIN_SUMMARY_WORDS - 1);
  assertFalse(passesNewsQualityGate(goodHeadline, goodHeadline, shortSummary));
});

Deno.test("gate ACCEPTS a card meeting both length rules", () => {
  assert(passesNewsQualityGate(goodHeadline, goodHeadline, goodSummary));
});

Deno.test("gate ACCEPTS when ONLY the localized headline is long enough", () => {
  // Raw title is short but the Kurdish/localized headline satisfies the rule.
  const shortRawTitle = "Gold up";
  assert(passesNewsQualityGate(shortRawTitle, goodHeadline, goodSummary));
});

Deno.test("gate uses exact boundary thresholds", () => {
  // Exactly at the minimum on both fields → allowed.
  assert(
    passesNewsQualityGate(
      words(NEWS_MIN_HEADLINE_WORDS),
      words(NEWS_MIN_HEADLINE_WORDS),
      words(NEWS_MIN_SUMMARY_WORDS),
    ),
  );
  // One word below either minimum → blocked.
  assertFalse(
    passesNewsQualityGate(
      words(NEWS_MIN_HEADLINE_WORDS - 1),
      words(NEWS_MIN_HEADLINE_WORDS - 1),
      words(NEWS_MIN_SUMMARY_WORDS),
    ),
  );
  assertFalse(
    passesNewsQualityGate(
      words(NEWS_MIN_HEADLINE_WORDS),
      words(NEWS_MIN_HEADLINE_WORDS),
      words(NEWS_MIN_SUMMARY_WORDS - 1),
    ),
  );
});

Deno.test("batch: only valid cards survive, every empty/thin card is dropped", () => {
  const candidates = [
    { title: "", headline: "", summary: "" }, // empty
    { title: "MARKETS", headline: "MARKETS", summary: "Impact: NEUTRAL" }, // thin
    { title: "Oil dips", headline: "Oil dips", summary: words(60) }, // short headline
    { title: goodHeadline, headline: goodHeadline, summary: words(10) }, // short summary
    { title: goodHeadline, headline: goodHeadline, summary: goodSummary }, // valid
  ];

  const passed = candidates.filter((c) =>
    passesNewsQualityGate(c.title, c.headline, c.summary)
  );

  assertEquals(passed.length, 1);
  // Guarantee no surviving card is empty/thin.
  for (const c of passed) {
    assert(
      wordCount(c.title) >= NEWS_MIN_HEADLINE_WORDS ||
        wordCount(c.headline) >= NEWS_MIN_HEADLINE_WORDS,
    );
    assert(wordCount(c.summary) >= NEWS_MIN_SUMMARY_WORDS);
  }
});
