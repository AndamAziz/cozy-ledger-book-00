// Pure logic for the Signals-panel "Result" indicator.
// Extracted so the timeframe weighting + ±0.3 threshold behaviour is unit-testable.

export type Timeframe = 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1';
export type ResultDir = 'up' | 'down' | 'neutral';
export type SignalAction = 'buy' | 'sell' | 'neutral' | 'wait' | string;

export interface MacroInputs {
  /** Fear/Greed value (0-100), null if unavailable. */
  fgVal?: number | null;
  /** VIX value, null if unavailable. */
  vixVal?: number | null;
  /** S&P 500 change (percent/points); negative = falling. null if unavailable. */
  spxVal?: number | null;
  /** DXY change; positive = dollar rising. null if unavailable. */
  dxyVal?: number | null;
  /** US10Y yield change; positive = yields rising. null if unavailable. */
  u10yChg?: number | null;
}

export interface SignalInputs {
  action?: SignalAction;
  /** Confidence 0-100. */
  confidence?: number;
}

/**
 * Observed multi-timeframe price trend (confluence). This is the ACTUAL price
 * action across timeframes, independent of the discrete BUY/SELL/NEUTRAL call.
 *   dir      → 'up' | 'down' | 'neutral'
 *   strength → 0-100 (share of timeframes agreeing on `dir`)
 */
export interface TrendInputs {
  dir?: ResultDir;
  strength?: number;
}

/**
 * Macro score using the +1/-1 system (positive = bullish for gold / BUY).
 *   Fear/Greed < 40        → +1
 *   VIX > 20               → +1, VIX 15-20 → +0.5
 *   S&P falling (< 0)      → +1
 *   DXY rising (> 0)       → -1
 *   US10Y rising (> 0)     → -1
 */
export function computeMacroScore(m: MacroInputs): number {
  let score = 0;
  if (m.fgVal != null && m.fgVal < 40) score += 1;
  if (m.vixVal != null) {
    if (m.vixVal > 20) score += 1;
    else if (m.vixVal >= 15) score += 0.5;
  }
  if (m.spxVal != null && m.spxVal < 0) score += 1;
  if (m.dxyVal != null && m.dxyVal > 0) score -= 1;
  if (m.u10yChg != null && m.u10yChg > 0) score -= 1;
  return score;
}

/**
 * Technical score from the current signal: directional confidence (-1..1).
 *
 *   1. An explicit BUY/SELL call dominates: SELL → negative, BUY → positive,
 *      scaled by confidence.
 *   2. When the call is NEUTRAL/WAIT/missing we DON'T return 0 blindly — that
 *      would let macro theory drive the badge against the real chart. Instead we
 *      fall back to the observed multi-timeframe price trend so a falling market
 *      still produces a negative technical score.
 */
export function computeTechScore(signal?: SignalInputs | null, trend?: TrendInputs | null): number {
  if (signal && (signal.action === 'sell' || signal.action === 'buy')) {
    const sign = signal.action === 'sell' ? -1 : 1;
    return sign * ((signal.confidence ?? 0) / 100);
  }
  // No directional discrete signal → defer to the actual price trend.
  if (trend && (trend.dir === 'up' || trend.dir === 'down')) {
    const sign = trend.dir === 'down' ? -1 : 1;
    return sign * ((trend.strength ?? 0) / 100);
  }
  return 0;
}

/**
 * Macro weight by timeframe. Short TFs lean on technical, long TFs on macro.
 *   M5/M15 → 0.2, M30/H1 → 0.4, H4/D1 → 0.6
 */
export function macroWeightForTimeframe(tf: Timeframe): number {
  if (tf === 'M5' || tf === 'M15') return 0.2;
  if (tf === 'M30' || tf === 'H1') return 0.4;
  return 0.6; // H4, D1
}

/** Map a combined score to a direction using the ±0.3 threshold. */
export function resultDirForScore(score: number): ResultDir {
  if (score > 0.3) return 'up';
  if (score < -0.3) return 'down';
  return 'neutral';
}

/** Minimal shape of a nearest economic event used for the news caution flag. */
export interface NearestEvent {
  country?: string | null;
  impact?: string | null;
}

export interface NewsRiskInputs {
  nearest?: NearestEvent | null;
  /** Minutes until the nearest relevant event (null if none). */
  minutesAway?: number | null;
}

/** Window (minutes) within which a high-impact USD event raises the caution flag. */
export const NEWS_ALERT_WINDOW_MIN = 15;

/**
 * True when a high-impact USD event lands within 15 minutes.
 * Drives the ⚠️ caution flag appended to the Result badge.
 */
export function isHighImpactUsdEventSoon(newsRisk?: NewsRiskInputs | null): boolean {
  const nr = newsRisk;
  if (!nr || !nr.nearest) return false;
  if (nr.minutesAway == null) return false;
  if (nr.minutesAway < 0 || nr.minutesAway > NEWS_ALERT_WINDOW_MIN) return false;
  if (!/high/i.test(nr.nearest.impact ?? '')) return false;
  return /us|usd|united states|dollar/i.test(nr.nearest.country ?? '');
}

export interface ResultComputation {
  macroScore: number;
  techScore: number;
  macroWeight: number;
  techWeight: number;
  resultScore: number;
  resultDir: ResultDir;
}

/** Confidence (%) above which a directional signal overrides the weighted threshold. */
export const HIGH_CONFIDENCE_OVERRIDE = 75;

/**
 * Multi-timeframe trend agreement (%) above which the observed price trend
 * overrides macro. Price action beats safe-haven theory: when the chart is
 * clearly trending one way across timeframes, the badge must follow the chart.
 */
export const STRONG_TREND_OVERRIDE = 70;

/**
 * Full Result computation: weighted combine of macro + technical, then threshold.
 *
 * Override priority (highest first):
 *   1. High-confidence signal — a BUY/SELL call with confidence > 75% forces the
 *      direction (BUY → up, SELL → down) regardless of macro.
 *   2. Strong price trend — when the multi-timeframe trend agrees ≥ 70% in one
 *      direction, the badge follows the chart, not the macro safe-haven model.
 *      This prevents "GOLD UP" while every timeframe is falling.
 *   3. Otherwise the weighted macro + technical formula with the ±0.3 threshold.
 */
export function computeResult(
  tf: Timeframe,
  macro: MacroInputs,
  signal?: SignalInputs | null,
  trend?: TrendInputs | null,
): ResultComputation {
  const macroScore = computeMacroScore(macro);
  const techScore = computeTechScore(signal, trend);
  const macroWeight = macroWeightForTimeframe(tf);
  const techWeight = 1 - macroWeight;
  const resultScore = macroScore * macroWeight + techScore * techWeight;

  const confidence = signal?.confidence ?? 0;
  const action = signal?.action;
  const isDirectional = action === 'buy' || action === 'sell';
  const highConfOverride = isDirectional && confidence > HIGH_CONFIDENCE_OVERRIDE;

  const trendDir = trend?.dir;
  const trendStrong =
    !highConfOverride &&
    (trendDir === 'up' || trendDir === 'down') &&
    (trend?.strength ?? 0) >= STRONG_TREND_OVERRIDE;

  const resultDir: ResultDir = highConfOverride
    ? action === 'sell'
      ? 'down'
      : 'up'
    : trendStrong
      ? (trendDir as ResultDir)
      : resultDirForScore(resultScore);

  return {
    macroScore,
    techScore,
    macroWeight,
    techWeight,
    resultScore,
    resultDir,
  };
}
