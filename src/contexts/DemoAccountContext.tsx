import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/hooks/use-toast';

export const DEMO_STARTING_BALANCE = 200;

export type PositionSide = 'buy' | 'sell';

/** localStorage key used to persist the open position across refreshes. */
const POSITION_KEY = 'demo_open_position';
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
 * It lives at the page level so it PERSISTS while the user navigates between
 * Crypto / Forex / Metals tabs — it only closes when the user closes a leg
 * manually or a TP/SL level is hit.
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
  /** The open position (may carry both a buy and a sell leg), or null. */
  position: OpenPosition | null;
  /** Cumulative realized P/L from all closed trades. */
  realizedPnl: number;
  /** Open a new leg or stack onto an existing one on the same asset+side. */
  openOrAdd: (args: { symbol: string; label: string; side: PositionSide; price: number; amount: number }) => void;
  /** Update the live price for the asset that owns the position; triggers TP/SL. */
  updatePrice: (symbol: string, price: number) => void;
  /** Set / clear the take-profit and stop-loss levels of one leg. */
  setTpSl: (side: PositionSide, takeProfit: number | null, stopLoss: number | null) => void;
  /** Close one leg at the latest price and realise its P/L. */
  closePosition: (side: PositionSide) => void;
  /** Apply a realised profit (positive) or loss (negative) to the balance. */
  applyPnl: (delta: number) => void;
  /** Reset the balance back to the starting amount. */
  renew: () => void;
}

const DemoAccountContext = createContext<DemoAccountValue | null>(null);

const fmtUsd = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DemoAccountProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' ? en : ku);

  const [balance, setBalance] = useState(DEMO_STARTING_BALANCE);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [realizedPnl, setRealizedPnl] = useState(0);
  // Restore any open position saved before the app was refreshed / closed.
  const [position, setPosition] = useState<OpenPosition | null>(() => {
    try {
      const raw = localStorage.getItem(POSITION_KEY);
      if (!raw) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed: any = JSON.parse(raw);
      if (!parsed) return null;
      // Migrate the previous single-leg shape ({ side, entryPrice, qty, ... }).
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
        return {
          symbol: parsed.symbol,
          label: parsed.label,
          currentPrice: parsed.currentPrice ?? leg.entryPrice,
          buy: parsed.side === 'buy' ? leg : null,
          sell: parsed.side === 'sell' ? leg : null,
        };
      }
      // Back-fill the fills array on legs saved before per-fill tracking.
      const pos = parsed as OpenPosition;
      return { ...pos, buy: normalizeLeg(pos.buy), sell: normalizeLeg(pos.sell) };
    } catch {
      return null;
    }
  });

  // Keep the open position in localStorage so it survives a refresh / re-open.
  useEffect(() => {
    try {
      if (hasOpenLeg(position)) {
        localStorage.setItem(POSITION_KEY, JSON.stringify(position));
      } else {
        localStorage.removeItem(POSITION_KEY);
      }
    } catch { /* ignore storage errors */ }
  }, [position]);

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
  }, [persist]);

  // Realise a closed leg into the balance + announce it. Deferred so it never
  // runs inside a setState updater.
  const settle = useCallback((side: PositionSide, entry: number, qty: number, exit: number, reason: 'manual' | 'tp' | 'sl') => {
    const diff = side === 'buy' ? exit - entry : entry - exit;
    const pnlValue = diff * qty;
    const profit = pnlValue >= 0;
    queueMicrotask(() => {
      applyPnl(pnlValue);
      setRealizedPnl(prev => +(prev + pnlValue).toFixed(2));
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

  const openOrAdd = useCallback(({ symbol, label, side, price, amount }: { symbol: string; label: string; side: PositionSide; price: number; amount: number }) => {
    if (price <= 0 || amount <= 0) return;
    setPosition((prev) => {
      // A different asset already holds open legs — keep one asset at a time.
      if (hasOpenLeg(prev) && prev!.symbol !== symbol) return prev;

      const base: OpenPosition = (prev && prev.symbol === symbol)
        ? prev
        : { symbol, label, currentPrice: price, buy: null, sell: null };

      const now = Math.floor(Date.now() / 1000);
      const fill: Fill = { id: newFillId(), entryPrice: price, qty: amount, entryTime: now };
      const existing = normalizeLeg(base[side]);
      const nextLeg: PositionLeg = existing && existing.qty > 0
        ? (() => {
            const newQty = +(existing.qty + amount).toFixed(6);
            const newEntry = ((existing.entryPrice * existing.qty) + price * amount) / newQty;
            // Keep the averaged entry for settlement, but record THIS trade
            // as its own fill so the chart shows it separately.
            return { ...existing, entryPrice: newEntry, qty: newQty, fills: [...existing.fills, fill] };
          })()
        : { entryPrice: price, qty: amount, takeProfit: null, stopLoss: null, entryTime: now, fills: [fill] };

      return { ...base, label, currentPrice: price, [side]: nextLeg };
    });
  }, []);

  const updatePrice = useCallback((symbol: string, price: number) => {
    if (!price || price <= 0) return;
    setPosition((prev) => {
      if (!prev || prev.symbol !== symbol) return prev;

      let buy = prev.buy;
      let sell = prev.sell;

      if (buy && buy.qty > 0) {
        const hitTp = buy.takeProfit != null && price >= buy.takeProfit;
        const hitSl = buy.stopLoss != null && price <= buy.stopLoss;
        if (hitTp || hitSl) {
          settle('buy', buy.entryPrice, buy.qty, hitTp ? buy.takeProfit! : buy.stopLoss!, hitTp ? 'tp' : 'sl');
          buy = null;
        }
      }
      if (sell && sell.qty > 0) {
        const hitTp = sell.takeProfit != null && price <= sell.takeProfit;
        const hitSl = sell.stopLoss != null && price >= sell.stopLoss;
        if (hitTp || hitSl) {
          settle('sell', sell.entryPrice, sell.qty, hitTp ? sell.takeProfit! : sell.stopLoss!, hitTp ? 'tp' : 'sl');
          sell = null;
        }
      }

      const next = { ...prev, buy, sell, currentPrice: price };
      if (!hasOpenLeg(next)) return null;
      if (buy === prev.buy && sell === prev.sell && prev.currentPrice === price) return prev;
      return next;
    });
  }, [settle]);

  const setTpSl = useCallback((side: PositionSide, takeProfit: number | null, stopLoss: number | null) => {
    setPosition((prev) => {
      if (!prev || !prev[side]) return prev;
      return { ...prev, [side]: { ...prev[side]!, takeProfit, stopLoss } };
    });
  }, []);

  const closePosition = useCallback((side: PositionSide) => {
    setPosition((prev) => {
      if (!prev || !prev[side] || prev[side]!.qty <= 0) return prev;
      const leg = prev[side]!;
      const exit = prev.currentPrice > 0 ? prev.currentPrice : leg.entryPrice;
      settle(side, leg.entryPrice, leg.qty, exit, 'manual');
      const next = { ...prev, [side]: null };
      return hasOpenLeg(next) ? next : null;
    });
  }, [settle]);

  return (
    <DemoAccountContext.Provider value={{ balance, loading, ready: !!userId, position, realizedPnl, openOrAdd, updatePrice, setTpSl, closePosition, applyPnl, renew }}>
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
      position: null,
      realizedPnl: 0,
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
