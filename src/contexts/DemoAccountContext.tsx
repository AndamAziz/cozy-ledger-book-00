import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/hooks/use-toast';

export const DEMO_STARTING_BALANCE = 5000;
/** Demo trading leverage (e.g. 100x). Used for margin + max-size guards. */
export const DEMO_LEVERAGE = 100;

export type PositionSide = 'buy' | 'sell';

/** localStorage key used to persist ALL open positions across refreshes. */
const POSITIONS_KEY = 'demo_open_positions';
/** Legacy key (single position) kept only for one-time migration. */
const LEGACY_POSITION_KEY = 'demo_open_position';
/** localStorage key used to persist the closed-trade journal. */
const JOURNAL_KEY = 'demo_trade_journal';
/** Maximum journal entries kept (newest first). */
const JOURNAL_LIMIT = 200;

/** How a closed trade was settled. */
export type CloseReason = 'manual' | 'tp' | 'sl';

/**
 * One CLOSED trade recorded in the journal / trade history (MT5 style).
 * Stored newest-first so the history table reads top-to-bottom.
 */
export interface TradeRecord {
  id: string;
  symbol: string;
  label: string;
  side: PositionSide;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  pnl: number;
  openedAt: number; // epoch seconds
  closedAt: number; // epoch seconds
  reason: CloseReason;
}

/**
 * A single individual fill (one Buy or one Sell press) at its OWN price.
 * Every press records a fill so the chart can show each trade separately,
 * each with its own live profit / loss, instead of one averaged blob.
 */
export interface Fill {
  /** Unique id for the fill. */
  id: string;
  /** The exact price this individual trade was opened at. */
  entryPrice: number;
  /** Quantity of this individual trade. */
  qty: number;
  /** Epoch SECONDS when this individual trade was opened. */
  entryTime: number;
}

/**
 * A single directional leg of a position (the buy side OR the sell side).
 * Each leg stacks independently with its own averaged entry, size and exits.
 */
export interface PositionLeg {
  /** Weighted-average entry price across stacked adds. */
  entryPrice: number;
  /** Total accumulated quantity. */
  qty: number;
  /** Take-profit trigger price (auto-closes in profit) or null. */
  takeProfit: number | null;
  /** Stop-loss trigger price (auto-closes in loss) or null. */
  stopLoss: number | null;
  /** Epoch SECONDS when the leg was first opened (used to mark the chart). */
  entryTime: number;
  /** Every individual trade that makes up this leg (one per Buy/Sell press). */
  fills: Fill[];
}

/** Generate a reasonably unique id for a fill. */
const newFillId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Ensure a leg always carries a fills array (back-compat for old saves). */
const normalizeLeg = (leg: PositionLeg | null): PositionLeg | null => {
  if (!leg || leg.qty <= 0) return leg;
  if (Array.isArray(leg.fills) && leg.fills.length > 0) return leg;
  return {
    ...leg,
    fills: [{ id: newFillId(), entryPrice: leg.entryPrice, qty: leg.qty, entryTime: leg.entryTime }],
  };
};

/**
 * The open position for ONE asset. It can hold a buy leg AND a sell leg at the
 * SAME time (hedge mode) so the user may be long and short simultaneously.
 * Positions for MANY assets can be open at once — the user is free to trade
 * crypto and metals together. Each lives until its leg is closed manually or a
 * TP/SL level is hit.
 */
export interface OpenPosition {
  /** Unique asset key (crypto pair or metal name) the position belongs to. */
  symbol: string;
  /** Human-readable label shown in banners (e.g. "BTC/USD", "Gold"). */
  label: string;
  /** Last known live price of the asset (used for live P/L). */
  currentPrice: number;
  /** The long (buy) leg, or null. */
  buy: PositionLeg | null;
  /** The short (sell) leg, or null. */
  sell: PositionLeg | null;
}

/** True when the position carries at least one open leg. */
const hasOpenLeg = (p: OpenPosition | null): p is OpenPosition =>
  !!p && ((p.buy?.qty ?? 0) > 0 || (p.sell?.qty ?? 0) > 0);

