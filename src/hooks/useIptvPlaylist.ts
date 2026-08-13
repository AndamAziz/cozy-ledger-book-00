import { useSyncExternalStore } from 'react';
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
  /**
   * First page of channels, delivered inside the index so a category renders
   * instantly instead of waiting for its own request behind the provider's
   * single-connection queue.
   */
  preview?: IptvChannel[];
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
/**
 * Catalogue requests must not fire before we know WHICH provider to ask:
 * firing an unscoped index first made every visit pay the (single-connection)
 * provider round-trip twice.
 */
let sourceResolved = false;
const readyListeners = new Set<() => void>();
export function setActiveSourceId(id: string | null) {
  activeSourceId = id;
  sourceResolved = true;
  readyListeners.forEach((l) => l());
}
export function useSourceReady(): boolean {
  return useSyncExternalStore(
    (cb) => {
      readyListeners.add(cb);
      return () => readyListeners.delete(cb);
    },
    () => sourceResolved,
    () => false,
  );
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
  // `soft=1` keeps expected provider refusals (single-slot busy / throttled)
  // from becoming uncaught browser-level 4xx runtime errors. The body still
  // carries the exact machine code and the player diagnoses it normally.
  return `${FN_BASE}/iptv-stream?id=${encodeURIComponent(channelId)}&kind=${kind}${extPart}${rawPart}${sourceParam()}&soft=1&apikey=${ANON}${tokenPart}`;
}

/**
 * Live container capabilities of the active provider (`allowed_output_formats`).
 *
 * TS-only panels refuse `.m3u8` with a private status that reads like a slot
 * limit, so the player must lead its engine ladder with mpegts.js for them
 * instead of letting hls.js commit to a manifest that will never exist. The
 * handshake is memoised per source for the session (the server caches too).
 */
export type LiveFormatInfo = { formats: string[]; tsOnly: boolean; hls: boolean };
const formatCache = new Map<string, Promise<LiveFormatInfo>>();

export function fetchLiveFormats(): Promise<LiveFormatInfo> {
  const key = activeSourceId ?? 'default';
  const hit = formatCache.get(key);
  if (hit) return hit;
  const tokenPart = accessToken ? `&token=${encodeURIComponent(accessToken)}` : '';
  const p = fetch(
    `${FN_BASE}/iptv-stream?info=1${sourceParam()}&apikey=${ANON}${tokenPart}`,
    { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined },
  )
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => ({
      formats: Array.isArray(j?.formats) ? (j.formats as string[]) : [],
      tsOnly: Boolean(j?.tsOnly),
      hls: Boolean(j?.hls),
    }))
    .catch(() => ({ formats: [], tsOnly: false, hls: false }));
  formatCache.set(key, p);
  return p;
}


/**
 * Direct-play resolution.
 *
 * Media bytes must NOT travel through the Edge Function: that hop is what made
 * Live TV and VOD stall (function CPU/wall-clock limits + an extra network leg).
 * We therefore ask the function for the provider's final (tokenized) media URL
 * and let the browser stream straight from the provider/CDN. Only https targets
 * qualify — an http URL is blocked as mixed content on our https origin, so
 * those channels transparently keep using the proxy path.
 *
 * Resolutions are memoised briefly so zapping does not re-handshake.
 */
const directCache = new Map<string, { url: string | null; at: number }>();
const DIRECT_TTL_MS = 60_000;

/**
 * Not every provider sends CORS headers, and some geo-block whole regions, so
 * direct playback can be impossible for a given viewer/provider pair. The first
 * failure is remembered per source (6h) so the viewer pays that probe once
 * instead of on every channel.
 */
const BLOCK_TTL_MS = 6 * 60 * 60 * 1000;
const blockKey = () => `iptv-direct-blocked:${activeSourceId ?? 'default'}`;

function directBlocked(): boolean {
  try {
    const at = Number(localStorage.getItem(blockKey()) ?? '0');
    return at > 0 && Date.now() - at < BLOCK_TTL_MS;
  } catch {
    return false;
  }
}

export async function resolveDirectUrl(
  channelId: string,
  kind: IptvKind = 'live',
  ext?: string,
  raw = false,
): Promise<string | null> {
  if (directBlocked()) return null;
  const key = `${activeSourceId ?? 'default'}|${channelId}|${kind}|${ext ?? ''}|${raw ? 1 : 0}`;
  const hit = directCache.get(key);
  if (hit && Date.now() - hit.at < DIRECT_TTL_MS) return hit.url;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? accessToken;
    const extPart = ext ? `&ext=${encodeURIComponent(ext)}` : '';
    // Manual abort timer (AbortSignal.timeout is missing on older WebViews/TVs).
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    const res = await fetch(
      `${FN_BASE}/iptv-stream?id=${encodeURIComponent(channelId)}&kind=${kind}${extPart}${raw ? '&raw=1' : ''}${sourceParam()}&resolve=1&apikey=${ANON}`,
      { headers: { apikey: ANON, Authorization: `Bearer ${token ?? ANON}` }, signal: ac.signal },
    );
    clearTimeout(timer);
    const json = await res.json().catch(() => null);
    const url = res.ok && json?.direct && typeof json.url === 'string' ? (json.url as string) : null;
    directCache.set(key, { url, at: Date.now() });
    return url;
  } catch {
    directCache.set(key, { url: null, at: Date.now() });
    return null;
  }
}

