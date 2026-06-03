import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/hooks/use-toast';

export const DEMO_STARTING_BALANCE = 200;

export type PositionSide = 'buy' | 'sell';

/** localStorage key used to persist the open position across refreshes. */
const POSITION_KEY = 'demo_open_position';

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
}

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
  // Restore any open position saved before the app was refreshed / closed.
  const [position, setPosition] = useState<OpenPosition | null>(() => {
    try {
      const raw = localStorage.getItem(POSITION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as OpenPosition & { side?: PositionSide; entryPrice?: number; qty?: number; takeProfit?: number | null; stopLoss?: number | null };
      // Migrate the previous single-leg shape ({ side, entryPrice, qty, ... }).
      if (parsed && (parsed as { side?: PositionSide }).side && !('buy' in parsed)) {
        const leg: PositionLeg = {
          entryPrice: parsed.entryPrice ?? 0,
          qty: parsed.qty ?? 0,
          takeProfit: parsed.takeProfit ?? null,
          stopLoss: parsed.stopLoss ?? null,
        };
        return {
          symbol: parsed.symbol,
          label: parsed.label,
          currentPrice: parsed.currentPrice ?? leg.entryPrice,
          buy: parsed.side === 'buy' ? leg : null,
          sell: parsed.side === 'sell' ? leg : null,
        };
      }
      return parsed as OpenPosition;
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

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data } = await supabase
        .from('demo_accounts')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!active) return;

      if (data) {
        setBalance(Number(data.balance));
      } else {
        await supabase.from('demo_accounts').insert({
          user_id: user.id,
          balance: DEMO_STARTING_BALANCE,
          starting_balance: DEMO_STARTING_BALANCE,
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

      const existing = base[side];
      const nextLeg: PositionLeg = existing && existing.qty > 0
        ? (() => {
            const newQty = +(existing.qty + amount).toFixed(6);
            const newEntry = ((existing.entryPrice * existing.qty) + price * amount) / newQty;
            return { ...existing, entryPrice: newEntry, qty: newQty };
          })()
        : { entryPrice: price, qty: amount, takeProfit: null, stopLoss: null };

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
    <DemoAccountContext.Provider value={{ balance, loading, ready: !!userId, position, openOrAdd, updatePrice, setTpSl, closePosition, applyPnl, renew }}>
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
