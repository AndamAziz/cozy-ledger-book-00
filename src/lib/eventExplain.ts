// Shared "beat/miss → gold impact" logic for economic calendar events.
// Mirrors the wording used by "Today's News Bias" so the calendar card reads
// consistently. Display-only helper — does NOT feed the primary signal engine.

export interface CalendarEventLike {
  title: string;
  country: string;
  impact: string;
  date: string;
  forecast: string;
  previous: string;
  actual: string;
}

// Indicators where a HIGHER value means a WEAKER economy/USD (inverse logic).
const INVERSE_KEYWORDS = ['unemployment', 'jobless', 'claims', 'misery', 'deficit', 'inventories'];

export function parseNum(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/,/g, '').replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** True once the event has released an actual figure. */
export function hasReleased(ev: CalendarEventLike): boolean {
  return parseNum(ev.actual) !== null;
}

export interface EventExplanation {
  /** true = stronger-than-expected USD reading, false = weaker, null = in line. */
  usdUp: boolean | null;
  /** true = bullish gold, false = bearish gold, null = neutral. */
  goldUp: boolean | null;
  /** Whether the comparison was made against forecast (true) or previous (false). */
  vsForecast: boolean;
  en: string;
  ku: string;
}

/**
 * Build a one-line beat/miss explanation for a released event.
 * Returns null when no actual figure is available or the comparison is undecidable.
 * Example (en): "Weaker than forecast → bearish for USD, bullish for Gold"
 */
export function explainEventResult(ev: CalendarEventLike): EventExplanation | null {
  const actual = parseNum(ev.actual);
  if (actual === null) return null;

  const fcst = parseNum(ev.forecast);
  const prev = parseNum(ev.previous);
  const vsForecast = fcst !== null;
  const ref = fcst !== null ? fcst : prev;
  if (ref === null) return null;

  const inverse = INVERSE_KEYWORDS.some((k) => ev.title.toLowerCase().includes(k));

  let usdUp: boolean | null;
  if (actual === ref) {
    usdUp = null;
  } else {
    const hotter = actual > ref;
    usdUp = inverse ? !hotter : hotter;
  }
  const goldUp = usdUp === null ? null : !usdUp;

  const refWordEn = vsForecast ? 'forecast' : 'previous';
  const refWordKu = vsForecast ? 'پێشبینی' : 'پێشتر';

  let en: string;
  let ku: string;
  if (usdUp === null) {
    en = `In line with ${refWordEn} → neutral for USD and Gold`;
    ku = `وەک ${refWordKu} → بێلایەن بۆ دۆلار و زێڕ`;
  } else if (usdUp) {
    en = `Stronger than ${refWordEn} → bullish for USD, bearish for Gold`;
    ku = `بەهێزتر لە ${refWordKu} → بەرزبوونەوەی دۆلار، دابەزینی زێڕ`;
  } else {
    en = `Weaker than ${refWordEn} → bearish for USD, bullish for Gold`;
    ku = `لاوازتر لە ${refWordKu} → دابەزینی دۆلار، بەرزبوونەوەی زێڕ`;
  }

  return { usdUp, goldUp, vsForecast, en, ku };
}
