import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type StreamStatus = 'live' | 'slow' | 'offline' | 'checking';

export interface StreamServer {
  id: string;
  name: string;
  url: string;
  priority: number;
  is_active: boolean;
  last_status: string | null;
  last_latency_ms: number | null;
  fail_count: number;
  auto_disabled: boolean;
}

interface HealthResult {
  id: string;
  reachable: boolean;
  latency_ms: number | null;
  status: 'live' | 'slow' | 'offline';
}

const HEALTH_INTERVAL_MS = 30_000;

/**
 * Loads active stream servers ordered by priority and periodically runs a
 * server-side health check (Edge Function) so the UI can show Live/Slow/Offline.
 */
export function useStreamServers(enabled: boolean) {
  const [servers, setServers] = useState<StreamServer[]>([]);
  const [statuses, setStatuses] = useState<Record<string, StreamStatus>>({});
  const [latencies, setLatencies] = useState<Record<string, number | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchServers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('stream_servers')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: true });
      if (error) throw error;
      const list = (data ?? []) as StreamServer[];
      setServers(list);
      setStatuses((prev) => {
        const next = { ...prev };
        for (const s of list) {
          if (!next[s.id]) next[s.id] = 'checking';
        }
        return next;
      });
    } catch (err) {
      console.error('Failed to load stream servers:', err);
      setServers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const runHealthCheck = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('check-stream-health');
      if (error) throw error;
      const results: HealthResult[] = data?.results ?? [];
      if (results.length === 0) return;
      setStatuses((prev) => {
        const next = { ...prev };
        for (const r of results) next[r.id] = r.status;
        return next;
      });
      setLatencies((prev) => {
        const next = { ...prev };
        for (const r of results) next[r.id] = r.latency_ms;
        return next;
      });
      // A server may have been auto-disabled server-side; refresh the active list.
      const offlineDisabled = results.some((r) => r.status === 'offline');
      if (offlineDisabled) {
        fetchServers();
      }
    } catch (err) {
      console.error('Health check failed:', err);
    }
  }, [fetchServers]);

  useEffect(() => {
    if (!enabled) return;
    fetchServers();
  }, [enabled, fetchServers]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    // Run a single health check shortly after opening so statuses are populated.
    // NOTE: we intentionally do NOT poll on an interval anymore. The recurring
    // 30s probe was flipping a perfectly playable stream to "offline" (many
    // hosts block server-side probes even though the iframe plays fine), which
    // interrupted viewers. Status now refreshes only on manual request.
    const initial = setTimeout(runHealthCheck, 1500);
    return () => {
      clearTimeout(initial);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, runHealthCheck]);

  // Allow the UI to mark a server offline locally (iframe onerror / timeout).
  const markStatus = useCallback((id: string, status: StreamStatus) => {
    setStatuses((prev) => ({ ...prev, [id]: status }));
  }, []);

  return {
    servers,
    statuses,
    latencies,
    isLoading,
    refetch: fetchServers,
    runHealthCheck,
    markStatus,
  };
}