/**
 * A direct URL failed to play (CORS-less provider, geo-block, expired token):
 * forget it and stop attempting direct playback for this source for a while, so
 * playback falls back to the proxy immediately on the next channel.
 */
export function invalidateDirectUrl(channelId: string) {
  for (const key of [...directCache.keys()]) {
    if (key.includes(`|${channelId}|`)) directCache.set(key, { url: null, at: Date.now() });
  }
  try {
    localStorage.setItem(blockKey(), String(Date.now()));
  } catch {
    // storage disabled — the in-memory cache still prevents a retry loop
  }
}





/** A path that just failed is not retried for this long (fail fast, no 20s stall). */
const FAIL_MEMO_MS = 45_000;
const failMemo = new Map<string, { at: number; err: Error }>();

/**
 * Source-level circuit breaker. When the provider panel itself is down
 * (connection dropped/refused), every category request would fail the same way,
 * so we short-circuit all of them for a while instead of firing dozens of 502s.
 */
const OUTAGE_MS = 60_000;
const outage = new Map<string, { at: number; err: Error }>();

function isOutageError(e: unknown): boolean {
  const err = e as IptvRequestError & { errorKind?: string; diagnostic?: { verdict?: string } };
  return err?.diagnostic?.verdict === 'server_down' || err?.errorKind === 'connection';
}

/**
 * Fire-and-forget background refresh. Never rejects — a provider outage during a
 * silent revalidation must not surface as an unhandled promise rejection.
 */
function revalidate<T>(path: string): void {
  try {
    void get<T>(path, { background: true }).catch(() => undefined);
  } catch {
    // ignore
  }
}


async function get<T>(path: string, opts: { cache?: boolean; background?: boolean } = {}): Promise<T> {
  const useCache = opts.cache !== false && !path.includes('refresh=1');
  const cacheKey = `${activeSourceId ?? 'default'}|${path}`;
  const sourceKey = activeSourceId ?? 'default';
  // Last-known-good payload, used to keep the UI alive when the panel is down.
  const stale = useCache ? readCatalogEntry<T>(cacheKey) : null;
  if (useCache) {
    // Stale entries are served instantly and refreshed in the background: the
    // provider allows one connection at a time, so waiting is what felt slow.
    if (stale) {
      if (!stale.fresh && !opts.background) revalidate<T>(path);
      return stale.value;
    }
    const failed = failMemo.get(cacheKey);
    if (failed && Date.now() - failed.at < FAIL_MEMO_MS) throw failed.err;
  }

  // Panel-level outage applies to every request (even refresh=1), otherwise a
  // dead provider produces one 502 per category.
  const downNow = outage.get(sourceKey);
  if (downNow && Date.now() - downNow.at < OUTAGE_MS) {
    if (stale) return stale.value;
    throw downNow.err;
  }

  // Foreground requests jump ahead of prefetch work and never sit behind it.
  if (!opts.background) cancelBackgroundQueue();

  return await queued(async () => {
    if (useCache) {
      // A queued duplicate may have been filled while waiting.
      const hit = readCatalogCache<T>(cacheKey);
      if (hit) return hit;
    }
    // The breaker may have tripped while this request waited in the queue.
    const down = outage.get(sourceKey);
    if (down && Date.now() - down.at < OUTAGE_MS) throw down.err;
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
      outage.delete(sourceKey);
      return json as T;
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to load playlist');
      if (e.message !== 'cancelled') {
        failMemo.set(cacheKey, { at: Date.now(), err: e });
        if (isOutageError(e)) {
          // Panel is down: stop every other pending/queued catalogue request.
          outage.set(sourceKey, { at: Date.now(), err: e });
          cancelBackgroundQueue();
        }
      }
      // Prefer showing the last-known-good catalogue over an error screen.
      const fallback = useCache ? readCatalogEntry<T>(cacheKey) : null;
      if (fallback) return fallback.value;
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
  const ready = useSourceReady();
  return useQuery({
    queryKey: ['iptv-index', activeSourceId],
    queryFn: () => get<IptvIndex>('iptv-playlist'),
    enabled: ready,
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
      await get<IptvIndex>('iptv-playlist?refresh=1').catch(() => undefined);
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
