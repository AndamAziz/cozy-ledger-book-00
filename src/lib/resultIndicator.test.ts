import { describe, it, expect } from 'vitest';
import {
  computeMacroScore,
  computeTechScore,
  macroWeightForTimeframe,
  resultDirForScore,
  computeResult,
  isHighImpactUsdEventSoon,
  NEWS_ALERT_WINDOW_MIN,
  type Timeframe,
} from './resultIndicator';

describe('computeMacroScore', () => {
  it('returns 0 when all inputs are null/unavailable', () => {
    expect(computeMacroScore({})).toBe(0);
    expect(
      computeMacroScore({ fgVal: null, vixVal: null, spxVal: null, dxyVal: null, u10yChg: null }),
    ).toBe(0);
  });

  it('adds +1 for Fear/Greed below 40', () => {
    expect(computeMacroScore({ fgVal: 39 })).toBe(1);
    expect(computeMacroScore({ fgVal: 40 })).toBe(0); // boundary: not < 40
    expect(computeMacroScore({ fgVal: 41 })).toBe(0);
  });

  it('scores VIX: >20 → +1, 15-20 → +0.5, <15 → 0', () => {
    expect(computeMacroScore({ vixVal: 21 })).toBe(1);
    expect(computeMacroScore({ vixVal: 20 })).toBe(0.5); // boundary: not > 20, but >= 15
    expect(computeMacroScore({ vixVal: 15 })).toBe(0.5); // boundary inclusive
    expect(computeMacroScore({ vixVal: 14.9 })).toBe(0);
  });

  it('adds +1 when S&P is falling (< 0)', () => {
    expect(computeMacroScore({ spxVal: -0.5 })).toBe(1);
    expect(computeMacroScore({ spxVal: 0 })).toBe(0);
    expect(computeMacroScore({ spxVal: 0.5 })).toBe(0);
  });

  it('subtracts 1 when DXY is rising (> 0)', () => {
    expect(computeMacroScore({ dxyVal: 0.2 })).toBe(-1);
    expect(computeMacroScore({ dxyVal: 0 })).toBe(0);
    expect(computeMacroScore({ dxyVal: -0.2 })).toBe(0);
  });

  it('subtracts 1 when US10Y yields are rising (> 0)', () => {
    expect(computeMacroScore({ u10yChg: 0.05 })).toBe(-1);
    expect(computeMacroScore({ u10yChg: 0 })).toBe(0);
    expect(computeMacroScore({ u10yChg: -0.05 })).toBe(0);
  });

  it('combines all bullish indicators', () => {
    // F&G<40 (+1) + VIX>20 (+1) + S&P falling (+1) = 3
    expect(computeMacroScore({ fgVal: 20, vixVal: 30, spxVal: -1 })).toBe(3);
  });

  it('combines all bearish indicators', () => {
    // DXY rising (-1) + US10Y rising (-1) = -2
    expect(computeMacroScore({ dxyVal: 0.5, u10yChg: 0.1 })).toBe(-2);
  });
});

describe('computeTechScore', () => {
  it('returns 0 when signal is missing', () => {
    expect(computeTechScore(null)).toBe(0);
    expect(computeTechScore(undefined)).toBe(0);
  });

  it('returns negative score for SELL scaled by confidence', () => {
    expect(computeTechScore({ action: 'sell', confidence: 85 })).toBeCloseTo(-0.85);
    expect(computeTechScore({ action: 'sell', confidence: 50 })).toBeCloseTo(-0.5);
  });

  it('returns positive score for BUY scaled by confidence', () => {
    expect(computeTechScore({ action: 'buy', confidence: 70 })).toBeCloseTo(0.7);
  });

  it('returns 0 for NEUTRAL/WAIT regardless of confidence', () => {
    expect(computeTechScore({ action: 'neutral', confidence: 90 })).toBe(0);
    expect(computeTechScore({ action: 'wait', confidence: 90 })).toBe(0);
  });

  it('treats missing confidence as 0', () => {
    expect(computeTechScore({ action: 'buy' })).toBe(0);
  });
});

describe('macroWeightForTimeframe', () => {
  it('weights short timeframes toward technical (0.2 macro)', () => {
    expect(macroWeightForTimeframe('M5')).toBe(0.2);
    expect(macroWeightForTimeframe('M15')).toBe(0.2);
  });

  it('weights mid timeframes evenly-ish (0.4 macro)', () => {
    expect(macroWeightForTimeframe('M30')).toBe(0.4);
    expect(macroWeightForTimeframe('H1')).toBe(0.4);
  });

  it('weights long timeframes toward macro (0.6 macro)', () => {
    expect(macroWeightForTimeframe('H4')).toBe(0.6);
    expect(macroWeightForTimeframe('D1')).toBe(0.6);
  });
});

describe('resultDirForScore (±0.3 threshold)', () => {
  it('is up when score > 0.3', () => {
    expect(resultDirForScore(0.31)).toBe('up');
    expect(resultDirForScore(1)).toBe('up');
  });

  it('is down when score < -0.3', () => {
    expect(resultDirForScore(-0.31)).toBe('down');
    expect(resultDirForScore(-1)).toBe('down');
  });

  it('is neutral within the ±0.3 band (inclusive boundaries)', () => {
    expect(resultDirForScore(0.3)).toBe('neutral'); // not > 0.3
    expect(resultDirForScore(-0.3)).toBe('neutral'); // not < -0.3
    expect(resultDirForScore(0)).toBe('neutral');
    expect(resultDirForScore(0.29)).toBe('neutral');
    expect(resultDirForScore(-0.29)).toBe('neutral');
  });
});

