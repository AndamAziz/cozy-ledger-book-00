import { useCallback, useEffect, useRef, useState } from 'react';
import type { DxyData } from '@/components/crypto/DxyWidget';
import type { SentimentData } from '@/components/crypto/SentimentGauge';

/**
 * SINGLE SOURCE OF TRUTH for the five macro indicators shared across every Pro
 * panel (Gold / Forex / Crypto) and the Signals tab: DXY, Fear & Greed, VIX,
 * US10Y and S&P 500.
 *
 * All values come from ONE `market-sentiment` edge-function call (Yahoo primary,
 * Twelve Data fallback for DXY/SPX; CNN + alternative.me for Fear & Greed).
 *
 * Fear & Greed is asset-aware:
 *   - `'cnn'`    → CNN US-stock-market index   (gold, forex, SPX)
 *   - `'crypto'` → alternative.me crypto index (BTC / crypto)
 *
 * Polling matches the Signals panel exactly: every 60s, plus an immediate
 * refetch when the tab returns to the foreground and the data is stale (>90s).
 */

const REFRESH_MS = 60 * 1000; // 60s — keep macro aligned with the live market
const STALE_MS = 90 * 1000;

export type MacroFgSource = 'cnn' | 'crypto';

export interface MacroQuote {
  price: number | null;
  changePct: number | null;
  available: boolean;
}

export interface MacroSnapshot {
  dxy: DxyData;
  /** Asset-appropriate Fear & Greed (CNN for gold/forex, crypto for BTC). */
  sentiment: SentimentData;
  sentimentCnn: SentimentData;
  sentimentCrypto: SentimentData;
  spx: MacroQuote;
  vix: MacroQuote;
  us10y: MacroQuote;
  goldBias: 'bullish' | 'bearish' | 'neutral';
}

const EMPTY_QUOTE: MacroQuote = { price: null, changePct: null, available: false };
const EMPTY_SENT: SentimentData = { value: null, classification: '', available: false };

const EMPTY_SNAPSHOT: MacroSnapshot = {
  dxy: { price: null, changePct: null, available: false },
  sentiment: EMPTY_SENT,
  sentimentCnn: EMPTY_SENT,
  sentimentCrypto: EMPTY_SENT,
  spx: EMPTY_QUOTE,
  vix: EMPTY_QUOTE,
  us10y: EMPTY_QUOTE,
  goldBias: 'neutral',
};

const headers = {
  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
};

export function useMacro(fgSource: MacroFgSource = 'cnn') {
  const [data, setData] = useState<MacroSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-sentiment`, { headers });
      const d = await res.json();
      const cnn: SentimentData = d?.sentimentCnn ?? d?.sentiment ?? EMPTY_SENT;
      const crypto: SentimentData = d?.sentimentCrypto ?? d?.sentiment ?? EMPTY_SENT;
      setData({
        dxy: d?.dxy ?? EMPTY_SNAPSHOT.dxy,
        sentimentCnn: cnn,
        sentimentCrypto: crypto,
        sentiment: fgSource === 'crypto' ? crypto : cnn,
        spx: d?.spx ?? EMPTY_QUOTE,
        vix: d?.vix ?? EMPTY_QUOTE,
        us10y: d?.us10y ?? EMPTY_QUOTE,
        goldBias: d?.goldBias ?? 'neutral',
      });
      setRefreshedAt(Date.now());
    } catch {
      /* keep last good values — the UI shows an unavailable state if never loaded */
    } finally {
      setLoading(false);
    }
  }, [fgSource]);

  // Keep a ref to the latest refresh time for the visibility/focus handler.
  const refreshedAtRef = useRef<number | null>(null);
  useEffect(() => { refreshedAtRef.current = refreshedAt; }, [refreshedAt]);

  // Mount + poll every 60s.
  useEffect(() => {
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // Refetch immediately when the tab returns to the foreground if data is stale.
  useEffect(() => {
    const maybeRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      const last = refreshedAtRef.current;
      if (last == null || Date.now() - last > STALE_MS) load();
    };
    document.addEventListener('visibilitychange', maybeRefresh);
    window.addEventListener('focus', maybeRefresh);
    return () => {
      document.removeEventListener('visibilitychange', maybeRefresh);
      window.removeEventListener('focus', maybeRefresh);
    };
  }, [load]);

  const stale = refreshedAt != null && Date.now() - refreshedAt > STALE_MS;

  return { ...data, loading, refreshedAt, stale, refresh: load };
}
