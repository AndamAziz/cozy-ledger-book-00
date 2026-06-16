import { describe, it, expect } from 'vitest';
import { findSwingLevels, buildKeyLevels } from './aiAnalysis';
import { OHLCCandle } from './krakenApi';

/** Build a candle from a high/low (open/close centered). */
function c(high: number, low: number, t = 0): OHLCCandle {
  const mid = (high + low) / 2;
  return { time: t, open: mid, high, low, close: mid, volume: 0 };
}

/** A zig-zag series with obvious swing highs/lows around a baseline. */
function zigzag(base: number, n: number): OHLCCandle[] {
  const out: OHLCCandle[] = [];
  for (let i = 0; i < n; i++) {
    // Peaks at odd indexes, troughs at even indexes.
    const up = i % 2 === 1;
    const amp = 10 + (i % 5); // vary so swings are distinguishable
    out.push(up ? c(base + amp, base + amp - 2, i) : c(base + 2, base - amp, i));
  }
  return out;
}

describe('findSwingLevels — real swing highs/lows', () => {
  it('detects local swing highs and lows from price action', () => {
    // Explicit fractal: index 2 is a clear swing high, index 5 a clear swing low.
    const candles = [
      c(100, 98, 0),
      c(101, 99, 1),
      c(110, 108, 2), // swing high
      c(102, 100, 3),
      c(101, 99, 4),
      c(90, 88, 5), // swing low
      c(95, 93, 6),
      c(96, 94, 7),
    ];
    const { highs, lows } = findSwingLevels(candles, 50, 2);
    expect(highs).toContain(110);
    expect(lows).toContain(88);
  });

  it('returns empty arrays when there is not enough data', () => {
    const { highs, lows } = findSwingLevels([c(1, 0)], 50, 2);
    expect(highs).toEqual([]);
    expect(lows).toEqual([]);
  });
});

describe('buildKeyLevels — derived from swings, split around price', () => {
  const assets: { name: string; base: number }[] = [
    { name: 'gold', base: 3300 },
    { name: 'btc', base: 65000 },
    { name: 'forex', base: 1.1 },
  ];

  for (const { name, base } of assets) {
    it(`produces valid support/resistance for ${name}`, () => {
      const candles = zigzag(base, 60);
      const price = base; // sit price at the baseline
      const levels = buildKeyLevels(candles, price);

      // Resistances strictly above price, supports strictly below.
      for (const r of levels.resistances) expect(r).toBeGreaterThan(price);
      for (const s of levels.supports) expect(s).toBeLessThan(price);

      // At most 3 of each, and the nearest is the closest to price.
      expect(levels.resistances.length).toBeLessThanOrEqual(3);
      expect(levels.supports.length).toBeLessThanOrEqual(3);
      if (levels.resistances.length) {
        expect(levels.nearestResistance).toBe(Math.min(...levels.resistances));
      }
      if (levels.supports.length) {
        expect(levels.nearestSupport).toBe(Math.max(...levels.supports));
      }
    });
  }

  it('handles every chart range (varying candle counts) without crashing', () => {
    for (const n of [5, 10, 20, 30, 50, 100, 274]) {
      const candles = zigzag(3300, n);
      const levels = buildKeyLevels(candles, 3300);
      expect(Array.isArray(levels.supports)).toBe(true);
      expect(Array.isArray(levels.resistances)).toBe(true);
    }
  });

  it('returns empty levels for degenerate input', () => {
    expect(buildKeyLevels([], 100)).toEqual({
      supports: [],
      resistances: [],
      nearestSupport: null,
      nearestResistance: null,
    });
    expect(buildKeyLevels(zigzag(100, 60), 0)).toEqual({
      supports: [],
      resistances: [],
      nearestSupport: null,
      nearestResistance: null,
    });
  });
});
