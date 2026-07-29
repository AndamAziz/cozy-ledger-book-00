import { createClient } from 'npm:@supabase/supabase-js@2'

export const IPTV_SETTING_KEY = 'iptv_playlist_url'

const CACHE_TTL = 60 * 1000
let cached: { url: string; at: number } | null = null

/**
 * Resolve the active IPTV playlist URL.
 * Priority: admin-managed value in `app_settings` → the IPTV_PLAYLIST_URL secret.
 */
export async function getPlaylistUrl(): Promise<string> {
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.url

  const fallback = Deno.env.get('IPTV_PLAYLIST_URL') ?? ''
  let url = fallback

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', IPTV_SETTING_KEY)
      .maybeSingle()
    if (data?.value && typeof data.value === 'string' && data.value.trim()) {
      url = data.value.trim()
    }
  } catch (_e) {
    // Fall back to the secret when the settings lookup fails.
  }

  cached = { url, at: Date.now() }
  return url
}

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

const UA = 'VLC/3.0.20 LibVLC/3.0.20'
const M3U_TTL = 30 * 60 * 1000
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

/** Parse a standard #EXTM3U playlist into normalised entries. */
export function parseM3U(text: string): M3uEntry[] {
  const out: M3uEntry[] = []
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
    out.push({
      id: `m${out.length}`,
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

let m3uCache: { url: string; at: number; entries: M3uEntry[]; byId: Map<string, M3uEntry>; hosts: Set<string> } | null = null
let m3uLoading: Promise<NonNullable<typeof m3uCache>> | null = null

async function loadM3U(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Playlist unavailable (${res.status})`)
  const entries = parseM3U(await res.text())
  if (!entries.length) throw new Error('Playlist contains no channels')
  const byId = new Map(entries.map((e) => [e.id, e]))
  const hosts = new Set<string>()
  for (const e of entries) {
    try {
      hosts.add(new URL(e.url).host)
    } catch {
      // ignore malformed rows
    }
  }
  return { url, at: Date.now(), entries, byId, hosts }
}

/** Fetch + parse the configured plain M3U playlist, cached in memory. */
export async function getM3U(url: string) {
  if (m3uCache && m3uCache.url === url && Date.now() - m3uCache.at < M3U_TTL) return m3uCache
  if (!m3uLoading) {
    m3uLoading = loadM3U(url)
      .then((c) => {
        m3uCache = c
        return c
      })
      .finally(() => {
        m3uLoading = null
      })
  }
  return m3uLoading
}
