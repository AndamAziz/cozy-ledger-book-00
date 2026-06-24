import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OHLCCandle } from '@/lib/krakenApi';
import {
  AssetKey,
  SignalTF,
  buildAssetSignal,
  AssetSignal,
  MacroContext,
  NewsEvent,
  SignalAction,
} from '@/lib/signalEngine';
import {
  AssetMeta,
  getAssetMeta,
  fetchAssetAllTF,
  fetchMacro,
  fetchEvents,
} from '@/lib/signalData';

const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

function lastClose(candles: OHLCCandle[] | undefined): number {
  if (!candles || !candles.length) return 0;
  return candles[candles.length - 1].close;
}

/** Fire a browser notification when a signal flips direction (BUY <-> SELL). */
function notifyFlip(meta: AssetMeta, prev: SignalAction, next: SignalAction) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const directional = (a: SignalAction) => a === 'buy' || a === 'sell';
  if (!directional(prev) || !directional(next) || prev === next) return;
  const title = `${meta.label}: ${next.toUpperCase()} signal`;
  const body = `Direction flipped from ${prev.toUpperCase()} to ${next.toUpperCase()}.`;
  try {
    new Notification(title, { body, icon: '/favicon.ico', tag: `signal-${meta.key}` });
  } catch {
    /* ignore */
  }
}

export function useSignalEngine(assetKey: AssetKey, tf: SignalTF, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true;
  const meta = useMemo(() => getAssetMeta(assetKey), [assetKey]);

  const [macro, setMacro] = useState<MacroContext>({ dxyChangePct: null, fearGreed: null, spxChangePct: null, vix: null, us10y: null, us10yChangePct: null });
  const [events, setEvents] = useState<NewsEvent[]>([]);
  const [candlesByTF, setCandlesByTF] = useState<Partial<Record<SignalTF, OHLCCandle[]>>>({});
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);

  const prevActionRef = useRef<Record<string, SignalAction>>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [m, ev, candles] = await Promise.all([fetchMacro(meta.key), fetchEvents(), fetchAssetAllTF(meta)]);
    setMacro(m);
    setEvents(ev);
    setCandlesByTF(candles);
    setRefreshedAt(Date.now());
    setLoading(false);
  }, [meta]);

  // Refetch when the asset changes + every 5 minutes (only while enabled).
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    loadAll();
    const id = window.setInterval(loadAll, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loadAll, enabled]);

  // Ask for notification permission once.
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const signal: AssetSignal | null = useMemo(() => {
    const candles = candlesByTF[tf];
    if (!candles || !candles.length) return null;
    return buildAssetSignal({
      asset: meta.key,
      label: meta.label,
      decimals: meta.decimals,
      currencies: meta.currencies,
      timeframe: tf,
      price: lastClose(candles),
      candles,
      candlesByTF,
      macro,
      events,
    });
  }, [candlesByTF, tf, meta, macro, events]);

  // Detect direction flips and notify.
  useEffect(() => {
    if (!signal) return;
    const key = `${signal.asset}-${signal.timeframe}`;
    const prev = prevActionRef.current[key];
    if (prev) notifyFlip(meta, prev, signal.action);
    prevActionRef.current[key] = signal.action;
  }, [signal, meta]);

  return { meta, signal, macro, events, loading, refreshedAt, refresh: loadAll };
}
