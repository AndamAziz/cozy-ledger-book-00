import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const DEMO_STARTING_BALANCE = 100000;

interface DemoAccountValue {
  balance: number;
  loading: boolean;
  /** True when a persisted account is available (user signed in). */
  ready: boolean;
  /** Apply a realised profit (positive) or loss (negative) to the balance. */
  applyPnl: (delta: number) => void;
  /** Reset the balance back to the starting amount. */
  renew: () => void;
}

const DemoAccountContext = createContext<DemoAccountValue | null>(null);

export function DemoAccountProvider({ children }: { children: ReactNode }) {
  const [balance, setBalance] = useState(DEMO_STARTING_BALANCE);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

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

  return (
    <DemoAccountContext.Provider value={{ balance, loading, ready: !!userId, applyPnl, renew }}>
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
      applyPnl: () => {},
      renew: () => {},
    };
  }
  return ctx;
}
