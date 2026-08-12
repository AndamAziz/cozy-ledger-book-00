import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getActiveSourceId, toPlayableUrl, type IptvChannel, type IptvKind } from './useIptvPlaylist';
import { isPlayerMounted, subscribePlayerMount } from '@/lib/playerMount';
import {
  getChannelStatus,
  invalidateChannelStatuses,
  requestChannelStatus,
  setChannelProbingPaused,
  subscribeChannelStatus,
  type ChannelStatus,
} from '@/lib/iptvHealth';

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** True while a video player overlay is mounted (probing must stand down). */
function usePlayerMounted(): boolean {
  const [mounted, setMounted] = useState(isPlayerMounted);
  useEffect(() => {
    setMounted(isPlayerMounted());
    return subscribePlayerMount(setMounted);
  }, []);
  return mounted;
}


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
  // A mounted player owns the provider slot: no provider or channel probing.
  const playing = usePlayerMounted();
  useEffect(() => {
    setChannelProbingPaused(playing);
    return () => setChannelProbingPaused(false);
  }, [playing]);

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
    enabled: !playing,
    refetchInterval: playing ? false : intervalMs,
    refetchOnWindowFocus: !playing,
    staleTime: 15_000,
    retry: 1,
  });

  // A new provider verdict makes stale per-channel verdicts worthless.
  const checkedAt = query.data?.checkedAt;
  useEffect(() => {
    if (checkedAt && !isPlayerMounted()) invalidateChannelStatuses();
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
  const playing = usePlayerMounted();
  const [status, setStatus] = useState<ChannelStatus>(() => getChannelStatus(key));

  useEffect(() => {
    setStatus(getChannelStatus(key));
    const off = subscribeChannelStatus(key, setStatus);
    if (enabled && !playing) {
      requestChannelStatus(key, toPlayableUrl(channel.id, channel.kind ?? 'live', channel.ext));
    }
    return off;
  }, [key, enabled, playing, channel.id, channel.kind, channel.ext]);


  return status;
}
