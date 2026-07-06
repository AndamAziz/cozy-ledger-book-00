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

/**
 * Aggregate raw backend candles into a coarser timeframe (client-side), mirroring
 * `aggregateCandles` used by the signal engine so the chart series matches the
 * engine's series exactly for shared timeframes (H1/H4/D1, …).
 */
function aggregateMetalCandles(candles: MetalCandle[], factor: number): MetalCandle[] {
  if (!factor || factor <= 1) return candles;
  const out: MetalCandle[] = [];
  for (let i = 0; i + factor <= candles.length; i += factor) {
    const group = candles.slice(i, i + factor);
    out.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
    });
  }
  return out;
}

export function useMetalsHistory(code: string | null, range: string = '1mo', livePrice?: number, agg: number = 1): MetalsHistoryState {
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
          const aggregated = aggregateMetalCandles(data.candles as MetalCandle[], agg);
          baseCandlesRef.current = aggregated;
          setCandles(aggregated);
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
        if (!cancelled) {
          setIsLoading(false);
          setLastUpdated(Date.now());
        }
      }
    };

    fetchHistory();
    return () => { cancelled = true; };
  }, [code, range, agg, reloadKey]);

  // Append live price as the latest point for real-time feel.
  // Candle boundaries are aligned to UTC clock intervals (TradingView / MT5
  // standard) — NOT relative to when data was fetched. The live tick either
  // updates the current UTC bucket's candle or opens a new one at the next
  // aligned boundary.
  useEffect(() => {
    if (!livePrice || livePrice <= 0 || baseCandlesRef.current.length === 0) return;

    const base = baseCandlesRef.current;
    // Seconds per candle for each timeframe (matches the server interval).
    const STEP_SECONDS: Record<string, number> = {
      '1min': 60, '5min': 300, '15min': 900, '1d': 300, '5d': 900,
      '1mo': 3600, '3mo': 86_400, '6mo': 86_400, '1y': 86_400, '5y': 604_800,
    };
    const step = (STEP_SECONDS[range] ?? 60) * (agg > 1 ? agg : 1);
    // Align to the UTC clock: epoch 0 is 1970-01-01 00:00 UTC, so flooring by
    // the step lands exactly on :00 / :05 / :15 / hour / day boundaries.
    const bucket = Math.floor(Date.now() / 1000 / step) * step;
    const lastBase = base[base.length - 1];

    if (lastBase && bucket > lastBase.time) {
      // New UTC interval started -> open a fresh candle at the aligned boundary.
      const liveCandle: MetalCandle = {
        time: bucket,
        open: lastBase.close,
        close: livePrice,
        high: livePrice,
        low: livePrice,
      };
      setCandles([...base, liveCandle]);
    } else if (lastBase) {
      // Still inside the current bucket -> update the live candle in place.
      setCandles([...base.slice(0, -1), {
        ...lastBase,
        close: livePrice,
        high: Math.max(lastBase.high, livePrice),
        low: Math.min(lastBase.low, livePrice),
      }]);
    }

  }, [livePrice, range, agg]);


  const refetch = () => setReloadKey((k) => k + 1);

  return { candles, isLoading, error, source, lastUpdated, refetch };
}
