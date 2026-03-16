import { useState, useEffect } from 'react';
import { fetchOHLC, OHLCCandle } from '@/lib/krakenApi';

export function useKrakenOHLC(pair: string, interval: number) {
  const [candles, setCandles] = useState<OHLCCandle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchOHLC(pair, interval)
      .then((data) => {
        if (!cancelled) {
          setCandles(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [pair, interval]);

  const updateLastCandle = (candle: OHLCCandle) => {
    setCandles(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (candle.time >= last.time) {
        if (candle.time === last.time) {
          // Update existing candle
          return [...prev.slice(0, -1), { ...last, high: Math.max(last.high, candle.high), low: Math.min(last.low, candle.low), close: candle.close, volume: candle.volume }];
        }
        // New candle
        return [...prev, candle];
      }
      return prev;
    });
  };

  return { candles, isLoading, error, updateLastCandle };
}
