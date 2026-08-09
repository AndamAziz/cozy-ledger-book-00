import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type IptvKind = 'live' | 'vod' | 'series';

export interface IptvChannel {
  id: string;
  name: string;
  logo: string | null;
  group: string;
  /** 'vod' for Movies/Series/Replay items, 'live' for direct channels. */
  kind?: IptvKind;
  /** Container extension hint for VOD/series episodes (mp4, mkv…). */
  ext?: string;
}

export interface IptvEpisode {
  id: string;
  season: number;
  episode: number;
  title: string;
  cover: string | null;
  ext: string;
  plot: string | null;
  duration: string | null;
}

export interface IptvSeriesInfo {
  id: string;
  name: string;
  cover: string | null;
  plot: string | null;
  seasons: { season: number; episodes: IptvEpisode[] }[];
}


export interface IptvCategory {
  id: string;
  name: string;
  count: number;
  /** Section the category came from upstream: live channels, movies (vod) or series. */
  kind?: 'live' | 'vod' | 'series';
}


/** UI-facing explanation of why the provider refused a catalogue request. */
export interface IptvDiagnostic {
  verdict: 'waf_block' | 'credentials' | 'rate_limited' | 'geo_block' | 'unknown' | string;
  reason: string;
  status: number;
  statusText?: string;
  url: string;
  action?: string;
  attempt?: number;
  durationMs?: number;
  headers?: Record<string, string>;
  bodySnippet?: string;
  message?: string;
}

export interface IptvIndex {
  total: number;
  categories: IptvCategory[];
  updatedAt: string;
  warning?: string;
  reqId?: string;
  diagnostic?: IptvDiagnostic | null;
}

/** Error carrying the upstream diagnostic returned by the edge function. */
export class IptvRequestError extends Error {
  reqId?: string;
  errorKind?: string;
  diagnostic?: IptvDiagnostic | null;
  constructor(message: string, meta: { reqId?: string; errorKind?: string; diagnostic?: IptvDiagnostic | null }) {
    super(message);
    this.name = 'IptvRequestError';
    this.reqId = meta.reqId;
    this.errorKind = meta.errorKind;
    this.diagnostic = meta.diagnostic ?? null;
  }
}


const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/**
 * Streams are resolved from the signed-in user's own provider account, so every
 * request has to carry their token. <video>/hls.js cannot set headers, hence the
 * mirrored `token` query parameter on media URLs.
 */
let accessToken: string | null = null;
supabase.auth.getSession().then(({ data }) => {
  accessToken = data.session?.access_token ?? null;
});
supabase.auth.onAuthStateChange((_event, session) => {
  accessToken = session?.access_token ?? null;
});

/**
 * CORS-safe, browser-playable stream URL (provider credentials stay server-side).
 * `raw` asks the proxy for the transport-stream variant first — used by the
 * mpegts.js engine, which needs a TS feed rather than an HLS manifest.
 */
export function toPlayableUrl(
  channelId: string,
  kind: IptvKind = 'live',
  ext?: string,
  opts?: { raw?: boolean },
): string {
  const extPart = ext ? `&ext=${encodeURIComponent(ext)}` : '';
  const tokenPart = accessToken ? `&token=${encodeURIComponent(accessToken)}` : '';
  const rawPart = opts?.raw ? '&raw=1' : '';
  return `${FN_BASE}/iptv-stream?id=${encodeURIComponent(channelId)}&kind=${kind}${extPart}${rawPart}&apikey=${ANON}${tokenPart}`;
}



async function get<T>(path: string): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;
  accessToken = token;
  const res = await fetch(`${FN_BASE}/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token ?? ANON}` },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new IptvRequestError(json?.error ?? `Failed to load playlist (HTTP ${res.status})`, {
      reqId: json?.reqId,
      errorKind: json?.errorKind,
      diagnostic: json?.diagnostic ?? null,
    });
  }

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

export function useIptvChannels(categoryId: string | null, enabled: boolean, limit = 24) {
  return useQuery({
    queryKey: ['iptv-channels', categoryId, limit],
    queryFn: () =>
      get<{ total: number; channels: IptvChannel[] }>(
        `iptv-playlist?category=${encodeURIComponent(categoryId ?? '')}&limit=${limit}`,
      ),
    enabled: enabled && !!categoryId,
    staleTime: 15 * 60 * 1000,
    // Paging keeps the already-rendered grid on screen instead of flashing skeletons.
    placeholderData: keepPreviousData,
  });
}


export function useIptvSearch(query: string, section: 'live' | 'vod' | 'series' = 'live') {
  const q = query.trim();
  return useQuery({
    queryKey: ['iptv-search', q, section],
    queryFn: () =>
      get<{ total: number; channels: IptvChannel[] }>(
        `iptv-playlist?q=${encodeURIComponent(q)}&kind=${section}&limit=90`,
      ),
    enabled: q.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

/** Season / episode structure for a single series. */
export function useIptvSeriesInfo(seriesId: string | null) {
  return useQuery({
    queryKey: ['iptv-series', seriesId],
    queryFn: () => get<IptvSeriesInfo>(`iptv-playlist?series=${encodeURIComponent(seriesId ?? '')}`),
    enabled: !!seriesId,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}



/**
 * Hard refresh: re-downloads the catalogue upstream (bypassing every server
 * cache) and drops all client caches, so a newly added/updated source or a
 * previously truncated download is reflected immediately.
 */
export function useIptvRefresh() {
  const qc = useQueryClient();
  return async () => {
    try {
      await get<IptvIndex>('iptv-playlist?refresh=1');
    } finally {
      qc.removeQueries({ queryKey: ['iptv-index'] });
      qc.removeQueries({ queryKey: ['iptv-channels'] });
      qc.removeQueries({ queryKey: ['iptv-search'] });
      await qc.refetchQueries({ queryKey: ['iptv-index'] });
    }
  };
}
