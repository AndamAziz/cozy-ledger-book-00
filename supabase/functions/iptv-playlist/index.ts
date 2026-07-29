import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { getPlaylistUrl, parseXtream, isXtreamUrl, getM3U, type M3uEntry } from '../_shared/iptvConfig.ts'

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

async function fetchJson<T>(url: string, timeoutMs = 15000): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeoutMs) })
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
  const deadline = Date.now() + 20_000
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) })
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
    if (Date.now() > deadline) break
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

/**
 * Build the section/category index WITHOUT downloading the ~280k-item stream
 * catalogues: only the (tiny) category lists are fetched, so the first paint of
 * the app is a few KB instead of ~150MB of JSON. Item counts are resolved lazily
 * when a category is actually opened.
 */
async function buildIndex(source: string) {
  const api = apiBase(source)
  const categories: CategoryInfo[] = []

  const lists = await Promise.all(
    (['live', 'vod', 'series'] as Kind[]).map(async (kind) => ({
      kind,
      cats: (await fetchJson<RawCategory[]>(`${api}&action=${ACTIONS[kind][0]}`)) ?? [],
    })),
  )

  for (const { kind, cats } of lists) {
    for (const c of cats) {
      categories.push({ id: `${kind}:${c.category_id}`, name: c.category_name, count: 0, kind })
    }
  }

  if (!categories.length) throw new Error('Upstream returned no channels')
  return { at: Date.now(), source, categories, total: 0 }
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

// Per-category item cache: paging through one category never refetches upstream.
const CATEGORY_TTL = 10 * 60 * 1000
const CATEGORY_MAX = 12
const categoryCache = new Map<string, { at: number; items: Item[] }>()

async function getCategoryItems(api: string, kind: Kind, rawId: string, key: string): Promise<Item[]> {
  const hit = categoryCache.get(key)
  if (hit && Date.now() - hit.at < CATEGORY_TTL) return hit.items

  const rows =
    (await fetchJson<Record<string, unknown>[]>(
      `${api}&action=${ACTIONS[kind][1]}&category_id=${encodeURIComponent(rawId)}`,
      20000,
    )) ?? []
  const items = rows.map((r) => toItem(r, kind)).filter((i): i is Item => !!i)

  categoryCache.set(key, { at: Date.now(), items })
  if (categoryCache.size > CATEGORY_MAX) {
    const oldest = [...categoryCache.entries()].sort((a, b) => a[1].at - b[1].at)[0]
    if (oldest) categoryCache.delete(oldest[0])
  }
  return items
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

/* ------------------------------------------------------------------ *
 * Plain M3U / M3U8 playlists (no Xtream API): everything is derived
 * from the parsed #EXTINF entries held in the shared memory cache.
 * ------------------------------------------------------------------ */

/** Stable series id derived from the series title, so it survives re-parses. */
const seriesIdOf = (key: string) => 'sx' + [...key.toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36)

interface Browsable {
  id: string
  name: string
  logo: string | null
  group: string
  kind: Kind
}
interface PlainDerived {
  version: string
  seriesGroups: Map<string, M3uEntry[]>
  browsable: Browsable[]
  categories: { id: string; name: string; kind: Kind; count: number }[]
}

// Derived views are rebuilt only when the parsed playlist version changes, so
// paging/searching a 280k-entry playlist never re-walks it from scratch.
let plainDerived: PlainDerived | null = null

const catKey = (kind: Kind, group: string) => `${kind}:${group}`

function derive(version: string, entries: M3uEntry[]): PlainDerived {
  const seriesGroups = new Map<string, M3uEntry[]>()
  const browsable: Browsable[] = []

  for (const e of entries) {
    if (e.kind === 'series' && e.seriesKey) {
      const list = seriesGroups.get(e.seriesKey) ?? []
      list.push(e)
      seriesGroups.set(e.seriesKey, list)
      continue
    }
    if (e.kind === 'series') continue
    browsable.push({ id: e.id, name: e.name, logo: e.logo, group: e.group, kind: e.kind })
  }
  for (const [key, eps] of seriesGroups) {
    browsable.push({
      id: seriesIdOf(key),
      name: key,
      logo: eps.find((e) => e.logo)?.logo ?? null,
      group: eps[0].group,
      kind: 'series',
    })
  }

  const counts = new Map<string, { name: string; kind: Kind; count: number }>()
  for (const b of browsable) {
    const id = catKey(b.kind, b.group)
    const hit = counts.get(id)
    if (hit) hit.count++
    else counts.set(id, { name: b.group, kind: b.kind, count: 1 })
  }

  return {
    version,
    seriesGroups,
    browsable,
    categories: [...counts.entries()].map(([id, c]) => ({ id, name: c.name, kind: c.kind, count: c.count })),
  }
}

async function handlePlain(source: string, url: URL): Promise<{ body: unknown; version: string }> {
  const snap = await getM3U(source)
  if (!plainDerived || plainDerived.version !== snap.version) {
    plainDerived = derive(snap.version, snap.entries)
  }
  const { seriesGroups, browsable, categories } = plainDerived
  const version = snap.version

  const seriesId = url.searchParams.get('series')
  if (seriesId) {
    const key = [...seriesGroups.keys()].find((k) => seriesIdOf(k) === seriesId)
    const eps = key ? seriesGroups.get(key)! : null
    if (!eps) throw new Error('Series not found')
    const bySeason = new Map<number, EpisodeOut[]>()
    for (const e of eps) {
      const season = e.season ?? 1
      const list = bySeason.get(season) ?? []
      list.push({
        id: e.id,
        season,
        episode: e.episode ?? list.length + 1,
        title: e.name,
        cover: e.logo,
        ext: (e.url.match(/\.([a-z0-9]{2,4})(?:\?|$)/i)?.[1] ?? 'mp4').toLowerCase(),
        plot: null,
        duration: null,
      })
      bySeason.set(season, list)
    }
    const seasons = [...bySeason.entries()]
      .map(([season, episodes]) => ({ season, episodes: episodes.sort((a, b) => a.episode - b.episode) }))
      .sort((a, b) => a.season - b.season)
    return {
      version,
      body: {
        id: seriesId,
        name: key!,
        cover: eps.find((e) => e.logo)?.logo ?? null,
        plot: null,
        seasons,
      },
    }
  }

  const category = url.searchParams.get('category')
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 60) || 60, 200)
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0)

  if (!category && !q) {
    return {
      version,
      body: {
        total: browsable.length,
        categories,
        updatedAt: new Date(snap.at).toISOString(),
      },
    }
  }

  let list = browsable
  if (category) list = list.filter((b) => catKey(b.kind, b.group) === category)
  else {
    const kindParam = url.searchParams.get('kind')
    const kind: Kind = kindParam === 'vod' || kindParam === 'series' ? kindParam : 'live'
    list = list.filter((b) => b.kind === kind)
  }
  if (q) list = list.filter((b) => b.name.toLowerCase().includes(q))

  return {
    version,
    body: {
      total: list.length,
      channels: list.slice(offset, offset + limit),
    },
  }
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200, cacheSeconds = 0, etag?: string) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-store',
        ...(etag ? { ETag: etag } : {}),
      },
    })


  try {
    const source = await getPlaylistUrl()
    if (!source) return json({ error: 'Playlist not configured' }, 500)

    const url = new URL(req.url)

    // Public .m3u/.m3u8 links have no Xtream API — parse the playlist directly.
    if (!isXtreamUrl(source)) {
      const { body, version } = await handlePlain(source, url)
      // Version + query identify the payload: unchanged playlists answer 304.
      const etag = `W/"${version}-${await digest(url.search)}"`
      if (req.headers.get('if-none-match') === etag) {
        return new Response(null, {
          status: 304,
          headers: { ...corsHeaders, ETag: etag, 'Cache-Control': 'public, max-age=60' },
        })
      }
      return json(body, 200, url.searchParams.get('q') ? 0 : 120, etag)
    }


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
      return json(
        {
          total: index.total,
          categories: index.categories,
          updatedAt: new Date(index.at).toISOString(),
        },
        200,
        300,
      )

    }

    const api = apiBase(source)
    const nameOf = (id: string) => index.categories.find((c) => c.id === id)?.name ?? 'Other'

    let list: Item[] = []

    if (category) {
      const kind = kindOf(category)
      const rawId = category.slice(category.indexOf(':') + 1)
      list = await getCategoryItems(api, kind, rawId, category)
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

    return json(
      {
        total: list.length,
        channels: list.slice(offset, offset + limit).map((s) => shape(s, nameOf(s.categoryId))),
      },
      200,
      category ? 120 : 0,
    )

  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})
