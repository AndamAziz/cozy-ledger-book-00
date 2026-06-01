import { useState, useEffect, useRef } from 'react';
import { ForexCurrency, fetchForexRates } from '@/lib/forexApi';

export function useForexData() {
  const [currencies, setCurrencies] = useState<ForexCurrency[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch real rates — display exactly what the source returns (no simulated drift)
  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetchForexRates()
        .then(data => {
          if (!cancelled) {
            setCurrencies(data);
            setError(null);
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
    // Refresh real rates every 60 seconds
    const timer = window.setInterval(load, 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return { currencies, isLoading, error };
}
