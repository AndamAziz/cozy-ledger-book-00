import { useState, useEffect } from 'react';
import { ForexCurrency, fetchForexRates, isForexMarketOpen } from '@/lib/forexApi';

export function useForexData() {
  const [currencies, setCurrencies] = useState<ForexCurrency[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marketOpen, setMarketOpen] = useState(() => isForexMarketOpen());

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetchForexRates()
        .then(({ currencies, marketOpen }) => {
          if (cancelled) return;
          setCurrencies(currencies);
          setMarketOpen(marketOpen);
          setError(null);
          setIsLoading(false);
        })
        .catch(err => {
          if (cancelled) return;
          setError(err.message);
          setIsLoading(false);
        });
    };

    load();

    // Real-time: poll every 2s while the market is open, 60s when closed.
    const getInterval = () => (isForexMarketOpen() ? 2000 : 60000);
    let timer = window.setInterval(load, getInterval());

    const checkTimer = window.setInterval(() => {
      const next = getInterval();
      window.clearInterval(timer);
      timer = window.setInterval(load, next);
      setMarketOpen(isForexMarketOpen());
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearInterval(checkTimer);
    };
  }, []);

  return { currencies, isLoading, error, marketOpen };
}
