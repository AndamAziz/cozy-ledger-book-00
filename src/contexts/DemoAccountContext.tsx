import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/hooks/use-toast';

export const DEMO_STARTING_BALANCE = 200;

export type PositionSide = 'buy' | 'sell';

/**
 * A single open trade that lives at the page level so it PERSISTS while the
 * user navigates between Crypto / Forex / Metals tabs or switches assets —
 * it only closes when the user closes it manually or a TP/SL level is hit.
 */
export interface OpenPosition {
  /** Unique asset key (crypto pair or metal name) the position belongs to. */
  symbol: string;
  /** Human-readable label shown in banners (e.g. "BTC/USD", "Gold"). */
  label: string;
  side: PositionSide;
  /** Weighted-average entry price across stacked adds. */
  entryPrice: number;
  /** Total accumulated quantity. */
  qty: number;
  /** Take-profit trigger price (auto-closes in profit) or null. */
  takeProfit: number | null;
  /** Stop-loss trigger price (auto-closes in loss) or null. */
  stopLoss: number | null;
  /** Last known live price of the asset (used for live P/L). */
  currentPrice: number;
}

interface DemoAccountValue {
  balance: number;
  loading: boolean;
  /** True when a persisted account is available (user signed in). */
  ready: boolean;
  /** The single open position, or null when flat. */
  position: OpenPosition | null;
  /** Open a new position or stack onto an existing one on the same asset+side. */
  openOrAdd: (args: { symbol: string; label: string; side: PositionSide; price: number; amount: number }) => void;
  /** Update the live price for the asset that owns the position; triggers TP/SL. */
  updatePrice: (symbol: string, price: number) => void;
  /** Set / clear the take-profit and stop-loss levels of the open position. */
  setTpSl: (takeProfit: number | null, stopLoss: number | null) => void;
  /** Close the open position at the latest price and realise its P/L. */
  closePosition: () => void;
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
      return raw ? (JSON.parse(raw) as OpenPosition) : null;
    } catch {
      return null;
    }
  });

  // Keep the open position in localStorage so it survives a refresh / re-open.
  useEffect(() => {
    try {
      if (position && position.qty > 0) {
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

  // Realise a closed position into the balance + announce it. Deferred so it
  // never runs inside a setState updater.
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
      if (prev && prev.symbol === symbol && prev.side === side && prev.qty > 0) {
        const newQty = +(prev.qty + amount).toFixed(6);
        const newEntry = ((prev.entryPrice * prev.qty) + price * amount) / newQty;
        return { ...prev, entryPrice: newEntry, qty: newQty, currentPrice: price };
      }
      return { symbol, label, side, entryPrice: price, qty: amount, takeProfit: null, stopLoss: null, currentPrice: price };
    });
  }, []);

  const updatePrice = useCallback((symbol: string, price: number) => {
    if (!price || price <= 0) return;
    setPosition((prev) => {
      if (!prev || prev.symbol !== symbol) return prev;
      const hitTp = prev.takeProfit != null && (prev.side === 'buy' ? price >= prev.takeProfit : price <= prev.takeProfit);
      const hitSl = prev.stopLoss != null && (prev.side === 'buy' ? price <= prev.stopLoss : price >= prev.stopLoss);
      if (hitTp || hitSl) {
        const exit = hitTp ? prev.takeProfit! : prev.stopLoss!;
        settle(prev.side, prev.entryPrice, prev.qty, exit, hitTp ? 'tp' : 'sl');
        return null;
      }
      if (prev.currentPrice === price) return prev;
      return { ...prev, currentPrice: price };
    });
  }, [settle]);

  const setTpSl = useCallback((takeProfit: number | null, stopLoss: number | null) => {
    setPosition((prev) => (prev ? { ...prev, takeProfit, stopLoss } : prev));
  }, []);

  const closePosition = useCallback(() => {
    setPosition((prev) => {
      if (!prev || prev.qty <= 0) return null;
      const exit = prev.currentPrice > 0 ? prev.currentPrice : prev.entryPrice;
      settle(prev.side, prev.entryPrice, prev.qty, exit, 'manual');
      return null;
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
