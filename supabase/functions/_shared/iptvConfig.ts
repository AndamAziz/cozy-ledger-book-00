import { egressFetch } from './iptvEgress.ts'

/**
 * NOTE: there is deliberately no platform-wide playlist URL any more. The
 * provider forbids a single shared server, so every request resolves the
 * caller's personal credentials via `_shared/iptvViewer.ts`.
 */


/** Parse Xtream credentials out of an M3U playlist URL. */
export function parseXtream(raw: string) {
  const u = new URL(raw)
  return {
    host: u.host,
    protocol: u.protocol,
    username: u.searchParams.get('username') ?? '',
    password: u.searchParams.get('password') ?? '',
  }
}

/** True when the link looks like an Xtream Codes API playlist (has username + password). */
export function isXtreamUrl(raw: string) {
  try {
    const u = new URL(raw)
    return !!(u.searchParams.get('username') && u.searchParams.get('password'))
  } catch {
    return false
  }
}


/* ------------------------------------------------------------------ *
 * Plain M3U / M3U8 playlist support
 * ------------------------------------------------------------------ */

/** Media extensions that mean "this URL is one stream", not a channel list. */
const DIRECT_STREAM_EXT = /\.(m3u8|ts|mp4|mkv|avi|m4v|mov|mpd|flv|webm)(\?|#|$)/i

/**
 * True when the link points at a single playable stream (an HLS manifest, a raw
 * MPEG-TS feed, a progressive file …) rather than a multi-channel M3U playlist.
 * `.m3u`/`.m3u8` are ambiguous, so `.m3u8` only counts as direct when the path
 * is not a classic playlist endpoint (get.php / playlist / channels …).
 */
export function isDirectStreamUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (isXtreamUrl(raw)) return false
  const path = u.pathname
  if (/\/(get\.php|player_api\.php|playlist|list|channels|panel_api\.php)/i.test(path)) return false
  if (/\.m3u(\?|#|$)/i.test(path)) return false
  if (DIRECT_STREAM_EXT.test(path)) return true
  // Xtream-style direct stream paths without an extension: /live/user/pass/123
  return /\/(live|movie|series)\/[^/]+\/[^/]+\/\d+$/i.test(path)
}

/** HLS manifest markers that only ever appear inside a single stream's playlist. */
const HLS_STREAM_RE = /#EXT-X-(TARGETDURATION|MEDIA-SEQUENCE|STREAM-INF|ENDLIST|PLAYLIST-TYPE|MAP|KEY)/i



export type M3uKind = 'live' | 'vod' | 'series'

export interface M3uEntry {
  id: string
  name: string
  logo: string | null
  group: string
  kind: M3uKind
  url: string
  /** Season / episode parsed out of the title when it looks like a series. */
  season: number | null
  episode: number | null
  /** Series grouping key (title without the SxxExx suffix). */
  seriesKey: string | null
}

const UA = 'IPTVSmartersPro/4.0.4 (Linux; Android 12) ExoPlayerLib/2.19.1'
const M3U_TTL = 30 * 60 * 1000
/** Beyond the TTL the cached parse is still served while it revalidates. */
const M3U_STALE_MAX = 6 * 60 * 60 * 1000
const SERIES_RE = /\bS\s?(\d{1,2})\s?[\s._-]?E\s?(\d{1,3})\b/i

const attr = (line: string, key: string) => {
  const m = line.match(new RegExp(`${key}="([^"]*)"`, 'i'))
  return m ? m[1].trim() : ''
}

function classify(name: string, url: string): M3uKind {
  if (/\/series\//i.test(url) || SERIES_RE.test(name)) return 'series'
  if (/\/movie\//i.test(url) || /\.(mp4|mkv|avi|m4v|mov)(\?|$)/i.test(url)) return 'vod'
  return 'live'
}

/** Stable, content-derived id so cached ids survive re-parses of a changed playlist. */
const hashId = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return 'm' + (h >>> 0).toString(36)
}

/** Parse a standard #EXTM3U playlist into normalised entries. */
export function parseM3U(text: string): M3uEntry[] {
  const out: M3uEntry[] = []
  const seen = new Set<string>()
  const lines = text.split(/\r?\n/)
  let pending: { name: string; logo: string; group: string } | null = null

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (/^#EXTINF/i.test(line)) {
      const name = (line.split(',').slice(1).join(',') || attr(line, 'tvg-name')).trim() || 'Untitled'
      pending = {
        name,
        logo: attr(line, 'tvg-logo') || attr(line, 'logo'),
        group: attr(line, 'group-title') || 'Other',
      }
      continue
    }
    if (line.startsWith('#')) continue
    if (!/^https?:\/\//i.test(line)) {
      pending = null
      continue
    }

    const meta = pending ?? { name: 'Untitled', logo: '', group: 'Other' }
    pending = null
    const kind = classify(meta.name, line)
    const m = meta.name.match(SERIES_RE)
    let id = hashId(line)
    while (seen.has(id)) id += 'x'
    seen.add(id)
    out.push({
      id,
      name: meta.name,
      logo: /^https?:\/\//i.test(meta.logo) ? meta.logo : null,
      group: meta.group || 'Other',
      kind,
      url: line,
      season: m ? Number(m[1]) : null,
      episode: m ? Number(m[2]) : null,
      seriesKey: kind === 'series' ? meta.name.replace(SERIES_RE, '').replace(/[\s._-]+$/, '').trim() || meta.name : null,
    })
  }
  return out
}

export interface M3uSnapshot {
  url: string
  at: number
  entries: M3uEntry[]
  byId: Map<string, M3uEntry>
  hosts: Set<string>
  /** Changes only when the parsed content changes — safe as an ETag / derived-cache key. */
  version: string
  etag: string | null
  lastModified: string | null
}

const M3U_CACHE_MAX = 8
const m3uCache = new Map<string, M3uSnapshot>()
const m3uLoading = new Map<string, Promise<M3uSnapshot>>()
const revalidating = new Set<string>()

function snapshot(
  url: string,
  entries: M3uEntry[],
  etag: string | null,
  lastModified: string | null,
): M3uSnapshot {
  const byId = new Map(entries.map((e) => [e.id, e]))
  const hosts = new Set<string>()
  for (const e of entries) {
    try {
      hosts.add(new URL(e.url).host)
    } catch {
      // ignore malformed rows
    }
  }
  const version = hashId(`${entries.length}|${etag ?? ''}|${entries[0]?.id ?? ''}|${entries[entries.length - 1]?.id ?? ''}`)
  return { url, at: Date.now(), entries, byId, hosts, version, etag, lastModified }
}

/** Human-friendly channel name for a direct stream link. */
function directStreamName(url: string): string {
  try {
    const u = new URL(url)
    const file = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '')
    const clean = file.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[._-]+/g, ' ').trim()
    return clean || u.host
  } catch {
    return 'Live stream'
  }
}

