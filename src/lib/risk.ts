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
