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
 *   SELL → negative, BUY → positive, NEUTRAL/WAIT/missing → 0.
 */
export function computeTechScore(signal?: SignalInputs | null): number {
  if (!signal) return 0;
  const sign = signal.action === 'sell' ? -1 : signal.action === 'buy' ? 1 : 0;
  return sign * ((signal.confidence ?? 0) / 100);
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

export interface ResultComputation {
  macroScore: number;
  techScore: number;
  macroWeight: number;
  techWeight: number;
  resultScore: number;
  resultDir: ResultDir;
}

/** Full Result computation: weighted combine of macro + technical, then threshold. */
export function computeResult(
  tf: Timeframe,
  macro: MacroInputs,
  signal?: SignalInputs | null,
): ResultComputation {
  const macroScore = computeMacroScore(macro);
  const techScore = computeTechScore(signal);
  const macroWeight = macroWeightForTimeframe(tf);
  const techWeight = 1 - macroWeight;
  const resultScore = macroScore * macroWeight + techScore * techWeight;
  return {
    macroScore,
    techScore,
    macroWeight,
    techWeight,
    resultScore,
    resultDir: resultDirForScore(resultScore),
  };
}
