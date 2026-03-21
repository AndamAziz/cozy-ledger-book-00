import { useEffect, useRef, useState } from 'react';
import { Metal, fetchMetalsPrices } from '@/lib/metalsApi';

export function useMetalsData() {
  const [metals, setMetals] = useState<Metal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketOpen, setMarketOpen] = useState(true);
  const inFlightRef = useRef(false);
  const unchangedCountRef = useRef(0);
  const lastPricesRef = useRef<string>('');

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

          // Detect market closed: if prices haven't changed for 5+ consecutive fetches
          const priceKey = data.map(m => `${m.code}:${m.price}`).join(',');
          if (priceKey === lastPricesRef.current) {
            unchangedCountRef.current += 1;
          } else {
            unchangedCountRef.current = 0;
            lastPricesRef.current = priceKey;
          }
          setMarketOpen(unchangedCountRef.current < 5);
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
    const timer = window.setInterval(load, 5000); // 5s refresh

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return { metals, isLoading, error, marketOpen };
}
