import { useState, useEffect } from 'react';

export interface MetalCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function useMetalsHistory(code: string | null, range: string = '1mo') {
  const [candles, setCandles] = useState<MetalCandle[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!code) {
      setCandles([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const fetchHistory = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        const res = await fetch(
          `${supabaseUrl}/functions/v1/commodities-history?code=${code}&range=${range}`,
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

  return { candles, isLoading };
}