interface DemoAccountValue {
  balance: number;
  loading: boolean;
  /** True when a persisted account is available (user signed in). */
  ready: boolean;
  /** All open positions (one per asset), each may carry a buy and/or sell leg. */
  positions: OpenPosition[];
  /** Get the open position for a specific asset, or null. */
  getPosition: (symbol: string) => OpenPosition | null;
  /** Cumulative realized P/L from all closed trades. */
  realizedPnl: number;
  /** Closed-trade history (newest first), persisted locally. */
  journal: TradeRecord[];
  /** Clear the entire trade journal. */
  clearJournal: () => void;
  /** Open a new leg or stack onto an existing one on the same asset+side. */
  openOrAdd: (args: { symbol: string; label: string; side: PositionSide; price: number; amount: number }) => void;
  /** Update the live price for one asset; triggers TP/SL for that asset. */
  updatePrice: (symbol: string, price: number) => void;
  /** Set / clear the take-profit and stop-loss levels of one leg of one asset. */
  setTpSl: (symbol: string, side: PositionSide, takeProfit: number | null, stopLoss: number | null) => void;
  /** Close one leg of one asset at the latest price and realise its P/L. */
  closePosition: (symbol: string, side: PositionSide) => void;
  /** Apply a realised profit (positive) or loss (negative) to the balance. */
  applyPnl: (delta: number) => void;
  /** Reset the balance back to the starting amount. */
  renew: () => void;
}

const DemoAccountContext = createContext<DemoAccountValue | null>(null);

const fmtUsd = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Restore + migrate any saved positions into the multi-asset array shape. */
const loadPositions = (): OpenPosition[] => {
  try {
    const rawArr = localStorage.getItem(POSITIONS_KEY);
    if (rawArr) {
      const parsed = JSON.parse(rawArr);
      if (Array.isArray(parsed)) {
        return parsed
          .map((pos: OpenPosition) => ({ ...pos, buy: normalizeLeg(pos.buy), sell: normalizeLeg(pos.sell) }))
          .filter(hasOpenLeg);
      }
    }
    // One-time migration from the previous single-position key.
    const rawOld = localStorage.getItem(LEGACY_POSITION_KEY);
    if (rawOld) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed: any = JSON.parse(rawOld);
      localStorage.removeItem(LEGACY_POSITION_KEY);
      if (!parsed) return [];
      if (parsed.side && !('buy' in parsed)) {
        const entryTime = parsed.entryTime ?? Math.floor(Date.now() / 1000);
        const leg: PositionLeg = {
          entryPrice: parsed.entryPrice ?? 0,
          qty: parsed.qty ?? 0,
          takeProfit: parsed.takeProfit ?? null,
          stopLoss: parsed.stopLoss ?? null,
          entryTime,
          fills: [{ id: newFillId(), entryPrice: parsed.entryPrice ?? 0, qty: parsed.qty ?? 0, entryTime }],
        };
        const migrated: OpenPosition = {
          symbol: parsed.symbol,
          label: parsed.label,
          currentPrice: parsed.currentPrice ?? leg.entryPrice,
          buy: parsed.side === 'buy' ? leg : null,
          sell: parsed.side === 'sell' ? leg : null,
        };
        return hasOpenLeg(migrated) ? [migrated] : [];
      }
      const pos = parsed as OpenPosition;
      const migrated = { ...pos, buy: normalizeLeg(pos.buy), sell: normalizeLeg(pos.sell) };
      return hasOpenLeg(migrated) ? [migrated] : [];
    }
  } catch {
    /* ignore */
  }
  return [];
};

