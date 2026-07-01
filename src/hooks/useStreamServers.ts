import { useCallback, useEffect, useState } from 'react';
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

/**
 * Loads active stream servers ordered by priority. Health checks are manual only
 * because many stream/movie hosts block server-side probes while still playing in
 * a browser iframe.
 */
export function useStreamServers(enabled: boolean) {
  const [servers, setServers] = useState<StreamServer[]>([]);
  const [statuses, setStatuses] = useState<Record<string, StreamStatus>>({});
  const [latencies, setLatencies] = useState<Record<string, number | null>>({});
  const [isLoading, setIsLoading] = useState(true);

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
          // Start neutral on the viewer side. Stored probe results can be false
          // negatives for movie/stream hosts that block bots but load in-browser.
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
      fetchServers();
    } catch (err) {
      console.error('Health check failed:', err);
    }
  }, [fetchServers]);

  useEffect(() => {
    if (!enabled) return;
    fetchServers();
  }, [enabled, fetchServers]);

  useEffect(() => {
    // No automatic health check here: viewers should always get a chance to play
    // the saved URL directly, even when probes report a false offline state.
  }, [enabled]);

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
