import { useEffect, useRef, useState } from 'react';
import { Metal, fetchMetalsPrices } from '@/lib/metalsApi';

export function useMetalsData() {
  const [metals, setMetals] = useState<Metal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    const timer = window.setInterval(load, 1000); // second-by-second refresh

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return { metals, isLoading, error };
}
