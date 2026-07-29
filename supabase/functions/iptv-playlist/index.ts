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

interface Snapshot {
  at: number
  source: string
  categories: { id: string; name: string; count: number; kind: Kind }[]
  byCat: Map<string, Item[]>
  all: Item[]
}

const TTL = 30 * 60 * 1000
let snapshot: Snapshot | null = null
let loading: Promise<Snapshot> | null = null

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
    'poster_path',
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

async function loadSection(api: string, kind: Kind) {
  const [catAction, listAction] =
    kind === 'live'
      ? ['get_live_categories', 'get_live_streams']
      : kind === 'vod'
        ? ['get_vod_categories', 'get_vod_streams']
        : ['get_series_categories', 'get_series']

  const [cats, rows] = await Promise.all([
    fetchJson<RawCategory[]>(`${api}&action=${catAction}`),
    fetchJson<Record<string, unknown>[]>(`${api}&action=${listAction}`),
  ])
  if (!cats || !rows) return { cats: [] as RawCategory[], items: [] as Item[] }

  const items: Item[] = rows.map((r) => ({
    id: String(r.stream_id ?? r.series_id ?? r.num ?? ''),
    name: String(r.name ?? r.title ?? 'Untitled'),
    logo: pickLogo(r),
    categoryId: `${kind}:${String(r.category_id ?? '0')}`,
    kind,
  }))

  return { cats, items: items.filter((i) => i.id) }
}

async function build(source: string): Promise<Snapshot> {
  const api = apiBase(source)
  const [live, vod, series] = await Promise.all([
    loadSection(api, 'live'),
    loadSection(api, 'vod'),
    loadSection(api, 'series'),
  ])
  if (!live.items.length && !vod.items.length && !series.items.length) {
    throw new Error('Upstream returned no channels')
  }

  const all = [...live.items, ...vod.items, ...series.items]
  const byCat = new Map<string, Item[]>()
  for (const s of all) {
    const arr = byCat.get(s.categoryId) ?? []
    arr.push(s)
    byCat.set(s.categoryId, arr)
  }

  const categories = (
    [
      [live.cats, 'live'],
      [vod.cats, 'vod'],
      [series.cats, 'series'],
    ] as [RawCategory[], Kind][]
  ).flatMap(([cats, kind]) =>
    cats.map((c) => {
      const id = `${kind}:${c.category_id}`
      return { id, name: c.category_name, count: byCat.get(id)?.length ?? 0, kind }
    }),
  ).filter((c) => c.count > 0)

  return { at: Date.now(), source, categories, byCat, all }
}

async function getSnapshot(source: string): Promise<Snapshot> {
  // Invalidate the cache when an admin points the app at a different playlist.
  if (snapshot && snapshot.source === source && Date.now() - snapshot.at < TTL) return snapshot
  if (!loading) {
    loading = build(source)
      .then((s) => {
        snapshot = s
        return s
      })
      .finally(() => {
        loading = null
      })
  }
  return loading
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

    const snap = await getSnapshot(source)

    if (!category && !q) {
      return json({
        total: snap.all.length,
        categories: snap.categories,
        updatedAt: new Date(snap.at).toISOString(),
      })
    }

    const nameOf = (id: string) => snap.categories.find((c) => c.id === id)?.name ?? 'Other'

    let list: Item[]
    if (category) {
      list = snap.byCat.get(category) ?? []
      if (q) list = list.filter((s) => s.name.toLowerCase().includes(q))
    } else {
      list = snap.all.filter((s) => s.name.toLowerCase().includes(q))
    }

    return json({
      total: list.length,
      channels: list.slice(offset, offset + limit).map((s) => shape(s, nameOf(s.categoryId))),
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})