/**
 * A single direct stream link (.m3u8 / .ts / .mp4 …) is wrapped as a one-channel
 * playlist so the whole catalogue/proxy/player pipeline keeps working unchanged
 * instead of failing with "no channels were returned".
 */
export function directStreamSnapshot(url: string): M3uSnapshot {
  const ext = (url.match(DIRECT_STREAM_EXT)?.[1] ?? '').toLowerCase()
  const kind: M3uKind = /^(mp4|mkv|avi|m4v|mov|webm)$/.test(ext) ? 'vod' : 'live'
  const entry: M3uEntry = {
    id: hashId(url),
    name: directStreamName(url),
    logo: null,
    group: kind === 'vod' ? 'Direct link' : 'Direct stream',
    kind,
    url,
    season: null,
    episode: null,
    seriesKey: null,
  }
  return snapshot(url, [entry], null, null)
}


/**
 * Conditional fetch: when the upstream answers 304 (or serves an identical
 * body) the previous parse is reused, so a refresh costs a few bytes instead
 * of re-downloading and re-parsing the whole playlist.
 */
async function loadM3U(url: string, prev: M3uSnapshot | null): Promise<M3uSnapshot> {
  const parsedUrl = new URL(url)
  const headers: Record<string, string> = {
    'User-Agent': UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    // Avoid a compressed hop through the relay: a truncated gzip stream shows up
    // as "error reading a body from connection" when the text is read.
    'Accept-Encoding': 'identity',
    'Referer': `${parsedUrl.protocol}//${parsedUrl.host}/`,
    'Origin': `${parsedUrl.protocol}//${parsedUrl.host}`,
    'X-Requested-With': 'com.nathnetwork.xciptv',
  }
  if (prev && prev.url === url) {
    if (prev.etag) headers['If-None-Match'] = prev.etag
    if (prev.lastModified) headers['If-Modified-Since'] = prev.lastModified
  }

  /**
   * Pooled edge→relay connections are sometimes reused after the peer closed
   * them, which only fails once the body is read. Retry the whole request a
   * couple of times so a stale socket never surfaces as a dead playlist.
   */
  let res: Response | null = null
  let body: string | null = null
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await egressFetch(url, { headers, signal: AbortSignal.timeout(30_000) })
      if (res.status === 304 || !res.ok) break
      body = await res.text()
      break
    } catch (e) {
      lastError = e
      res = null
      body = null
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
    }
  }
  if (!res) throw (lastError instanceof Error ? lastError : new Error('Playlist unavailable'))

  if (res.status === 304 && prev) {
    await res.body?.cancel()
    return { ...prev, at: Date.now() }
  }
  if (!res.ok) throw new Error(`Playlist unavailable (${res.status})`)

  const etag = res.headers.get('etag')
  const lastModified = res.headers.get('last-modified')

  // Same validator with a 200 response: skip the parse entirely.
  if (prev && prev.url === url && etag && etag === prev.etag) {
    return { ...prev, at: Date.now(), lastModified: lastModified ?? prev.lastModified }
  }

  // An HLS media/master manifest is ONE stream, not a channel list — its
  // #EXTINF lines are segments/variants, so never parse them as channels.
  if (HLS_STREAM_RE.test(body ?? '')) return directStreamSnapshot(url)

  const entries = parseM3U(body ?? '')
  // Some providers hand out a bare stream URL (or a body we cannot parse) —
  // treat that as a single channel instead of failing the whole source.
  if (!entries.length) return directStreamSnapshot(url)

  const next = snapshot(url, entries, etag, lastModified)
  // Unchanged content: keep the previous object identity so derived caches stay warm.
  if (prev && prev.url === url && prev.version === next.version) {
    return { ...prev, at: Date.now(), etag, lastModified }
  }
  return next
}