describe('computeResult — timeframe weighting', () => {
  const buy = { action: 'buy' as const, confidence: 70 }; // techScore = 0.7 (≤75, no override)
  const macroBearish = { dxyVal: 0.5, u10yChg: 0.1 }; // macroScore = -2

  it('applies correct macro/tech weights per timeframe', () => {
    const m5 = computeResult('M5', macroBearish, buy);
    expect(m5.macroWeight).toBe(0.2);
    expect(m5.techWeight).toBeCloseTo(0.8);
    // -2*0.2 + 0.7*0.8 = -0.4 + 0.56 = 0.16
    expect(m5.resultScore).toBeCloseTo(0.16);

    const d1 = computeResult('D1', macroBearish, buy);
    expect(d1.macroWeight).toBe(0.6);
    expect(d1.techWeight).toBeCloseTo(0.4);
    // -2*0.6 + 0.7*0.4 = -1.2 + 0.28 = -0.92
    expect(d1.resultScore).toBeCloseTo(-0.92);
  });

  it('same inputs produce different directions across timeframes (formula range)', () => {
    // Short TF leans technical (BUY) → up; long TF leans macro (bearish) → down.
    const macro1 = { dxyVal: 0.5 }; // macroScore = -1
    const buy70 = { action: 'buy' as const, confidence: 70 }; // techScore = 0.7
    // M5: -1*0.2 + 0.7*0.8 = -0.2 + 0.56 = 0.36 → up
    expect(computeResult('M5', macro1, buy70).resultDir).toBe('up');
    // D1: -1*0.6 + 0.7*0.4 = -0.6 + 0.28 = -0.32 → down
    expect(computeResult('D1', macro1, buy70).resultDir).toBe('down');
  });

  it('M30/H1 produce mid-weighted results', () => {
    const h1 = computeResult('H1', macroBearish, buy);
    // -2*0.4 + 0.7*0.6 = -0.8 + 0.42 = -0.38 → < -0.3 → down
    expect(h1.resultScore).toBeCloseTo(-0.38);
    expect(h1.resultDir).toBe('down');
  });
});

describe('computeResult — threshold behaviour end-to-end', () => {
  it('strong SELL on short timeframe → GOLD DOWN', () => {
    const r = computeResult('M5', {}, { action: 'sell', confidence: 85 });
    // 0*0.2 + (-0.85)*0.8 = -0.68 → down
    expect(r.resultScore).toBeCloseTo(-0.68);
    expect(r.resultDir).toBe('down');
  });

  it('strong BUY on short timeframe → GOLD UP', () => {
    const r = computeResult('M15', {}, { action: 'buy', confidence: 85 });
    expect(r.resultScore).toBeCloseTo(0.68);
    expect(r.resultDir).toBe('up');
  });

  it('weak signal stays NEUTRAL within band', () => {
    // macroScore 0, BUY confidence 30 → tech 0.3 * 0.8 = 0.24 → neutral
    const r = computeResult('M5', {}, { action: 'buy', confidence: 30 });
    expect(r.resultDir).toBe('neutral');
  });

  it('bullish macro on long timeframe drives GOLD UP even with neutral signal', () => {
    // macroScore 3 * 0.6 = 1.8 → up
    const r = computeResult('D1', { fgVal: 20, vixVal: 30, spxVal: -1 }, { action: 'neutral', confidence: 0 });
    expect(r.macroScore).toBe(3);
    expect(r.resultScore).toBeCloseTo(1.8);
    expect(r.resultDir).toBe('up');
  });

  it('handles missing signal and empty macro as neutral', () => {
    const tfs: Timeframe[] = ['M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
    for (const tf of tfs) {
      const r = computeResult(tf, {}, null);
      expect(r.resultScore).toBe(0);
      expect(r.resultDir).toBe('neutral');
    }
  });

  describe('high-confidence override (>75%)', () => {
    it('SELL >75% confidence → down on H4/D1 regardless of bullish macro', () => {
      const bullishMacro = { fgVal: 20, vixVal: 30, spxVal: -1 }; // macro = +3 (bullish)
      const sell82 = { action: 'sell', confidence: 82 };
      expect(computeResult('H4', bullishMacro, sell82).resultDir).toBe('down');
      expect(computeResult('D1', bullishMacro, sell82).resultDir).toBe('down');
    });

    it('BUY >75% confidence → up regardless of bearish macro', () => {
      const bearishMacro = { dxyVal: 1, u10yChg: 1 }; // macro = -2 (bearish)
      const buy80 = { action: 'buy', confidence: 80 };
      expect(computeResult('H4', bearishMacro, buy80).resultDir).toBe('up');
      expect(computeResult('D1', bearishMacro, buy80).resultDir).toBe('up');
      expect(computeResult('M5', bearishMacro, buy80).resultDir).toBe('up');
    });

    it('exactly 75% confidence does NOT override (uses weighted formula)', () => {
      const bullishMacro = { fgVal: 20, vixVal: 30, spxVal: -1 }; // macro = +3
      const sell75 = { action: 'sell', confidence: 75 };
      // D1: macro 3*0.6 + tech -0.75*0.4 = 1.8 - 0.3 = 1.5 → up (no override)
      expect(computeResult('D1', bullishMacro, sell75).resultDir).toBe('up');
    });

    it('60-75% confidence uses the weighted formula', () => {
      const neutralMacro = {};
      // D1 SELL at 67%: tech -0.67 * 0.4 = -0.268 → within ±0.3 → neutral
      expect(computeResult('D1', neutralMacro, { action: 'sell', confidence: 67 }).resultDir).toBe('neutral');
    });

    it('does not override NEUTRAL even at high confidence', () => {
      const r = computeResult('D1', {}, { action: 'neutral', confidence: 90 });
      expect(r.resultDir).toBe('neutral');
    });
  });
});
