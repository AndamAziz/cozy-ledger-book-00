import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchTicker } from '@/lib/krakenApi';
import { useKrakenWebSocket } from '@/hooks/useKrakenWebSocket';

export interface CryptoLiveQuote {
  price: number;
  change24h: number;
}

/**
 * Live crypto prices from the EXACT same source as the Crypto page:
 * Kraken REST ticker (initial seed) + Kraken WebSocket (live updates).
 * Keyed by canonical pair (e.g. "XBT/USD").
 */
export function useCryptoLivePrices(pairs: string[]) {
  const [quotes, setQuotes] = useState<Record<string, CryptoLiveQuote>>({});
  const pairsKey = pairs.join(',');

  // Seed with REST ticker so prices appear immediately (same call the page makes).
  useEffect(() => {
    let cancelled = false;
    fetchTicker(pairs)
      .then((data) => {
        if (cancelled) return;
        setQuotes((prev) => {
          const next = { ...prev };
          for (const [pair, t] of Object.entries(data)) {
            next[pair] = { price: t.price, change24h: t.change24h };
          }
          return next;
        });
      })
      .catch(() => {/* ws will fill in */});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairsKey]);

  const wantedRef = useRef<Set<string>>(new Set(pairs));
  wantedRef.current = new Set(pairs);

  const onTickerUpdate = useCallback((u: { pair: string; price: number; change24h: number }) => {
    if (!wantedRef.current.has(u.pair)) return;
    setQuotes((prev) => {
      const cur = prev[u.pair];
      if (cur && cur.price === u.price && cur.change24h === u.change24h) return prev;
      return { ...prev, [u.pair]: { price: u.price, change24h: u.change24h } };
    });
  }, []);

  useKrakenWebSocket({ onTickerUpdate });

  return { quotes };
}
