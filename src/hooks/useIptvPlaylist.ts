import { useQuery } from '@tanstack/react-query';

export interface IptvChannel {
  id: string;
  name: string;
  logo: string | null;
  group: string;
  url: string;
}

export interface IptvGroup {
  name: string;
  count: number;
  channels: IptvChannel[];
}

export interface IptvPlaylist {
  total: number;
  groups: IptvGroup[];
  updatedAt: string;
}

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** Build a CORS-safe, browser-playable stream URL for a raw IPTV channel URL. */
export function toPlayableUrl(rawUrl: string): string {
  // Xtream `.ts` endpoints also serve HLS at the same path with `.m3u8`.
  const hlsUrl = rawUrl.replace(/\.ts(\?.*)?$/i, '.m3u8$1');
  return `${FN_BASE}/iptv-proxy?u=${encodeURIComponent(hlsUrl)}&apikey=${ANON}`;
}

async function fetchPlaylist(): Promise<IptvPlaylist> {
  const res = await fetch(`${FN_BASE}/iptv-playlist`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? 'Failed to load playlist');
  return json as IptvPlaylist;
}

export function useIptvPlaylist() {
  return useQuery({
    queryKey: ['iptv-playlist'],
    queryFn: fetchPlaylist,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}
