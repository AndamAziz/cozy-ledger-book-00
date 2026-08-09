import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkerChannel } from '@/workers/channelIndex.worker';

export interface ChannelSection<T> {
  name: string;
  items: T[];
  movie: boolean;
}

interface IndexState<T> {
  filtered: T[];
  sections: ChannelSection<T>[];
  groupCounts: Record<string, number>;
  /** True while the worker recomputes after a channel/query change. */
  computing: boolean;
}

/** Synchronous fallback used when Workers are unavailable (old Smart TV browsers). */
function computeSync<T extends WorkerChannel>(
  channels: T[],
  group: string,
  query: string,
  sectionLimit: number,
): IndexState<T> {
  const q = query.trim().toLowerCase();
  const filtered = channels.filter(
    (c) => (group === 'all' || c.group === group) && (!q || c.name.toLowerCase().includes(q)),
  );
  const counts: Record<string, number> = {};
  channels.forEach((c) => {
    const g = c.group || 'Other';
    counts[g] = (counts[g] || 0) + 1;
  });
  const map = new Map<string, T[]>();
  filtered.slice(0, sectionLimit).forEach((c) => {
    const key = c.group || 'Other';
    const list = map.get(key);
    if (list) list.push(c);
    else map.set(key, [c]);
  });
  const sections = [...map.entries()].map(([name, items]) => ({
    name,
    items,
    movie:
      /\.(mp4|mkv|avi|mov)(\?|$)/i.test(items[0]?.url ?? '') ||
      /movie|film|vod|series|cinema/i.test(items[0]?.group ?? ''),
  }));
  return { filtered, sections, groupCounts: counts, computing: false };
}

/**
 * Off-main-thread channel index: grouping, search and per-category sectioning
 * for playlists with tens of thousands of entries.
 */
export function useChannelIndex<T extends WorkerChannel>(
  channels: T[],
  group: string,
  query: string,
  sectionLimit = 300,
): IndexState<T> {
  const workerRef = useRef<Worker | null>(null);
  const reqRef = useRef(0);
  const [state, setState] = useState<IndexState<T>>({
    filtered: [],
    sections: [],
    groupCounts: {},
    computing: false,
  });

  const supported = typeof Worker !== 'undefined';

  useEffect(() => {
    if (!supported) return;
    const worker = new Worker(new URL('../workers/channelIndex.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<{ type: string; id: number; filtered?: T[]; sections?: ChannelSection<T>[]; groupCounts?: Record<string, number> }>) => {
      const msg = e.data;
      if (msg.id !== reqRef.current) return; // stale answer, a newer query is pending
      if (msg.type === 'result') {
        setState({
          filtered: msg.filtered ?? [],
          sections: msg.sections ?? [],
          groupCounts: msg.groupCounts ?? {},
          computing: false,
        });
      }
    };
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [supported]);

  // Re-index whenever the playlist itself changes, then re-run the active query.
  useEffect(() => {
    const worker = workerRef.current;
    if (!supported || !worker) return;
    worker.postMessage({ type: 'index', id: -1, channels });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, supported]);

  const debounced = useDebounced(query, 180);

  useEffect(() => {
    const worker = workerRef.current;
    if (!supported || !worker) return;
    const id = reqRef.current + 1;
    reqRef.current = id;
    setState((s) => ({ ...s, computing: true }));
    worker.postMessage({ type: 'query', id, group, query: debounced, sectionLimit });
  }, [channels, group, debounced, sectionLimit, supported]);

  const fallback = useMemo(
    () => (supported ? null : computeSync(channels, group, debounced, sectionLimit)),
    [supported, channels, group, debounced, sectionLimit],
  );

  return fallback ?? state;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
