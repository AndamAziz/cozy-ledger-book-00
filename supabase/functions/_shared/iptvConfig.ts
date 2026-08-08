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

/** Per-channel HTTP headers a playlist may declare (Referer-protected feeds). */
export interface M3uStreamHeaders {
  referer?: string
  userAgent?: string
  origin?: string
  cookie?: string
}

export interface M3uEntry {
  id: string
  name: string
  logo: string | null
  group: string
  kind: M3uKind
  url: string
  /** Present only when the playlist declared custom headers for this channel. */
  headers?: M3uStreamHeaders
  /** Season / episode parsed out of the title when it looks like a series. */
  season: number | null
  episode: number | null
  /** Series grouping key (title without the SxxExx suffix). */
  seriesKey: string | null
}

const HEADER_KEYS: Record<string, keyof M3uStreamHeaders> = {
  referer: 'referer',
  referrer: 'referer',
  'http-referer': 'referer',
  'http-referrer': 'referer',
  'user-agent': 'userAgent',
  'http-user-agent': 'userAgent',
  origin: 'origin',
  'http-origin': 'origin',
  cookie: 'cookie',
  'http-cookie': 'cookie',
}

function setHeader(bag: M3uStreamHeaders, rawKey: string, rawValue: string) {
  const key = HEADER_KEYS[rawKey.trim().toLowerCase()]
  const value = rawValue.trim().replace(/^["']|["']$/g, '')
  if (key && value) bag[key] = value
}

/** `key=value&key2=value2` header strings used by Kodi/inputstream props. */
function parseHeaderString(bag: M3uStreamHeaders, raw: string) {
  for (const pair of raw.split(/[&|]/)) {
    const eq = pair.indexOf('=')
    if (eq > 0) setHeader(bag, pair.slice(0, eq), decodeURIComponent(pair.slice(eq + 1)))
  }
}

/** Folds a `|Referer=...&User-Agent=...` URL suffix into the header bag. */
function splitUrlHeaders(line: string, bag: M3uStreamHeaders): string {
  const pipe = line.indexOf('|')
  if (pipe < 0) return line
  parseHeaderString(bag, line.slice(pipe + 1))
  return line.slice(0, pipe)
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
  // Header hints may appear before OR after #EXTINF, so the bag is only reset
  // once the channel's URL line has been consumed.
  let bag: M3uStreamHeaders = {}

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (/^#EXTINF/i.test(line)) {
      // The display name is everything after the LAST attribute value, because
      // attributes themselves often contain commas (group-title="News, Sport").
      const lastQuote = line.lastIndexOf('"')
      const tail = lastQuote >= 0 ? line.slice(lastQuote + 1) : line
      const comma = tail.indexOf(',')
      const rawName = comma >= 0 ? tail.slice(comma + 1) : lastQuote >= 0 ? '' : tail.split(',').slice(1).join(',')
      const name = (rawName || attr(line, 'tvg-name')).trim() || 'Untitled'

      // Some playlists put the header right on the EXTINF attribute list.
      for (const m of line.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) setHeader(bag, m[1], m[2])
      pending = {
        name,
        logo: attr(line, 'tvg-logo') || attr(line, 'logo'),
        group: attr(line, 'group-title') || 'Other',
      }
      continue
    }
    if (/^#EXTVLCOPT/i.test(line)) {
      // #EXTVLCOPT:http-referrer=https://site/
      const body = line.replace(/^#EXTVLCOPT:?/i, '')
      const eq = body.indexOf('=')
      if (eq > 0) setHeader(bag, body.slice(0, eq), body.slice(eq + 1))
      continue
    }
    if (/^#EXTHTTP/i.test(line)) {
      // #EXTHTTP:{"User-Agent":"...","Referer":"..."}
      try {
        const obj = JSON.parse(line.replace(/^#EXTHTTP:?/i, '').trim())
        if (obj && typeof obj === 'object') {
          for (const [k, v] of Object.entries(obj)) if (typeof v === 'string') setHeader(bag, k, v)
        }
      } catch { /* malformed metadata is ignored, never fatal */ }
      continue
    }
    if (/^#KODIPROP/i.test(line)) {
      // #KODIPROP:inputstream.adaptive.stream_headers=User-Agent=...&Referer=...
      const body = line.replace(/^#KODIPROP:?/i, '')
      const eq = body.indexOf('=')
      if (eq > 0) {
        const prop = body.slice(0, eq).toLowerCase()
        const value = body.slice(eq + 1)
        if (prop.includes('headers')) parseHeaderString(bag, value)
        else setHeader(bag, prop.split('.').pop() ?? '', value)
      }
      continue
    }
    if (line.startsWith('#')) continue
    if (!/^https?:\/\//i.test(line)) {
      pending = null
      bag = {}
      continue
    }

    const meta = pending ?? { name: 'Untitled', logo: '', group: 'Other' }
    pending = null
    const headers: M3uStreamHeaders = { ...bag }
    bag = {}
    // The `|Referer=...` suffix is folded into the headers, never played as URL.
    const url = splitUrlHeaders(line, headers)
    const hasHeaders = Object.values(headers).some((v) => v && v.trim())
    const kind = classify(meta.name, url)
    const m = meta.name.match(SERIES_RE)
    // Hash the RAW line so ids stay stable across this parser change.
    let id = hashId(line)
    while (seen.has(id)) id += 'x'
    seen.add(id)
    out.push({
      id,
      name: meta.name,
      logo: /^https?:\/\//i.test(meta.logo) ? meta.logo : null,
      group: meta.group || 'Other',
      kind,
      url,
      ...(hasHeaders ? { headers } : {}),
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
  /** True when the transfer was cut short — such a snapshot is never persisted. */
  partial?: boolean
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
  // PARSER_VERSION is part of the hash so a parser upgrade (e.g. per-channel
  // header extraction) invalidates previously cached parses instead of reusing
  // entries that lack the new fields.
  const version = hashId(
    `${PARSER_VERSION}|${entries.length}|${etag ?? ''}|${entries[0]?.id ?? ''}|${entries[entries.length - 1]?.id ?? ''}`,
  )

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


/* ------------------------------------------------------------------ *
 * Shared (cross-isolate) snapshot cache
 *
 * Edge isolates are short-lived, so an in-memory cache alone means every cold
 * start re-downloads the provider's whole playlist (tens of MB for accounts
 * with big Movies/Series catalogues). That is what made /live-tv slow and made
 * Movies/Series fail with "error reading a body from connection". Parsed
 * snapshots are therefore persisted gzipped in the database and shared by all
 * isolates.
 * ------------------------------------------------------------------ */

const SHARED_TTL = 6 * 60 * 60 * 1000
/** Last-known-good catalogues remain safe to serve during a provider outage. */
const SHARED_STALE_MAX = 7 * 24 * 60 * 60 * 1000

const REST = () => {
  const base = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  return base && key ? { base: base.replace(/\/$/, ''), key } : null
}

async function gzip(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  const buf = new Uint8Array(await new Response(stream).arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(bin)
}

async function gunzip(b64: string): Promise<string> {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return await new Response(stream).text()
}

async function loadShared(url: string, maxAge = SHARED_TTL): Promise<M3uSnapshot | null> {
  const rest = REST()
  if (!rest) return null
  try {
    const res = await fetch(
      `${rest.base}/rest/v1/iptv_playlist_cache?url_hash=eq.${hashId(url)}&select=entries_gz,etag,last_modified,updated_at,version`,
      { headers: { apikey: rest.key, Authorization: `Bearer ${rest.key}` } },
    )
    if (!res.ok) return null
    const rows = (await res.json()) as {
      entries_gz: string
      etag: string | null
      last_modified: string | null
      updated_at: string
      version: string | null
    }[]
    const row = rows?.[0]
    if (!row) return null
    const at = Date.parse(row.updated_at)
    if (!Number.isFinite(at) || Date.now() - at > maxAge) return null
    const entries = JSON.parse(await gunzip(row.entries_gz)) as M3uEntry[]
    if (!entries.length) return null
    const snap = snapshot(url, entries, row.etag, row.last_modified)
    // A row written by an older parser is dropped, so upgrades (per-channel
    // headers, new fields) take effect instead of being masked by the cache.
    if (row.version && row.version !== snap.version) return null
    return { ...snap, at }
  } catch {
    return null
  }
}


async function saveShared(snap: M3uSnapshot): Promise<void> {
  const rest = REST()
  // Never persist a truncated catalogue: it would be served to every isolate.
  if (!rest || !snap.entries.length || snap.partial) return
  try {
    const entries_gz = await gzip(JSON.stringify(snap.entries))
    await fetch(`${rest.base}/rest/v1/iptv_playlist_cache?on_conflict=url_hash`, {
      method: 'POST',
      headers: {
        apikey: rest.key,
        Authorization: `Bearer ${rest.key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        url_hash: hashId(snap.url),
        version: snap.version,
        entries_gz,
        etag: snap.etag,
        last_modified: snap.lastModified,
        updated_at: new Date().toISOString(),
      }),
    })
  } catch {
    // caching is best-effort
  }
}

/**
 * Read the body chunk by chunk and keep whatever arrived when the connection
 * drops mid-transfer. Huge playlists frequently get cut off by the provider;
 * a partial playlist is far better than a failed section, but the caller must
 * know it was truncated so a 78-channel fragment never replaces a 5k catalogue.
 */
async function readTolerant(res: Response): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: '', truncated: false }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const expected = Number(res.headers.get('content-length') ?? '') || 0
  let text = ''
  let bytes = 0
  let truncated = false
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } catch {
    // truncated transfer — keep what we have
    truncated = true
  }
  if (expected && bytes < expected) truncated = true
  try {
    await reader.cancel()
  } catch {
    // already closed
  }
  return { text, truncated }
}


/**
 * Conditional fetch: when the upstream answers 304 (or serves an identical
 * body) the previous parse is reused, so a refresh costs a few bytes instead
 * of re-downloading and re-parsing the whole playlist.
 */
async function loadM3U(url: string, prev: M3uSnapshot | null, force = false): Promise<M3uSnapshot> {
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
  if (!force && prev && prev.url === url) {
    if (prev.etag) headers['If-None-Match'] = prev.etag
    if (prev.lastModified) headers['If-Modified-Since'] = prev.lastModified
  }

  /**
   * Pooled edge→relay connections are sometimes reused after the peer closed
   * them, which only fails once the body is read. Retry the whole request a
   * couple of times so a stale socket never surfaces as a dead playlist —
   * and so a mid-transfer cut never becomes the cached catalogue.
   */
  let res: Response | null = null
  let body: string | null = null
  let partial = false
  let lastError: unknown = null
  const ATTEMPTS = 4
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      res = await egressFetch(url, { headers, signal: AbortSignal.timeout(60_000) })
      if (res.status === 304) break
      // 5xx / 429 from the relay or panel are usually transient — retry instead
      // of surfacing them as a permanently dead playlist.
      if (!res.ok) {
        if ((res.status >= 500 || res.status === 429) && attempt < ATTEMPTS - 1) {
          await res.body?.cancel().catch(() => {})
          const retried = res
          res = null
          lastError = new Error(`Playlist unavailable (${retried.status})`)
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
          continue
        }
        break
      }
      const read = await readTolerant(res)
      // Keep the longest body seen so far: a later attempt may cut off earlier.
      if (read.text.length > (body?.length ?? 0)) {
        body = read.text
        partial = read.truncated
      }
      // A complete read wins immediately; a truncated one is retried because a
      // fragment would otherwise be cached as the whole catalogue.
      if (read.text.length && !read.truncated) {
        partial = false
        break
      }
      if (attempt === ATTEMPTS - 1) break

      lastError = new Error('Playlist transfer was truncated')
      res = null
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    } catch (e) {
      lastError = e
      res = null
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
    }
  }

  if (!res && body === null) {
    // A direct stream link that refuses a plain GET is still playable through
    // the proxy — expose it as one channel rather than killing the source.
    if (isDirectStreamUrl(url)) return directStreamSnapshot(url)
    throw (lastError instanceof Error ? lastError : new Error('Playlist unavailable'))
  }

  if (res && res.status === 304 && prev) {
    await res.body?.cancel()
    return { ...prev, at: Date.now() }
  }
  if (res && !res.ok && body === null) {
    if (isDirectStreamUrl(url)) return directStreamSnapshot(url)
    throw new Error(`Playlist unavailable (${res.status})`)
  }


  const etag = res?.headers.get('etag') ?? null
  const lastModified = res?.headers.get('last-modified') ?? null

  // Same validator with a 200 response: skip the parse entirely.
  if (!force && prev && prev.url === url && etag && etag === prev.etag) {
    return { ...prev, at: Date.now(), lastModified: lastModified ?? prev.lastModified }
  }

  // An HLS media/master manifest is ONE stream, not a channel list — its
  // #EXTINF lines are segments/variants, so never parse them as channels.
  if (HLS_STREAM_RE.test(body ?? '')) return directStreamSnapshot(url)

  const entries = parseM3U(body ?? '')
  // Some providers hand out a bare stream URL (or a body we cannot parse) —
  // treat that as a single channel instead of failing the whole source.
  if (!entries.length) {
    if (prev?.entries.length) return { ...prev, at: Date.now() }
    return directStreamSnapshot(url)
  }

  // A truncated download that lost most of the catalogue must never replace a
  // known-good snapshot (this is what reduced a 5k-channel source to ~78).
  if (partial && prev && prev.entries.length > entries.length * 1.2) {
    console.warn(
      `[iptv] truncated playlist ignored: ${entries.length} entries vs cached ${prev.entries.length}`,
    )
    return { ...prev, at: Date.now() }
  }
  if (partial) {
    console.warn(`[iptv] playlist truncated mid-transfer, kept ${entries.length} entries`)
  }

  const next = { ...snapshot(url, entries, partial ? null : etag, partial ? null : lastModified), partial }
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
export async function getM3U(url: string, force = false): Promise<M3uSnapshot> {

  // Direct media links (.ts / .mp4 / extension-less Xtream stream paths) are
  // never downloaded here — a raw feed would stream forever. Wrap them as a
  // one-channel playlist immediately. `.m3u8` is still fetched: it may be a
  // real multi-channel playlist, and loadM3U detects the manifest case.
  if (isDirectStreamUrl(url) && !/\.m3u8(\?|#|$)/i.test(url)) {
    const cached = m3uCache.get(url)
    if (cached) return cached
    const snap = directStreamSnapshot(url)
    m3uCache.set(url, snap)
    return snap
  }

  const hit = m3uCache.get(url) ?? null

  // A truncated snapshot is never treated as fresh — refetch it right away so a
  // fragment of the catalogue cannot linger for hours.
  const usable = hit && !hit.partial ? hit : null

  if (!force && usable && Date.now() - usable.at < M3U_TTL) return usable

  if (!force && usable && Date.now() - usable.at < M3U_STALE_MAX) {
    if (!revalidating.has(url)) {
      revalidating.add(url)
      loadM3U(url, usable)
        .then((c) => {
          m3uCache.set(url, c)
          return saveShared(c)
        })
        .catch(() => {
          // keep serving the stale snapshot
        })
        .finally(() => {
          revalidating.delete(url)
        })
    }
    return usable
  }

  let pending = force ? undefined : m3uLoading.get(url)
  if (!pending) {
    pending = (async () => {
      // Cold isolate: reuse the snapshot another isolate already downloaded
      // instead of pulling the entire catalogue from the provider again.
      if (!force) {
        const shared = await loadShared(url)
        if (shared) return shared
      }

      // Keep a last-known-good snapshot in reserve. Relay/provider 5xx responses
      // are often brief; returning an older valid catalogue is preferable to a
      // blank Live TV screen while the upstream recovers.
      const stale = usable ?? (await loadShared(url, SHARED_STALE_MAX))
      try {
        const fresh = await loadM3U(url, stale, force)
        await saveShared(fresh)
        return fresh
      } catch (error) {
        if (stale) return stale
        throw error
      }
    })()

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

