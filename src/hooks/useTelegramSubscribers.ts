import { useCallback, useEffect, useState } from 'react';

const CACHE_KEY = 'telegramSubs_v1';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

interface CachedSubs {
  count: number;
  ts: number;
}

/** Fetches the Telegram channel subscriber count via the telegram-stats edge function. */
export function useTelegramSubscribers() {
  const [count, setCount] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const c = JSON.parse(raw) as CachedSubs;
        if (typeof c.count === 'number') return c.count;
      }
    } catch { /* ignore */ }
    return null;
  });

  const load = useCallback(async () => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const c = JSON.parse(raw) as CachedSubs;
        if (Date.now() - c.ts < CACHE_TTL && typeof c.count === 'number') return;
      }
    } catch { /* ignore */ }

    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-stats`, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const data = await res.json();
      if (typeof data?.count === 'number') {
        setCount(data.count);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ count: data.count, ts: Date.now() })); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  return count;
}

/** Compact subscriber label, e.g. "1,234" or "12.3K". */
export function formatSubs(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return n.toLocaleString();
}
