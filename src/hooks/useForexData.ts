import { useState, useEffect, useRef, useCallback } from 'react';
import { ForexCurrency, fetchForexRates } from '@/lib/forexApi';

// Realistic volatility bands per currency type (% max fluctuation per tick)
const VOLATILITY: Record<string, number> = {
  EUR: 0.003, GBP: 0.004, JPY: 0.003, CHF: 0.003, CAD: 0.003,
  AUD: 0.004, NZD: 0.004, CNY: 0.002, INR: 0.003, TRY: 0.008,
  SAR: 0.001, AED: 0.001, IQD: 0.002, IRR: 0.005, KWD: 0.001,
  BHD: 0.001, QAR: 0.001, OMR: 0.001, JOD: 0.001, EGP: 0.005,
  KRW: 0.004, SGD: 0.002, HKD: 0.001, SEK: 0.004, NOK: 0.004,
  DKK: 0.003, PLN: 0.005, CZK: 0.004, HUF: 0.005, RUB: 0.008,
  BRL: 0.006, MXN: 0.005, ZAR: 0.006, THB: 0.003, MYR: 0.003,
  IDR: 0.004, PHP: 0.003, PKR: 0.004, NGN: 0.005, GEL: 0.004,
};

export function useForexData() {
  const [currencies, setCurrencies] = useState<ForexCurrency[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const baseRatesRef = useRef<ForexCurrency[]>([]);
  const tickCountRef = useRef(0);

  // Fetch real base rates
  useEffect(() => {
    let cancelled = false;

    const load = () => {
      setIsLoading(true);
      fetchForexRates()
        .then(data => {
          if (!cancelled) {
            baseRatesRef.current = data;
            setCurrencies(data);
            setIsLoading(false);
            tickCountRef.current = 0;
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
    // Refresh base rates every 5 minutes
    const timer = window.setInterval(load, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Simulate live micro-fluctuations every 2 seconds
  useEffect(() => {
    if (isLoading || currencies.length === 0) return;

    const tickInterval = window.setInterval(() => {
      tickCountRef.current++;
      
      setCurrencies(prev => {
        return prev.map(c => {
          const vol = VOLATILITY[c.code] || 0.003;
          // Random walk with mean reversion toward base rate
          const baseRate = baseRatesRef.current.find(b => b.code === c.code)?.rate || c.rate;
          const drift = (baseRate - c.rate) * 0.01; // gentle pull back to real rate
          const noise = (Math.random() - 0.5) * 2 * vol * c.rate / 100;
          const newRate = c.rate + drift + noise;
          
          // Recalculate change from prevRate (the original previous-day rate)
          const change = c.prevRate !== 0 ? ((newRate - c.prevRate) / c.prevRate) * 100 : 0;

          return {
            ...c,
            rate: newRate,
            change,
          };
        });
      });
    }, 2000);

    return () => clearInterval(tickInterval);
  }, [isLoading, currencies.length]);

  return { currencies, isLoading, error };
}
