import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Quote {
  symbol: string;
  price: number;
  changePct: number;
  high24h: number;
  low24h: number;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Polls the bots-prices edge function every 2s (the required "live" cadence)
 * and keeps a per-symbol price history for sparklines.
 */
export function useBotPrices() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [updatedAt, setUpdatedAt] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const histRef = useRef<Record<string, number[]>>({});
  const [history, setHistory] = useState<Record<string, number[]>>({});
  const inflight = useRef(false);

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/bots-prices`, {
        headers: { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const q: Record<string, Quote> = data.quotes ?? {};
      setQuotes(q);
      setUpdatedAt(Date.now());
      setError(null);
      const h = histRef.current;
      for (const [sym, quote] of Object.entries(q)) {
        const arr = h[sym] ?? [];
        if (arr[arr.length - 1] !== quote.price) {
          arr.push(quote.price);
          if (arr.length > 30) arr.shift();
          h[sym] = arr;
        }
      }
      setHistory({ ...h });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load prices");
    } finally {
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 2000);
    return () => window.clearInterval(t);
  }, [load]);

  return { quotes, history, updatedAt, error, refresh: load };
}

/** Helper to call the bots-engine edge function with the user's session token. */
export async function callEngine(payload: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? SUPABASE_KEY;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/bots-engine`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}
