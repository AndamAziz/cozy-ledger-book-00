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

// The VOD/series catalogues are huge, so only one section is kept resident at a
// time; the index only retains the (small) per-category counts.
let indexCache: { at: number; source: string; categories: CategoryInfo[]; total: number } | null = null
let sectionCache: { at: number; source: string; kind: Kind; byCat: Map<string, Item[]> } | null = null
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

const ACTIONS: Record<Kind, [string, string]> = {
  live: ['get_live_categories', 'get_live_streams'],
  vod: ['get_vod_categories', 'get_vod_streams'],
  series: ['get_series_categories', 'get_series'],
}

async function loadSection(api: string, kind: Kind) {
  const [catAction, listAction] = ACTIONS[kind]
  const cats = (await fetchJson<RawCategory[]>(`${api}&action=${catAction}`)) ?? []
  const rows = (await fetchJson<Record<string, unknown>[]>(`${api}&action=${listAction}`)) ?? []

  const byCat = new Map<string, Item[]>()
  for (const r of rows) {
    const id = String(r.stream_id ?? r.series_id ?? '')
    if (!id) continue
    const categoryId = `${kind}:${String(r.category_id ?? '0')}`
    const item: Item = {
      id,
      name: String(r.name ?? r.title ?? 'Untitled'),
      logo: pickLogo(r),
      categoryId,
      kind,
    }
    const arr = byCat.get(categoryId) ?? []
    arr.push(item)
    byCat.set(categoryId, arr)
  }

  const categories: CategoryInfo[] = cats
    .map((c) => {
      const id = `${kind}:${c.category_id}`
      return { id, name: c.category_name, count: byCat.get(id)?.length ?? 0, kind }
    })
    .filter((c) => c.count > 0)

  return { categories, byCat, total: rows.length }
}

async function buildIndex(source: string) {
  const api = apiBase(source)
  const categories: CategoryInfo[] = []
  let total = 0

  // Sequential on purpose: keeps peak memory to one catalogue at a time.
  for (const kind of ['live', 'vod', 'series'] as Kind[]) {
    const section = await loadSection(api, kind)
    categories.push(...section.categories)
    total += section.total
    if (kind === 'live') sectionCache = { at: Date.now(), source, kind, byCat: section.byCat }
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

async function getSection(source: string, kind: Kind) {
  if (sectionCache && sectionCache.source === source && sectionCache.kind === kind && Date.now() - sectionCache.at < TTL) {
    return sectionCache.byCat
  }
  sectionCache = null // release the previous catalogue before loading a new one
  const { byCat } = await loadSection(apiBase(source), kind)
  sectionCache = { at: Date.now(), source, kind, byCat }
  return byCat
}

const shape = (s: Item, group: string) => ({
  id: s.id,
  name: s.name,
  logo: s.logo,
  group,
  kind: s.kind,
})

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

    const nameOf = (id: string) => index.categories.find((c) => c.id === id)?.name ?? 'Other'
    const kindOf = (id: string): Kind => {
      const prefix = id.split(':')[0]
      return prefix === 'vod' || prefix === 'series' ? prefix : 'live'
    }

    let list: Item[] = []
    if (category) {
      const byCat = await getSection(source, kindOf(category))
      list = byCat.get(category) ?? []
      if (q) list = list.filter((s) => s.name.toLowerCase().includes(q))
    } else {
      // Search scans the resident catalogue (defaults to live channels).
      const kindParam = url.searchParams.get('kind')
      const kind: Kind = kindParam === 'vod' || kindParam === 'series' ? kindParam : 'live'
      const byCat = await getSection(source, kind)
      for (const items of byCat.values()) {
        for (const s of items) if (s.name.toLowerCase().includes(q)) list.push(s)
        if (list.length > 2000) break
      }
    }

    return json({
      total: list.length,
      channels: list.slice(offset, offset + limit).map((s) => shape(s, nameOf(s.categoryId))),
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})
