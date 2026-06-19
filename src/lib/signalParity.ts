/**
 * Cross-engine parity check.
 *
 * Validates that the THREE places a tradeable level is produced for an asset —
 *   1. the Confluence tab   (analyzeAsset → buildTradeSetup)
 *   2. the Signals tab       (buildAssetSignal)
 *   3. the Telegram bot      (market-intel edge function, shared engine port)
 * — all compute the SAME direction and the SAME ATR-based Entry / SL / TP / R:R
 * for the same asset on the canonical timeframe (M15, the bot's base TF).
 *
 * The check is intentionally strict on DIRECTION (must match exactly) and uses a
 * small relative tolerance on the price levels to absorb the unavoidable basis
 * gap between the three independent live data fetches (each runs a few hundred ms
 * apart against the same upstream feeds). A real risk-model divergence produces
 * differences far larger than the tolerance and is flagged immediately.
 */
import { supabase } from '@/integrations/supabase/client';
import { getAssetMeta, fetchAssetAllTF, fetchMacro, fetchEvents } from './signalData';
import { buildAssetSignal, AssetKey, SignalAction } from './signalEngine';
import { analyzeAsset } from './aiAnalysis';
import { OHLCCandle } from './krakenApi';

/** Canonical timeframe — the base TF the Telegram bot computes on. */
export const PARITY_TF = 'M15' as const;

/** Relative tolerance (fraction) on price levels: ≤ pass, ≤ warn, else fail. */
const TOL_PASS = 0.001; // 0.10%
const TOL_WARN = 0.005; // 0.50%

export type ParitySource = 'confluence' | 'signals' | 'telegram';

export interface ParityRow {
  source: ParitySource;
  available: boolean;
  /** Normalised side: 'buy' | 'sell' | 'none' (wait/neutral collapse to none). */
  side: 'buy' | 'sell' | 'none';
  rawAction: string;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
  note?: string;
}

export type ParityStatus = 'pass' | 'warn' | 'fail' | 'pending';

export interface ParityResult {
  asset: AssetKey;
  timeframe: typeof PARITY_TF;
  ts: number;
  rows: ParityRow[];
  status: ParityStatus;
  /** Largest relative difference found across compared price levels. */
  maxRelDiff: number;
  /** Human-readable summary of why the status is what it is. */
  summary: string;
}

const ASSET_TO_BOT_SYMBOL: Partial<Record<AssetKey, string>> = {
  gold: 'XAU/USD',
  btc: 'BTC/USD',
};

function normSide(a: string | null | undefined): 'buy' | 'sell' | 'none' {
  return a === 'buy' ? 'buy' : a === 'sell' ? 'sell' : 'none';
}

function lastClose(candles: OHLCCandle[] | undefined): number {
  if (!candles || !candles.length) return 0;
  return candles[candles.length - 1].close;
}

/** Largest relative difference between a set of numbers (0 when ≤1 value). */
function maxRel(values: number[]): number {
  const v = values.filter((n) => Number.isFinite(n) && n !== 0);
  if (v.length < 2) return 0;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const ref = Math.abs(max) || 1;
  return Math.abs(max - min) / ref;
}

