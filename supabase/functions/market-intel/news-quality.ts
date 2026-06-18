// Shared news content-quality rules used by both the live function (index.ts)
// and the automated tests (index.test.ts). Keeping these here means the tests
// validate the EXACT same logic that gates real Telegram posts.

// A real news card must have a substantial headline and summary. These limits
// guarantee we never broadcast empty/thin "MARKETS · NEUTRAL" cards.
export const NEWS_MIN_HEADLINE_WORDS = 6;
export const NEWS_MIN_SUMMARY_WORDS = 40;

export function wordCount(s: string): number {
  return String(s || "").trim().split(/\s+/).filter(Boolean).length;
}

// CONTENT-QUALITY GATE: returns true only when a news item is allowed to be sent.
// Requires a real headline (≥ NEWS_MIN_HEADLINE_WORDS words in either the raw
// title OR the localized headline) AND a substantial summary (≥ NEWS_MIN_SUMMARY_WORDS words).
export function passesNewsQualityGate(
  title: string,
  headline: string,
  summary: string,
): boolean {
  const titleOk =
    wordCount(title) >= NEWS_MIN_HEADLINE_WORDS ||
    wordCount(headline) >= NEWS_MIN_HEADLINE_WORDS;
  const summaryOk = wordCount(summary) >= NEWS_MIN_SUMMARY_WORDS;
  return titleOk && summaryOk;
}
