import { useState, useEffect, useRef } from 'react';
import { fetchOHLC, TRACKED_PAIRS } from '@/lib/krakenApi';
import { analyzeCandles, mapWithConcurrency, OverviewSignal } from '@/lib/overview';

/** Fetch daily candles for all tracked crypto pairs once and compute their signals. */
export function useCryptoOverview(enabled: boolean) {
  const [data, setData] = useState<Record<string, OverviewSignal>>({});
  const [isLoading, setIsLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!enabled || fetchedRef.current) return;
    fetchedRef.current = true;

    let cancelled = false;
    setIsLoading(true);

    mapWithConcurrency(TRACKED_PAIRS, 5, async (pair) => {
      try {
        const candles = await fetchOHLC(pair, 1440);
        return [pair, analyzeCandles(candles, 0)] as const;
      } catch {
        const empty: OverviewSignal = { closes: [], summary: null };
        return [pair, empty] as const;
      }
    })
      .then((results) => {
        if (cancelled) return;
        const map: Record<string, OverviewSignal> = {};
        for (const [pair, signal] of results) map[pair] = signal;
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