export function DemoAccountProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);

  const [balance, setBalance] = useState(DEMO_STARTING_BALANCE);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [realizedPnl, setRealizedPnl] = useState(0);
  // Closed-trade journal, restored from localStorage (newest first).
  const [journal, setJournal] = useState<TradeRecord[]>(() => {
    try {
      const raw = localStorage.getItem(JOURNAL_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Persist the journal whenever it changes.
  useEffect(() => {
    try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal)); } catch { /* ignore */ }
  }, [journal]);

  const clearJournal = useCallback(() => setJournal([]), []);

  // All open positions (one entry per asset), restored from localStorage.
  const [positions, setPositions] = useState<OpenPosition[]>(loadPositions);

  // Keep open positions in localStorage so they survive a refresh / re-open.
  useEffect(() => {
    try {
      const open = positions.filter(hasOpenLeg);
      if (open.length > 0) {
        localStorage.setItem(POSITIONS_KEY, JSON.stringify(open));
      } else {
        localStorage.removeItem(POSITIONS_KEY);
      }
    } catch { /* ignore storage errors */ }
  }, [positions]);

  // Persist realized PnL to the database whenever it changes.
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('demo_accounts')
      .update({ realized_pnl: realizedPnl })
      .eq('user_id', userId)
      .then(() => { /* fire and forget */ });
  }, [realizedPnl, userId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data } = await supabase
        .from('demo_accounts')
        .select('balance, realized_pnl')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!active) return;

      if (data) {
        setBalance(Number(data.balance));
        setRealizedPnl(Number(data.realized_pnl ?? 0));
      } else {
        await supabase.from('demo_accounts').insert({
          user_id: user.id,
          balance: DEMO_STARTING_BALANCE,
          starting_balance: DEMO_STARTING_BALANCE,
          realized_pnl: 0,
        });
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const persist = useCallback((next: number) => {
    if (!userId) return;
    supabase
      .from('demo_accounts')
      .update({ balance: next, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .then(() => { /* fire and forget */ });
  }, [userId]);

  const applyPnl = useCallback((delta: number) => {
    setBalance((prev) => {
      const next = Math.max(0, +(prev + delta).toFixed(2));
      persist(next);
      return next;
    });
  }, [persist]);

  const renew = useCallback(() => {
    setBalance(DEMO_STARTING_BALANCE);
    persist(DEMO_STARTING_BALANCE);
    try { localStorage.removeItem('chart_show_trade_details'); } catch {}
  }, [persist]);

  // Realise a closed leg into the balance, record it in the journal + announce
  // it. Deferred so it never runs inside a setState updater.
  const settle = useCallback((
    side: PositionSide,
    entry: number,
    qty: number,
    exit: number,
    reason: CloseReason,
    meta: { symbol: string; label: string; openedAt: number },
  ) => {
    const diff = side === 'buy' ? exit - entry : entry - exit;
    const pnlValue = diff * qty;
    const profit = pnlValue >= 0;
    const record: TradeRecord = {
      id: newFillId(),
      symbol: meta.symbol,
      label: meta.label,
      side,
      entryPrice: entry,
      exitPrice: exit,
      qty,
      pnl: +pnlValue.toFixed(2),
      openedAt: meta.openedAt,
      closedAt: Math.floor(Date.now() / 1000),
      reason,
    };
    queueMicrotask(() => {
      applyPnl(pnlValue);
      setRealizedPnl(prev => +(prev + pnlValue).toFixed(2));
      setJournal(prev => [record, ...prev].slice(0, JOURNAL_LIMIT));
      const head = reason === 'tp'
        ? bi('بەرزبوونەوەی قازانج 🎯', 'Take Profit hit 🎯')
        : reason === 'sl'
          ? bi('ڕاگرتنی زیان 🛑', 'Stop Loss hit 🛑')
          : profit ? bi('قازانج 🎉', 'Profit 🎉') : bi('زیان', 'Loss');
      toast({
        title: head,
        description: `${profit ? '+' : '−'}$${fmtUsd(Math.abs(pnlValue))}`,
      });
    });
  }, [applyPnl, language]);

  const getPosition = useCallback(
    (symbol: string) => positions.find((p) => p.symbol === symbol) ?? null,
    [positions],
  );

  const openOrAdd = useCallback(({ symbol, label, side, price, amount }: { symbol: string; label: string; side: PositionSide; price: number; amount: number }) => {
    if (price <= 0 || amount <= 0) return;
    setPositions((prev) => {
      const existing = prev.find((p) => p.symbol === symbol) ?? null;
      const base: OpenPosition = existing ?? { symbol, label, currentPrice: price, buy: null, sell: null };

      const now = Math.floor(Date.now() / 1000);
      const fill: Fill = { id: newFillId(), entryPrice: price, qty: amount, entryTime: now };
      const leg = normalizeLeg(base[side]);
      const nextLeg: PositionLeg = leg && leg.qty > 0
        ? (() => {
            const newQty = +(leg.qty + amount).toFixed(6);
            const newEntry = ((leg.entryPrice * leg.qty) + price * amount) / newQty;
            // Keep the averaged entry for settlement, but record THIS trade
            // as its own fill so the chart shows it separately.
            return { ...leg, entryPrice: newEntry, qty: newQty, fills: [...leg.fills, fill] };
          })()
        : { entryPrice: price, qty: amount, takeProfit: null, stopLoss: null, entryTime: now, fills: [fill] };

      const updated: OpenPosition = { ...base, label, currentPrice: price, [side]: nextLeg };
      return existing
        ? prev.map((p) => (p.symbol === symbol ? updated : p))
        : [...prev, updated];
    });
  }, []);

  const updatePrice = useCallback((symbol: string, price: number) => {
    if (!price || price <= 0) return;
    setPositions((prev) => {
      const idx = prev.findIndex((p) => p.symbol === symbol);
      if (idx === -1) return prev;
      const cur = prev[idx];

      let buy = cur.buy;
      let sell = cur.sell;

      if (buy && buy.qty > 0) {
        const hitTp = buy.takeProfit != null && price >= buy.takeProfit;
        const hitSl = buy.stopLoss != null && price <= buy.stopLoss;
        if (hitTp || hitSl) {
          settle('buy', buy.entryPrice, buy.qty, hitTp ? buy.takeProfit! : buy.stopLoss!, hitTp ? 'tp' : 'sl', { symbol: cur.symbol, label: cur.label, openedAt: buy.entryTime });
          buy = null;
        }
      }
      if (sell && sell.qty > 0) {
        const hitTp = sell.takeProfit != null && price <= sell.takeProfit;
        const hitSl = sell.stopLoss != null && price >= sell.stopLoss;
        if (hitTp || hitSl) {
          settle('sell', sell.entryPrice, sell.qty, hitTp ? sell.takeProfit! : sell.stopLoss!, hitTp ? 'tp' : 'sl', { symbol: cur.symbol, label: cur.label, openedAt: sell.entryTime });
          sell = null;
        }
      }

      const nextPos = { ...cur, buy, sell, currentPrice: price };
      if (buy === cur.buy && sell === cur.sell && cur.currentPrice === price) return prev;
      if (!hasOpenLeg(nextPos)) return prev.filter((p) => p.symbol !== symbol);
      return prev.map((p) => (p.symbol === symbol ? nextPos : p));
    });
  }, [settle]);

  const setTpSl = useCallback((symbol: string, side: PositionSide, takeProfit: number | null, stopLoss: number | null) => {
    setPositions((prev) => prev.map((p) => {
      if (p.symbol !== symbol || !p[side]) return p;
      return { ...p, [side]: { ...p[side]!, takeProfit, stopLoss } };
    }));
  }, []);

  const closePosition = useCallback((symbol: string, side: PositionSide) => {
    setPositions((prev) => {
      const cur = prev.find((p) => p.symbol === symbol);
      if (!cur || !cur[side] || cur[side]!.qty <= 0) return prev;
      const leg = cur[side]!;
      const exit = cur.currentPrice > 0 ? cur.currentPrice : leg.entryPrice;
      settle(side, leg.entryPrice, leg.qty, exit, 'manual', { symbol: cur.symbol, label: cur.label, openedAt: leg.entryTime });
      const nextPos = { ...cur, [side]: null };
      return hasOpenLeg(nextPos)
        ? prev.map((p) => (p.symbol === symbol ? nextPos : p))
        : prev.filter((p) => p.symbol !== symbol);
    });
  }, [settle]);

  return (
    <DemoAccountContext.Provider value={{ balance, loading, ready: !!userId, positions, getPosition, realizedPnl, journal, clearJournal, openOrAdd, updatePrice, setTpSl, closePosition, applyPnl, renew }}>
      {children}
    </DemoAccountContext.Provider>
  );
}

export function useDemoAccount(): DemoAccountValue {
  const ctx = useContext(DemoAccountContext);
  if (!ctx) {
    // Safe no-op fallback when used outside a provider.
    return {
      balance: DEMO_STARTING_BALANCE,
      loading: false,
      ready: false,
      positions: [],
      getPosition: () => null,
      realizedPnl: 0,
      journal: [],
      clearJournal: () => {},
      openOrAdd: () => {},
      updatePrice: () => {},
      setTpSl: () => {},
      closePosition: () => {},
      applyPnl: () => {},
      renew: () => {},
    };
  }
  return ctx;
}
