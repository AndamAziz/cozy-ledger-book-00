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

const REFRESH_MS = 60 * 1000; // 60s — keep the signal aligned with the live market
/** If the last successful refresh is older than this, the data is considered stale. */
const STALE_MS = 90 * 1000;

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

  // Keep a ref to the latest refresh time so the visibility handler can decide
  // whether the data went stale while the tab was backgrounded.
  const refreshedAtRef = useRef<number | null>(null);
  useEffect(() => { refreshedAtRef.current = refreshedAt; }, [refreshedAt]);

  // Refetch when the asset changes + every 60s (only while enabled).
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    loadAll();
    const id = window.setInterval(loadAll, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loadAll, enabled]);

  // When the tab/app returns to the foreground (browsers throttle or pause
  // timers in background tabs, so the signal can be minutes stale), re-analyze
  // immediately so the direction reflects the *current* market instead of the
  // snapshot from when the tab went to sleep.
  useEffect(() => {
    if (!enabled) return;
    const maybeRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      const last = refreshedAtRef.current;
      if (last == null || Date.now() - last > STALE_MS) loadAll();
    };
    document.addEventListener('visibilitychange', maybeRefresh);
    window.addEventListener('focus', maybeRefresh);
    return () => {
      document.removeEventListener('visibilitychange', maybeRefresh);
      window.removeEventListener('focus', maybeRefresh);
    };
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

  // Tick every 15s so `stale` recomputes even without a re-render from data.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 15 * 1000);
    return () => window.clearInterval(id);
  }, []);
  const stale = refreshedAt != null && Date.now() - refreshedAt > STALE_MS;

  return { meta, signal, macro, events, loading, refreshedAt, stale, refresh: loadAll };
}
