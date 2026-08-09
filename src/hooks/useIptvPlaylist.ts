import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  cancelBackgroundQueue,
  clearCatalogCache,

  fetchWithBackoff,
  queued,
  readCatalogCache,
  readCatalogEntry,
  writeCatalogCache,
} from '@/lib/iptvCatalog';



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

/**
 * Selected IPTV source (`iptv_sources.id`) for accounts that hold several.
 * Threaded onto every catalogue/stream URL so the edge functions resolve the
 * right provider even before the server-side default is updated.
 */
let activeSourceId: string | null = null;
export function setActiveSourceId(id: string | null) {
  activeSourceId = id;
}
export const getActiveSourceId = () => activeSourceId;
const sourceParam = () => (activeSourceId ? `&source=${encodeURIComponent(activeSourceId)}` : '');
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
  return `${FN_BASE}/iptv-stream?id=${encodeURIComponent(channelId)}&kind=${kind}${extPart}${rawPart}${sourceParam()}&apikey=${ANON}${tokenPart}`;
}



/** A path that just failed is not retried for this long (fail fast, no 20s stall). */
const FAIL_MEMO_MS = 45_000;
const failMemo = new Map<string, { at: number; err: Error }>();

async function get<T>(path: string, opts: { cache?: boolean; background?: boolean } = {}): Promise<T> {
  const useCache = opts.cache !== false && !path.includes('refresh=1');
  const cacheKey = `${activeSourceId ?? 'default'}|${path}`;
  if (useCache) {
    // Stale entries are served instantly and refreshed in the background: the
    // provider allows one connection at a time, so waiting is what felt slow.
    const hit = readCatalogEntry<T>(cacheKey);
    if (hit) {
      if (!hit.fresh && !opts.background) void get<T>(path, { background: true }).catch(() => undefined);
      return hit.value;
    }
    const failed = failMemo.get(cacheKey);
    if (failed && Date.now() - failed.at < FAIL_MEMO_MS) throw failed.err;
  }

  // Foreground requests jump ahead of prefetch work and never sit behind it.
  if (!opts.background) cancelBackgroundQueue();

  return await queued(async () => {
    if (useCache) {
      // A queued duplicate may have been filled while waiting.
      const hit = readCatalogCache<T>(cacheKey);
      if (hit) return hit;
    }
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    accessToken = token;
    const url = `${FN_BASE}/${path}${activeSourceId ? `${path.includes('?') ? '&' : '?'}source=${encodeURIComponent(activeSourceId)}` : ''}`;
    try {
      const res = await fetchWithBackoff(
        url,
        { headers: { apikey: ANON, Authorization: `Bearer ${token ?? ANON}` } },
        // Prefetch never burns retries; a foreground miss gets two quick tries.
        opts.background ? { retries: 1 } : { retries: 2, delayMs: 1200 },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new IptvRequestError(json?.error ?? `Failed to load playlist (HTTP ${res.status})`, {
          reqId: json?.reqId,
          errorKind: json?.errorKind,
          diagnostic: json?.diagnostic ?? null,
        });
      }
      if (useCache && json) writeCatalogCache(cacheKey, json);
      failMemo.delete(cacheKey);
      return json as T;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to load playlist');
      if (e.message !== 'cancelled') failMemo.set(cacheKey, { at: Date.now(), err: e });
      throw e;
    }
  }, { background: opts.background });
}

/**
 * Warm the localStorage cache for the categories the user is about to open, one
 * at a time in the background, so expanding a row paints instantly.
 */
export function prefetchIptvCategories(categoryIds: string[], limit = 12) {
  categoryIds.forEach((id) => {
    void get<{ total: number; channels: IptvChannel[] }>(
      `iptv-playlist?category=${encodeURIComponent(id)}&limit=${limit}`,
      { background: true },
    ).catch(() => undefined);
  });
}



export function useIptvIndex() {
  return useQuery({
    queryKey: ['iptv-index', activeSourceId],
    queryFn: () => get<IptvIndex>('iptv-playlist'),
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 0,
  });
}


export function useIptvChannels(categoryId: string | null, enabled: boolean, limit = 24) {
  return useQuery({
    queryKey: ['iptv-channels', activeSourceId, categoryId, limit],
    queryFn: () =>
      get<{ total: number; channels: IptvChannel[] }>(
        `iptv-playlist?category=${encodeURIComponent(categoryId ?? '')}&limit=${limit}`,
      ),
    enabled: enabled && !!categoryId,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 0,
    // Paging keeps the already-rendered grid on screen instead of flashing skeletons.
    placeholderData: keepPreviousData,
  });
}


export function useIptvSearch(query: string, section: 'live' | 'vod' | 'series' = 'live') {
  const q = query.trim();
  return useQuery({
    queryKey: ['iptv-search', activeSourceId, q, section],
    queryFn: () =>
      get<{ total: number; channels: IptvChannel[] }>(
        `iptv-playlist?q=${encodeURIComponent(q)}&kind=${section}&limit=90`,
      ),
    enabled: q.length >= 2,
    staleTime: 30 * 60 * 1000,
    retry: 0,
  });
}

/** Season / episode structure for a single series. */
export function useIptvSeriesInfo(seriesId: string | null) {
  return useQuery({
    queryKey: ['iptv-series', activeSourceId, seriesId],
    queryFn: () => get<IptvSeriesInfo>(`iptv-playlist?series=${encodeURIComponent(seriesId ?? '')}`),
    enabled: !!seriesId,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 0,
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
    clearCatalogCache();
    try {
      await get<IptvIndex>('iptv-playlist?refresh=1');
    } finally {
      clearCatalogCache();
      qc.removeQueries({ queryKey: ['iptv-index'] });
      qc.removeQueries({ queryKey: ['iptv-channels'] });
      qc.removeQueries({ queryKey: ['iptv-search'] });
      qc.removeQueries({ queryKey: ['iptv-series'] });
      await qc.refetchQueries({ queryKey: ['iptv-index'] });
    }

  };
}
