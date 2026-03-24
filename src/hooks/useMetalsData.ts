import { useEffect, useRef, useState } from 'react';
import { Metal, fetchMetalsPrices } from '@/lib/metalsApi';

// Check if commodities markets are likely open (Sun 6PM ET - Fri 5PM ET)
function isCommoditiesMarketOpen(): boolean {
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcD = now.getUTCDay(); // 0=Sun
  const etH = (utcH - 4 + 24) % 24;
  const etD = utcH < 4 ? (utcD + 6) % 7 : utcD;

  if (etD === 6) return false;
  if (etD === 5 && etH >= 17) return false;
  if (etD === 0 && etH < 18) return false;
  return true;
}

// Volatility per commodity (% max fluctuation per tick)
const VOLATILITY: Record<string, number> = {
  XAU: 0.003,
  XAG: 0.005,
  XPT: 0.004,
  XPD: 0.006,
  USOIL: 0.005,
  UKOIL: 0.005,
  NATGAS: 0.008,
};

export function useMetalsData() {
  const [metals, setMetals] = useState<Metal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketOpen, setMarketOpen] = useState(() => isCommoditiesMarketOpen());
  const inFlightRef = useRef(false);
  const baseMetalsRef = useRef<Metal[]>([]);

  // Fetch real prices from API
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const data = await fetchMetalsPrices();
        if (!cancelled) {
          baseMetalsRef.current = data;
          setMetals(data);
          setError(null);
          setIsLoading(false);
          setMarketOpen(isCommoditiesMarketOpen());
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch live prices');
          setIsLoading(false);
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    load();
    // Poll API every 10s when market open, 60s when closed
    const getInterval = () => isCommoditiesMarketOpen() ? 10000 : 60000;
    let timer = window.setInterval(load, getInterval());

    const checkTimer = window.setInterval(() => {
      const newInterval = getInterval();
      window.clearInterval(timer);
      timer = window.setInterval(load, newInterval);
      setMarketOpen(isCommoditiesMarketOpen());
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearInterval(checkTimer);
    };
  }, []);

  // Simulate live micro-fluctuations every 1 second between API polls
  useEffect(() => {
    if (isLoading || metals.length === 0) return;

    const tickInterval = window.setInterval(() => {
      setMetals(prev => {
        return prev.map(m => {
          const vol = VOLATILITY[m.code] || 0.004;
          const basePrice = baseMetalsRef.current.find(b => b.code === m.code)?.price || m.price;
          // Mean reversion toward real API price + random noise
          const drift = (basePrice - m.price) * 0.02;
          const noise = (Math.random() - 0.5) * 2 * vol * m.price / 100;
          const newPrice = Math.max(0.01, m.price + drift + noise);

          // Recalculate change from prevPrice
          const change = m.prevPrice > 0 ? ((newPrice - m.prevPrice) / m.prevPrice) * 100 : 0;

          return {
            ...m,
            price: newPrice,
            change,
            high24h: Math.max(m.high24h, newPrice),
            low24h: Math.min(m.low24h, newPrice),
          };
        });
      });
    }, 1000);

    return () => clearInterval(tickInterval);
  }, [isLoading, metals.length]);

  return { metals, isLoading, error, marketOpen };
}
