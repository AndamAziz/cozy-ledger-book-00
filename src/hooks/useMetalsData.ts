import { useEffect, useRef, useState } from 'react';
import { Metal, fetchMetalsPrices } from '@/lib/metalsApi';

// Check if commodities markets are likely open (Sun 6PM ET - Fri 5PM ET)
function isCommoditiesMarketOpen(): boolean {
  const now = new Date();
  // Convert to ET (UTC-4 EDT / UTC-5 EST) - approximate with UTC-4
  const utcH = now.getUTCHours();
  const utcD = now.getUTCDay(); // 0=Sun
  const etH = (utcH - 4 + 24) % 24;
  const etD = utcH < 4 ? (utcD + 6) % 7 : utcD;

  // Closed: Fri 5PM ET (17:00) -> Sun 6PM ET (18:00)
  if (etD === 6) return false; // Saturday always closed
  if (etD === 5 && etH >= 17) return false; // Friday after 5PM
  if (etD === 0 && etH < 18) return false; // Sunday before 6PM
  return true;
}

export function useMetalsData() {
  const [metals, setMetals] = useState<Metal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketOpen, setMarketOpen] = useState(() => isCommoditiesMarketOpen());
  const inFlightRef = useRef(false);

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
    // Poll every 5s when market open, 60s when closed
    const getInterval = () => isCommoditiesMarketOpen() ? 5000 : 60000;
    let timer = window.setInterval(load, getInterval());

    // Re-check interval every 60s in case market opens/closes
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