/** Run the full cross-engine parity check for one asset. */
export async function runSignalParity(assetKey: AssetKey): Promise<ParityResult> {
  const ts = Date.now();
  const meta = getAssetMeta(assetKey);
  const botSymbol = ASSET_TO_BOT_SYMBOL[assetKey];

  const rows: ParityRow[] = [];

  // ── Fetch app data once, shared by Signals + Confluence ──
  const [candlesByTF, macro, events] = await Promise.all([
    fetchAssetAllTF(meta),
    fetchMacro(),
    fetchEvents(),
  ]);
  const base = candlesByTF[PARITY_TF] ?? [];
  const price = lastClose(base);

  // ── 1. Signals tab (M15) ──
  try {
    if (!base.length) throw new Error('no M15 candles');
    const sig = buildAssetSignal({
      asset: meta.key,
      label: meta.label,
      decimals: meta.decimals,
      currencies: meta.currencies,
      timeframe: PARITY_TF,
      price,
      candles: base,
      candlesByTF,
      macro,
      events,
    });
    rows.push({
      source: 'signals',
      available: true,
      side: normSide(sig.action),
      rawAction: sig.action,
      entry: sig.entry,
      stopLoss: sig.stopLoss,
      takeProfit1: sig.takeProfit1,
      takeProfit2: sig.takeProfit2,
      riskReward: sig.riskReward,
    });
  } catch (e) {
    rows.push(emptyRow('signals', String(e)));
  }

  // ── 2. Confluence tab ──
  try {
    const analysis = await analyzeAsset(assetKey as 'btc' | 'gold', price);
    const s = analysis.setup;
    rows.push({
      source: 'confluence',
      available: true,
      side: s.side === 'buy' ? 'buy' : s.side === 'sell' ? 'sell' : 'none',
      rawAction: s.side,
      entry: s.entry,
      stopLoss: s.stopLoss,
      takeProfit1: s.takeProfit1,
      takeProfit2: s.takeProfit2,
      riskReward: s.riskReward,
    });
  } catch (e) {
    rows.push(emptyRow('confluence', String(e)));
  }

  // ── 3. Telegram bot (market-intel diagnostic mode) ──
  try {
    if (!botSymbol) throw new Error('asset not tracked by bot');
    const { data, error } = await supabase.functions.invoke('market-intel', {
      body: { analyze: true },
    });
    if (error) throw error;
    const assetsArr: Array<Record<string, unknown>> = Array.isArray(data?.assets) ? data.assets : [];
    const found = assetsArr.find((a) => a.symbol === botSymbol);
    const eng = found?.engine as
      | { action?: string; entry?: number; stopLoss?: number; takeProfit1?: number; takeProfit2?: number; riskReward?: number }
      | null
      | undefined;
    if (!eng) throw new Error('no engine data from bot');
    const action = (found?.botSignal as string) || eng.action || 'neutral';
    rows.push({
      source: 'telegram',
      available: true,
      side: normSide(eng.action),
      rawAction: String(action),
      entry: eng.entry ?? 0,
      stopLoss: eng.stopLoss ?? 0,
      takeProfit1: eng.takeProfit1 ?? 0,
      takeProfit2: eng.takeProfit2 ?? 0,
      riskReward: eng.riskReward ?? 0,
    });
  } catch (e) {
    rows.push(emptyRow('telegram', String(e)));
  }

  // ── Evaluate ──
  const evaluated = evaluateParity(rows);
  return { asset: assetKey, timeframe: PARITY_TF, ts, rows, ...evaluated };
}

function emptyRow(source: ParitySource, note: string): ParityRow {
  return {
    source,
    available: false,
    side: 'none',
    rawAction: '—',
    entry: 0,
    stopLoss: 0,
    takeProfit1: 0,
    takeProfit2: 0,
    riskReward: 0,
    note,
  };
}

function evaluateParity(rows: ParityRow[]): { status: ParityStatus; maxRelDiff: number; summary: string } {
  const ok = rows.filter((r) => r.available);
  if (ok.length < 2) {
    return { status: 'fail', maxRelDiff: 0, summary: 'Not enough engines responded to compare.' };
  }

  // Direction must match exactly across every available engine.
  const sides = new Set(ok.map((r) => r.side));
  if (sides.size > 1) {
    const detail = ok.map((r) => `${label(r.source)}=${r.side.toUpperCase()}`).join(', ');
    return { status: 'fail', maxRelDiff: 1, summary: `Direction mismatch: ${detail}.` };
  }

  // All agree on "no trade" → trivially consistent.
  if ([...sides][0] === 'none') {
    return { status: 'pass', maxRelDiff: 0, summary: 'All engines agree: no active trade (levels zeroed).' };
  }

  // Same direction → compare the price levels.
  const relEntry = maxRel(ok.map((r) => r.entry));
  const relSL = maxRel(ok.map((r) => r.stopLoss));
  const relTP1 = maxRel(ok.map((r) => r.takeProfit1));
  const relTP2 = maxRel(ok.map((r) => r.takeProfit2));
  const maxRelDiff = Math.max(relEntry, relSL, relTP1, relTP2);

  // R:R must be identical (the defining property of "same risk model").
  const rrSet = new Set(ok.map((r) => +r.riskReward.toFixed(2)));
  if (rrSet.size > 1) {
    return {
      status: 'fail',
      maxRelDiff,
      summary: `Risk model mismatch — R:R differs (${[...rrSet].join(' vs ')}).`,
    };
  }

  if (maxRelDiff <= TOL_PASS) {
    return { status: 'pass', maxRelDiff, summary: `All engines match (≤${(TOL_PASS * 100).toFixed(2)}%).` };
  }
  if (maxRelDiff <= TOL_WARN) {
    return {
      status: 'warn',
      maxRelDiff,
      summary: `Levels match within ${(maxRelDiff * 100).toFixed(2)}% (live-price basis gap, model identical).`,
    };
  }
  return {
    status: 'fail',
    maxRelDiff,
    summary: `Levels diverge by ${(maxRelDiff * 100).toFixed(2)}% — exceeds ${(TOL_WARN * 100).toFixed(2)}% tolerance.`,
  };
}

export function label(source: ParitySource): string {
  return source === 'confluence' ? 'Confluence' : source === 'signals' ? 'Signals' : 'Telegram';
}
