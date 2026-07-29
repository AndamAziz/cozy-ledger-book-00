import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { getPlaylistUrl, parseXtream } from '../_shared/iptvConfig.ts'

const UA = 'VLC/3.0.20 LibVLC/3.0.20'

type Kind = 'live' | 'vod' | 'series'

interface Item {
  id: string
  name: string
  /** poster / logo, already normalised */
  logo: string | null
  categoryId: string
  kind: Kind
}
interface RawCategory {
  category_id: string
  category_name: string
}
interface CategoryInfo {
  id: string
  name: string
  count: number
  kind: Kind
}

const TTL = 30 * 60 * 1000

// The VOD/series catalogues are ~70MB each, so nothing global is kept in memory:
// the index caches category lists only and item lists are fetched per category.
let indexCache: { at: number; source: string; categories: CategoryInfo[]; total: number } | null = null
let indexLoading: Promise<NonNullable<typeof indexCache>> | null = null

function apiBase(raw: string) {
  const { protocol, host, username, password } = parseXtream(raw)
  return `${protocol}//${host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
}

/** Pick the first usable artwork field an Xtream/M3U payload may expose. */
function pickLogo(row: Record<string, unknown>): string | null {
  const keys = [
    'stream_icon',
    'cover',
    'cover_big',
    'movie_image',
    'poster',
    'thumbnail',
    'icon',
    'tvg-logo',
    'tvg_logo',
    'logo',
  ]
  for (const k of keys) {
    const v = row[k]
    if (typeof v === 'string') {
      const s = v.trim()
      if (s && s !== 'null' && /^https?:\/\//i.test(s)) return s
    }
  }
  return null
}

function toItem(r: Record<string, unknown>, kind: Kind): Item | null {
  const id = String(r.stream_id ?? r.series_id ?? '')
  if (!id || id === 'undefined') return null
  return {
    id,
    name: String(r.name ?? r.title ?? 'Untitled'),
    logo: pickLogo(r),
    categoryId: `${kind}:${String(r.category_id ?? '0')}`,
    kind,
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) return null
    const json = await res.json()
    return Array.isArray(json) ? (json as T) : null
  } catch {
    return null
  }
}

/**
 * Stream a huge Xtream JSON array and hand each object to `onRow`, without ever
 * materialising the whole payload. Returns early when `onRow` returns false.
 */
async function scanArray(url: string, onRow: (row: Record<string, unknown>) => boolean) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok || !res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let done = false

  const handle = (fragment: string) => {
    const t = fragment.trim().replace(/^\[/, '').replace(/\]$/, '').trim()
    if (!t.startsWith('{')) return true
    try {
      return onRow(JSON.parse(t) as Record<string, unknown>)
    } catch {
      return true
    }
  }

  while (!done) {
    const { value, done: finished } = await reader.read()
    if (finished) break
    buf += decoder.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('},{')) >= 0) {
      const frag = buf.slice(0, i + 1)
      buf = buf.slice(i + 2)
      if (!handle(frag)) {
        done = true
        break
      }
    }
    if (buf.length > 4_000_000) buf = buf.slice(-1_000_000) // safety valve
  }
  try {
    await reader.cancel()
  } catch {
    // stream already closed
  }
  if (!done && buf.trim()) handle(buf)
}

const ACTIONS: Record<Kind, [string, string]> = {
  live: ['get_live_categories', 'get_live_streams'],
  vod: ['get_vod_categories', 'get_vod_streams'],
  series: ['get_series_categories', 'get_series'],
}

async function buildIndex(source: string) {
  const api = apiBase(source)
  const categories: CategoryInfo[] = []
  let total = 0

  for (const kind of ['live', 'vod', 'series'] as Kind[]) {
    const cats = (await fetchJson<RawCategory[]>(`${api}&action=${ACTIONS[kind][0]}`)) ?? []
    const counts = new Map<string, number>()

    // Counting streams a category at a time keeps peak memory tiny.
    await scanArray(`${api}&action=${ACTIONS[kind][1]}`, (row) => {
      const cid = String(row.category_id ?? '0')
      counts.set(cid, (counts.get(cid) ?? 0) + 1)
      total += 1
      return true
    })

    for (const c of cats) {
      const count = counts.get(String(c.category_id)) ?? 0
      if (count > 0) {
        categories.push({ id: `${kind}:${c.category_id}`, name: c.category_name, count, kind })
      }
    }
  }

  if (!categories.length) throw new Error('Upstream returned no channels')
  return { at: Date.now(), source, categories, total }
}

async function getIndex(source: string) {
  if (indexCache && indexCache.source === source && Date.now() - indexCache.at < TTL) return indexCache
  if (!indexLoading) {
    indexLoading = buildIndex(source)
      .then((i) => {
        indexCache = i
        return i
      })
      .finally(() => {
        indexLoading = null
      })
  }
  return indexLoading
}

const kindOf = (categoryId: string): Kind => {
  const prefix = categoryId.split(':')[0]
  return prefix === 'vod' || prefix === 'series' ? prefix : 'live'
}

const shape = (s: Item, group: string) => ({
  id: s.id,
  name: s.name,
  logo: s.logo,
  group,
  kind: s.kind,
})

interface EpisodeOut {
  id: string
  season: number
  episode: number
  title: string
  cover: string | null
  ext: string
  plot: string | null
  duration: string | null
}

/** Fetch season/episode structure for one series via Xtream get_series_info. */
async function getSeriesInfo(api: string, seriesId: string) {
  const res = await fetch(`${api}&action=get_series_info&series_id=${encodeURIComponent(seriesId)}`, {
    headers: { 'User-Agent': UA },
  })
  if (!res.ok) throw new Error(`Series unavailable (${res.status})`)
  const data = (await res.json()) as Record<string, unknown>

  const info = (data.info ?? {}) as Record<string, unknown>
  const rawEpisodes = (data.episodes ?? {}) as Record<string, unknown>

  const seasons: { season: number; episodes: EpisodeOut[] }[] = []
  for (const [key, value] of Object.entries(rawEpisodes)) {
    if (!Array.isArray(value)) continue
    const seasonNum = Number(key) || 0
    const episodes: EpisodeOut[] = []
    for (const raw of value as Record<string, unknown>[]) {
      const id = String(raw.id ?? '')
      if (!id) continue
      const epInfo = (raw.info ?? {}) as Record<string, unknown>
      const num = Number(raw.episode_num ?? epInfo.episode_num ?? episodes.length + 1) || episodes.length + 1
      episodes.push({
        id,
        season: Number(raw.season ?? seasonNum) || seasonNum,
        episode: num,
        title: String(raw.title ?? epInfo.name ?? `Episode ${num}`),
        cover: pickLogo(epInfo) ?? pickLogo(raw),
        ext: String(raw.container_extension ?? 'mp4').replace(/[^a-z0-9]/gi, '') || 'mp4',
        plot: typeof epInfo.plot === 'string' && epInfo.plot.trim() ? epInfo.plot.trim() : null,
        duration: typeof epInfo.duration === 'string' ? epInfo.duration : null,
      })
    }
    if (episodes.length) {
      episodes.sort((a, b) => a.episode - b.episode)
      seasons.push({ season: seasonNum, episodes })
    }
  }
  seasons.sort((a, b) => a.season - b.season)
  if (!seasons.length) throw new Error('No episodes found for this series')

  return {
    id: seriesId,
    name: String(info.name ?? info.title ?? 'Series'),
    cover: pickLogo(info),
    plot: typeof info.plot === 'string' ? info.plot : null,
    seasons,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const source = await getPlaylistUrl()
    if (!source) return json({ error: 'Playlist not configured' }, 500)

    const url = new URL(req.url)
    const seriesId = url.searchParams.get('series')
    if (seriesId) {
      if (!/^\d+$/.test(seriesId)) return json({ error: 'Invalid series id' }, 400)
      return json(await getSeriesInfo(apiBase(source), seriesId))
    }

    const category = url.searchParams.get('category')
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 60) || 60, 200)
    const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0)

    const index = await getIndex(source)


    if (!category && !q) {
      return json({
        total: index.total,
        categories: index.categories,
        updatedAt: new Date(index.at).toISOString(),
      })
    }

    const api = apiBase(source)
    const nameOf = (id: string) => index.categories.find((c) => c.id === id)?.name ?? 'Other'

    let list: Item[] = []

    if (category) {
      const kind = kindOf(category)
      const rawId = category.slice(category.indexOf(':') + 1)
      const rows =
        (await fetchJson<Record<string, unknown>[]>(
          `${api}&action=${ACTIONS[kind][1]}&category_id=${encodeURIComponent(rawId)}`,
        )) ?? []
      list = rows.map((r) => toItem(r, kind)).filter((i): i is Item => !!i)
      if (q) list = list.filter((s) => s.name.toLowerCase().includes(q))
    } else {
      const kindParam = url.searchParams.get('kind')
      const kind: Kind = kindParam === 'vod' || kindParam === 'series' ? kindParam : 'live'
      const cap = offset + limit
      await scanArray(`${api}&action=${ACTIONS[kind][1]}`, (row) => {
        const name = String(row.name ?? row.title ?? '')
        if (name.toLowerCase().includes(q)) {
          const item = toItem(row, kind)
          if (item) list.push(item)
        }
        return list.length < cap + 60
      })
    }

    return json({
      total: list.length,
      channels: list.slice(offset, offset + limit).map((s) => shape(s, nameOf(s.categoryId))),
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})
