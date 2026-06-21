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

export function useMetalsData() {
  const [metals, setMetals] = useState<Metal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketOpen, setMarketOpen] = useState(() => isCommoditiesMarketOpen());
  const inFlightRef = useRef(false);

  // Fetch real prices from API — display exactly what the source returns
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const data = await fetchMetalsPrices();
        if (!cancelled) {
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
    // Poll every 4s when market open — the free spot source (gold-api.com) refreshes
    // ~every 4s (Cache-Control: max-age=4), so this is the fastest interval that yields
    // genuinely new prices without wasted requests. 60s when closed.
    const getInterval = () => isCommoditiesMarketOpen() ? 4000 : 60000;
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

  return { metals, isLoading, error, marketOpen };
}