/**
 * Fetch + parse a plain M3U playlist.
 * Fresh cache → instant. Stale cache → served immediately while a conditional
 * revalidation runs in the background (stale-while-revalidate).
 *
 * Cached per playlist URL: every user streams from their own server, so a
 * single-slot cache would thrash between accounts.
 */
export async function getM3U(url: string): Promise<M3uSnapshot> {
  // Direct single-stream links are never downloaded here: a raw .ts feed would
  // stream forever. Wrap them as a one-channel playlist immediately.
  if (isDirectStreamUrl(url)) {
    const cached = m3uCache.get(url)
    if (cached) return cached
    const snap = directStreamSnapshot(url)
    m3uCache.set(url, snap)
    return snap
  }

  const hit = m3uCache.get(url) ?? null


  if (hit && Date.now() - hit.at < M3U_TTL) return hit

  if (hit && Date.now() - hit.at < M3U_STALE_MAX) {
    if (!revalidating.has(url)) {
      revalidating.add(url)
      loadM3U(url, hit)
        .then((c) => {
          m3uCache.set(url, c)
        })
        .catch(() => {
          // keep serving the stale snapshot
        })
        .finally(() => {
          revalidating.delete(url)
        })
    }
    return hit
  }

  let pending = m3uLoading.get(url)
  if (!pending) {
    pending = loadM3U(url, hit)
      .then((c) => {
        m3uCache.set(url, c)
        if (m3uCache.size > M3U_CACHE_MAX) {
          const oldest = [...m3uCache.entries()].sort((a, b) => a[1].at - b[1].at)[0]
          if (oldest) m3uCache.delete(oldest[0])
        }
        return c
      })
      .finally(() => {
        m3uLoading.delete(url)
      })
    m3uLoading.set(url, pending)
  }
  return pending
}

