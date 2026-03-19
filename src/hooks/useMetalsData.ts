import { useState, useEffect } from 'react';
import { Metal, fetchMetalsPrices } from '@/lib/metalsApi';

export function useMetalsData() {
  const [metals, setMetals] = useState<Metal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetchMetalsPrices()
        .then(data => {
          if (!cancelled) {
            setMetals(data);
            setIsLoading(false);
          }
        })
        .catch(err => {
          if (!cancelled) {
            setError(err.message);
            setIsLoading(false);
          }
        });
    };

    load();
    // Refresh every 30 seconds for near-realtime
    const timer = window.setInterval(load, 30 * 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return { metals, isLoading, error };
}
