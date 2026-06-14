import { useState, useEffect, useRef } from 'react';

export interface MetalCandle {
  time: number;
  open: number;
  close: number;
  high: number;
  low: number;
}


export interface MetalsHistoryState {
  candles: MetalCandle[];
  isLoading: boolean;
  error: string | null;
  source: string | null;
  lastUpdated: number | null;
  refetch: () => void;
}

export function useMetalsHistory(code: string | null, range: string = '1mo', livePrice?: number): MetalsHistoryState {
  const [candles, setCandles] = useState<MetalCandle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const baseCandlesRef = useRef<MetalCandle[]>([]);

  // Fetch history when code or range changes
  useEffect(() => {
    if (!code) {
      setCandles([]);
      baseCandlesRef.current = [];
      setError(null);
      setSource(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const fetchHistory = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        const res = await fetch(
          `${supabaseUrl}/functions/v1/commodities-prices?mode=history&code=${code}&range=${range}`,
          {
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              apikey: supabaseKey,
            },
          }
        );

        const data = await res.json().catch(() => null);

        if (cancelled) return;

        if (res.ok && data && Array.isArray(data.candles) && data.candles.length > 0) {
          baseCandlesRef.current = data.candles;
          setCandles(data.candles);
          setSource(typeof data.source === 'string' ? data.source : null);
          setError(null);
        } else {
          // No usable history (e.g. spot source rate-limited / unavailable).
          baseCandlesRef.current = [];
          setCandles([]);
          setSource(null);
          setError(
            (data && typeof data.error === 'string' && data.error) ||
            'Chart data is temporarily unavailable.'
          );
        }
      } catch (e) {
        if (cancelled) return;
        console.error('Failed to fetch metals history:', e);
        baseCandlesRef.current = [];
        setCandles([]);
        setSource(null);
        setError('Could not load chart data. Check your connection and try again.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchHistory();
    return () => { cancelled = true; };
  }, [code, range, reloadKey]);

  // Append live price as the latest point for real-time feel
  useEffect(() => {
    if (!livePrice || livePrice <= 0 || baseCandlesRef.current.length === 0) return;

    const base = baseCandlesRef.current;
    const now = Math.floor(Date.now() / 1000);
    const lastBase = base[base.length - 1];
    const liveCandle: MetalCandle = {
      time: now,
      open: lastBase?.close ?? livePrice,
      close: livePrice,
      high: livePrice,
      low: livePrice,
    };

    // Replace or append live point
    if (lastBase && now - lastBase.time < 60) {
      // Update the last candle (keep its original open)
      setCandles([...base.slice(0, -1), { ...lastBase, close: livePrice, high: Math.max(lastBase.high, livePrice), low: Math.min(lastBase.low, livePrice) }]);
    } else {
      setCandles([...base, liveCandle]);
    }

  }, [livePrice]);

  const refetch = () => setReloadKey((k) => k + 1);

  return { candles, isLoading, error, source, refetch };
}
