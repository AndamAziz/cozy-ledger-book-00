/**
 * Risk / position-size calculator tuned for gold (XAU/USD) and other
 * commodities. All maths are pure so they can be unit-tested and reused.
 *
 * Conventions (MT5 style):
 *  - 1 standard lot of gold = 100 troy oz (contractSize default).
 *  - 1 "pip" for gold = 0.1 price move.
 *  - With 1 lot, a $1 price move = $100 P/L.
 */

import type { OHLCCandle } from './krakenApi';

export type RiskSide = 'buy' | 'sell';

export interface RiskInput {
  /** Account balance / equity in account currency (USD). */
  balance: number;
  /** Percentage of the balance to risk on this trade (e.g. 1 or 2). */
  riskPct: number;
  /** Planned entry price. */
  entry: number;
  /** Planned stop-loss price. */
  stopLoss: number;
  /** Reward-to-risk ratio for the take-profit (e.g. 2 for 1:2). */
  rr: number;
  /** Trade direction. */
  side: RiskSide;
  /** Units per 1 lot. Gold = 100 oz. */
  contractSize?: number;
  /** Price size of one pip. Gold = 0.1. */
  pipSize?: number;
}

export interface RiskResult {
  /** Money risked if the stop is hit. */
  riskAmount: number;
  /** Absolute price distance between entry and stop. */
  slDistance: number;
  /** Stop distance expressed in pips. */
  slPips: number;
  /** Recommended position size in lots. */
  lots: number;
  /** Recommended position size in raw units (oz). */
  units: number;
  /** Calculated take-profit price for the requested R:R. */
  takeProfit: number;
  /** Price distance from entry to take-profit. */
  tpDistance: number;
  /** Potential profit if the take-profit is hit. */
  rewardAmount: number;
  /** Notional value of the position at entry. */
  positionValue: number;
  /** Whether the stop is placed on the correct side of the entry. */
  valid: boolean;
}

export const GOLD_CONTRACT_SIZE = 100; // oz per lot
export const GOLD_PIP_SIZE = 0.1;

export function calculateRisk(input: RiskInput): RiskResult {
  const contractSize = input.contractSize ?? GOLD_CONTRACT_SIZE;
  const pipSize = input.pipSize ?? GOLD_PIP_SIZE;

  const slDistance = Math.abs(input.entry - input.stopLoss);
  const riskAmount = Math.max(0, input.balance) * (Math.max(0, input.riskPct) / 100);

  // Validity: a BUY stop must be below entry, a SELL stop above entry.
  const valid =
    slDistance > 0 &&
    input.entry > 0 &&
    (input.side === 'buy' ? input.stopLoss < input.entry : input.stopLoss > input.entry);

  const lots = valid && slDistance > 0 ? riskAmount / (slDistance * contractSize) : 0;
  const units = lots * contractSize;

  const tpDistance = slDistance * Math.max(0, input.rr);
  const takeProfit =
    input.side === 'buy' ? input.entry + tpDistance : input.entry - tpDistance;
  const rewardAmount = riskAmount * Math.max(0, input.rr);
  const positionValue = units * input.entry;
  const slPips = pipSize > 0 ? slDistance / pipSize : 0;

  return {
    riskAmount,
    slDistance,
    slPips,
    lots,
    units,
    takeProfit,
    tpDistance,
    rewardAmount,
    positionValue,
    valid,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified ATR-based risk model.
//
// This is the SINGLE source of truth for Entry / Stop Loss / Take Profit across
// the whole platform — the Signals panel, the Confluence tab, the Analyze card,
// and the Telegram bot all derive their levels from `atrLevels()` so the numbers
// are identical everywhere for the same direction, price and ATR.
//
// Model: SL = 1.5 × ATR from entry, TP1 = 1.5R, TP2 = 3R → fixed 1.5 : 1 R/R.
// ─────────────────────────────────────────────────────────────────────────────

/** ATR multiplier used to place the stop loss. */
export const ATR_SL_MULT = 1.5;
/** Reward multiple for the first take-profit (1.5R). */
export const ATR_TP1_R = 1.5;
/** Reward multiple for the second take-profit (3R). */
export const ATR_TP2_R = 3;

export interface AtrLevels {
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  /** Stop distance in price (1.5 × ATR, or a 0.5% fallback when ATR is 0). */
  slDist: number;
  riskReward: number;
}

/** Average True Range (Wilder) over the candle series. */
export function calculateATR(candles: OHLCCandle[], period = 14): number {
  if (!candles || candles.length < period + 1) {
    // fall back to a small range estimate from whatever we have
    if (candles && candles.length >= 2) {
      const trs = [];
      for (let i = 1; i < candles.length; i++) trs.push(candles[i].high - candles[i].low);
      const avg = trs.reduce((a, b) => a + b, 0) / trs.length;
      return Number.isFinite(avg) ? avg : 0;
    }
    return 0;
  }
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) atr = (atr * (period - 1) + trs[i]) / period;
  return Number.isFinite(atr) ? atr : 0;
}

/**
 * Compute the unified ATR-based entry/SL/TP for a direction.
 *
 * @param side    'buy' | 'sell' | 'none' (none → all levels zeroed)
 * @param price   the entry price (last close / live spot)
 * @param atr     ATR for the relevant series (0 → 0.5% fallback distance)
 * @param decimals price decimals for rounding
 */
export function atrLevels(
  side: 'buy' | 'sell' | 'none',
  price: number,
  atr: number,
  decimals: number,
): AtrLevels {
  const dirSign = side === 'buy' ? 1 : side === 'sell' ? -1 : 0;
  const px = price > 0 ? price : 0;
  const slDist = atr > 0 ? atr * ATR_SL_MULT : px * 0.005;
  const entry = +px.toFixed(decimals);
  if (dirSign === 0 || px <= 0) {
    return { entry, stopLoss: 0, takeProfit1: 0, takeProfit2: 0, slDist, riskReward: 0 };
  }
  return {
    entry,
    stopLoss: +(px - dirSign * slDist).toFixed(decimals),
    takeProfit1: +(px + dirSign * slDist * ATR_TP1_R).toFixed(decimals),
    takeProfit2: +(px + dirSign * slDist * ATR_TP2_R).toFixed(decimals),
    slDist,
    riskReward: +(ATR_TP1_R / 1).toFixed(2),
  };
}
