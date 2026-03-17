import { useState, useEffect } from 'react';
import { ForexCurrency, fetchForexRates } from '@/lib/forexApi';

export function useForexData() {
  const [currencies, setCurrencies] = useState<ForexCurrency[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      setIsLoading(true);
      fetchForexRates()
        .then(data => {
          if (!cancelled) {
            setCurrencies(data);
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

    // Refresh every 5 minutes
    const timer = window.setInterval(load, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return { currencies, isLoading, error };
}
