import { useState, useEffect, useRef } from 'react';
import { Metal, fetchMetalsPrices } from '@/lib/metalsApi';

// Volatility per tick (% of price)
const VOLATILITY: Record<string, number> = {
  XAU: 0.004, XAG: 0.006, XPT: 0.005, XPD: 0.007,
  USOIL: 0.008, UKOIL: 0.008,
};

export function useMetalsData() {
  const [metals, setMetals] = useState<Metal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const baseRef = useRef<Metal[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetchMetalsPrices()
        .then(data => {
          if (!cancelled) {
            baseRef.current = data;
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
    const timer = window.setInterval(load, 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Live simulation every 2s
  useEffect(() => {
    if (isLoading || metals.length === 0) return;

    const tickInterval = window.setInterval(() => {
      setMetals(prev => prev.map(m => {
        const vol = VOLATILITY[m.code] || 0.005;
        const base = baseRef.current.find(b => b.code === m.code)?.price || m.price;
        const drift = (base - m.price) * 0.008;
        const noise = (Math.random() - 0.5) * 2 * vol * m.price / 100;
        const newPrice = m.price + drift + noise;
        const change = m.prevPrice !== 0 ? ((newPrice - m.prevPrice) / m.prevPrice) * 100 : 0;
        return { ...m, price: newPrice, change };
      }));
    }, 2000);

    return () => clearInterval(tickInterval);
  }, [isLoading, metals.length]);

  return { metals, isLoading, error };
}
