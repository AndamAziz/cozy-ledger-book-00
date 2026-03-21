import { useState, useEffect, useRef } from 'react';

export interface MetalCandle {
  time: number;
  close: number;
  high: number;
  low: number;
}

export function useMetalsHistory(code: string | null, range: string = '1mo', livePrice?: number) {
  const [candles, setCandles] = useState<MetalCandle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const baseCandlesRef = useRef<MetalCandle[]>([]);

  // Fetch history when code or range changes
  useEffect(() => {
    if (!code) {
      setCandles([]);
      baseCandlesRef.current = [];
      return;
    }

    let cancelled = false;
    setIsLoading(true);

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

        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data.candles)) {
            baseCandlesRef.current = data.candles;
            setCandles(data.candles);
          }
        }
      } catch (e) {
        console.error('Failed to fetch metals history:', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchHistory();
    return () => { cancelled = true; };
  }, [code, range]);

  // Append live price as the latest point for real-time feel
  useEffect(() => {
    if (!livePrice || livePrice <= 0 || baseCandlesRef.current.length === 0) return;

    const base = baseCandlesRef.current;
    const now = Math.floor(Date.now() / 1000);
    const liveCandle: MetalCandle = {
      time: now,
      close: livePrice,
      high: livePrice,
      low: livePrice,
    };

    // Replace or append live point
    const lastBase = base[base.length - 1];
    if (lastBase && now - lastBase.time < 60) {
      // Update the last candle
      setCandles([...base.slice(0, -1), { ...lastBase, close: livePrice, high: Math.max(lastBase.high, livePrice), low: Math.min(lastBase.low, livePrice) }]);
    } else {
      setCandles([...base, liveCandle]);
    }
  }, [livePrice]);

  return { candles, isLoading };
}
