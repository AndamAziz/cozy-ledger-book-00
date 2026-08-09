import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getActiveSourceId, toPlayableUrl, type IptvChannel, type IptvKind } from './useIptvPlaylist';
import {
  getChannelStatus,
  invalidateChannelStatuses,
  requestChannelStatus,
  subscribeChannelStatus,
  type ChannelStatus,
} from '@/lib/iptvHealth';

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export type ProviderStatus = 'online' | 'slot_limit' | 'offline';

export interface ProviderHealth {
  status: ProviderStatus;
  message: string;
  activeConnections: number | null;
  maxConnections: number | null;
  expiresAt: string | null;
  checkedAt: string;
  /** Round-trip time of the provider probe, in milliseconds. */
  latencyMs?: number;
  cached?: boolean;
}

/** Periodic provider health check (auth, reachability, slot usage). */
export function useProviderHealth(intervalMs = 60_000) {
  const query = useQuery({
    queryKey: ['iptv-health', getActiveSourceId()],
    queryFn: async (): Promise<ProviderHealth> => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? ANON;
      const source = getActiveSourceId();
      const res = await fetch(`${FN_BASE}/iptv-health${source ? `?source=${encodeURIComponent(source)}` : ''}`, {
        headers: { apikey: ANON, Authorization: `Bearer ${token}` },
      });
      return (await res.json()) as ProviderHealth;
    },
    refetchInterval: intervalMs,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    retry: 1,
  });

  // A new provider verdict makes stale per-channel verdicts worthless.
  const checkedAt = query.data?.checkedAt;
  useEffect(() => {
    if (checkedAt) invalidateChannelStatuses();
  }, [checkedAt]);

  return query;
}

/**
 * ONLINE / OFFLINE / BUSY badge for a single channel, probed before playback.
 * `enabled` should be false while the provider itself is down.
 */
export function useChannelHealth(
  channel: Pick<IptvChannel, 'id' | 'ext'> & { kind?: IptvKind },
  enabled = true,
): ChannelStatus {
  const key = `${channel.kind ?? 'live'}:${channel.id}`;
  const [status, setStatus] = useState<ChannelStatus>(() => getChannelStatus(key));

  useEffect(() => {
    setStatus(getChannelStatus(key));
    const off = subscribeChannelStatus(key, setStatus);
    if (enabled) {
      requestChannelStatus(key, toPlayableUrl(channel.id, channel.kind ?? 'live', channel.ext));
    }
    return off;
  }, [key, enabled, channel.id, channel.kind, channel.ext]);

  return status;
}
