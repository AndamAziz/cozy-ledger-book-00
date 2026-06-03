import { useState, useEffect, useRef } from 'react';
import { METALS_META } from '@/lib/metalsApi';
import { OHLCCandle } from '@/lib/krakenApi';
import { analyzeCandles, mapWithConcurrency, OverviewSignal } from '@/lib/overview';

interface MetalHistoryCandle {
  time: number;
  open: number;
  close: number;
  high: number;
  low: number;
}

/** Fetch recent history for all metals/commodities once and compute their signals. */
export function useMetalsOverview(enabled: boolean) {
  const [data, setData] = useState<Record<string, OverviewSignal>>({});
  const [isLoading, setIsLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!enabled || fetchedRef.current) return;
    fetchedRef.current = true;

    let cancelled = false;
    setIsLoading(true);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    mapWithConcurrency(METALS_META, 3, async (meta) => {
      try {
        const res = await fetch(
          `${supabaseUrl}/functions/v1/commodities-prices?mode=history&code=${meta.code}&range=1mo`,
          { headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey } },
        );
        const json = await res.json().catch(() => null);
        const raw: MetalHistoryCandle[] = res.ok && json && Array.isArray(json.candles) ? json.candles : [];
        const candles: OHLCCandle[] = raw.map((c) => ({
          time: c.time,
          open: c.open ?? c.close,
          high: c.high ?? c.close,
          low: c.low ?? c.close,
          close: c.close,
          volume: 0,
        }));
        return [meta.code, analyzeCandles(candles, 0)] as const;
      } catch {
        const empty: OverviewSignal = { closes: [], summary: null };
        return [meta.code, empty] as const;
      }
    })
      .then((results) => {
        if (cancelled) return;
        const map: Record<string, OverviewSignal> = {};
        for (const [code, signal] of results) map[code] = signal;
        setData(map);
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { data, isLoading };
}
