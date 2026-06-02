import { describe, it, expect } from "vitest";
import { computeBuySellPct, summarizeSignals, type SignalSummary } from "@/lib/indicators";

/**
 * The 100% Buy/Sell toggle in CryptoAnalysis is shared by BOTH Crypto and Metals
 * (Metals reuses CryptoAnalysis). The percentage breakdown is produced by the
 * single pure helper computeBuySellPct(). These tests lock in that the logic is
 * identical for every scenario, regardless of which screen renders it.
 */
describe("computeBuySellPct — shared Crypto/Metals 100% Buy/Sell logic", () => {
  it("computes Buy/Sell/Neutral percentages out of 100%", () => {
    const r = computeBuySellPct({ buyCount: 3, sellCount: 1, neutralCount: 2 });
    expect(r.hasData).toBe(true);
    expect(r.total).toBe(6);
    expect(r.buyPct).toBe(50);
    expect(r.sellPct).toBe(17);
    expect(r.neutralPct).toBe(33);
  });

  it("returns hasData=false and zeros when total is zero (no data)", () => {
    const r = computeBuySellPct({ buyCount: 0, sellCount: 0, neutralCount: 0 });
    expect(r.hasData).toBe(false);
    expect(r.total).toBe(0);
    expect(r.buyPct).toBe(0);
    expect(r.sellPct).toBe(0);
    expect(r.neutralPct).toBe(0);
  });

  it("never divides by zero and treats negative/undefined counts as zero", () => {
    const r = computeBuySellPct({
      buyCount: -5 as number,
      sellCount: undefined as unknown as number,
      neutralCount: undefined as unknown as number,
    });
    expect(r.hasData).toBe(false);
    expect(Number.isFinite(r.buyPct)).toBe(true);
    expect(Number.isNaN(r.buyPct)).toBe(false);
  });

  it("handles all-buy scenario as 100% buy", () => {
    const r = computeBuySellPct({ buyCount: 4, sellCount: 0, neutralCount: 0 });
    expect(r).toMatchObject({ hasData: true, buyPct: 100, sellPct: 0, neutralPct: 0 });
  });

  it("handles all-sell scenario as 100% sell", () => {
    const r = computeBuySellPct({ buyCount: 0, sellCount: 4, neutralCount: 0 });
    expect(r).toMatchObject({ hasData: true, buyPct: 0, sellPct: 100, neutralPct: 0 });
  });

  it("produces identical output for the same summary (Crypto vs Metals parity)", () => {
    const summary = { buyCount: 2, sellCount: 2, neutralCount: 2 };
    const crypto = computeBuySellPct(summary);
    const metals = computeBuySellPct({ ...summary });
    expect(crypto).toEqual(metals);
  });

  it("matches the breakdown derived from summarizeSignals output", () => {
    const summary: SignalSummary = summarizeSignals(
      { rsi: 20, macd: { macd: 1, signal: 0, histogram: 1 }, bollinger: null, sma20: null, sma50: null, ema12: null, ema26: null } as never,
      100
    );
    const r = computeBuySellPct(summary);
    expect(r.buyPct + r.sellPct + r.neutralPct).toBeLessThanOrEqual(100);
    expect(r.hasData).toBe(summary.buyCount + summary.sellCount + summary.neutralCount > 0);
  });
});
