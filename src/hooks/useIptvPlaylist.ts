import { useQuery } from '@tanstack/react-query';

export type IptvKind = 'live' | 'vod';

export interface IptvChannel {
  id: string;
  name: string;
  logo: string | null;
  group: string;
  /** 'vod' for Movies/Series/Replay items, 'live' for direct channels. */
  kind?: IptvKind;
}

export interface IptvCategory {
  id: string;
  name: string;
  count: number;
}

export interface IptvIndex {
  total: number;
  categories: IptvCategory[];
  updatedAt: string;
}

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** CORS-safe, browser-playable HLS URL for a channel (credentials stay server-side). */
export function toPlayableUrl(channelId: string): string {
  return `${FN_BASE}/iptv-proxy?id=${encodeURIComponent(channelId)}&apikey=${ANON}`;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${FN_BASE}/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? 'Failed to load playlist');
  return json as T;
}

export function useIptvIndex() {
  return useQuery({
    queryKey: ['iptv-index'],
    queryFn: () => get<IptvIndex>('iptv-playlist'),
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });
}

export function useIptvChannels(categoryId: string | null, enabled: boolean, limit = 60) {
  return useQuery({
    queryKey: ['iptv-channels', categoryId, limit],
    queryFn: () =>
      get<{ total: number; channels: IptvChannel[] }>(
        `iptv-playlist?category=${encodeURIComponent(categoryId ?? '')}&limit=${limit}`,
      ),
    enabled: enabled && !!categoryId,
    staleTime: 15 * 60 * 1000,
  });
}

export function useIptvSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['iptv-search', q],
    queryFn: () => get<{ total: number; channels: IptvChannel[] }>(`iptv-playlist?q=${encodeURIComponent(q)}&limit=90`),
    enabled: q.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}
