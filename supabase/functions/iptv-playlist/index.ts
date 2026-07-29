import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const UA = 'VLC/3.0.20 LibVLC/3.0.20'

interface Stream {
  stream_id: number
  name: string
  stream_icon: string
  category_id: string
}
interface Category {
  category_id: string
  category_name: string
}

interface Snapshot {
  at: number
  categories: { id: string; name: string; count: number }[]
  byCat: Map<string, Stream[]>
  all: Stream[]
}

const TTL = 30 * 60 * 1000
let snapshot: Snapshot | null = null
let loading: Promise<Snapshot> | null = null

function apiBase() {
  const raw = Deno.env.get('IPTV_PLAYLIST_URL') ?? ''
  const u = new URL(raw)
  const username = u.searchParams.get('username') ?? ''
  const password = u.searchParams.get('password') ?? ''
  return {
    api: `${u.protocol}//${u.host}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
  }
}

async function build(): Promise<Snapshot> {
  const { api } = apiBase()
  const [catRes, streamRes] = await Promise.all([
    fetch(`${api}&action=get_live_categories`, { headers: { 'User-Agent': UA } }),
    fetch(`${api}&action=get_live_streams`, { headers: { 'User-Agent': UA } }),
  ])
  if (!catRes.ok || !streamRes.ok) throw new Error(`Upstream error (${catRes.status}/${streamRes.status})`)

  const cats = (await catRes.json()) as Category[]
  const streams = (await streamRes.json()) as Stream[]

  const byCat = new Map<string, Stream[]>()
  for (const s of streams) {
    const arr = byCat.get(s.category_id) ?? []
    arr.push(s)
    byCat.set(s.category_id, arr)
  }

  const categories = cats
    .map((c) => ({ id: c.category_id, name: c.category_name, count: byCat.get(c.category_id)?.length ?? 0 }))
    .filter((c) => c.count > 0)

  return { at: Date.now(), categories, byCat, all: streams }
}

async function getSnapshot(): Promise<Snapshot> {
  if (snapshot && Date.now() - snapshot.at < TTL) return snapshot
  if (!loading) {
    loading = build()
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

const shape = (s: Stream, group: string) => ({
  id: String(s.stream_id),
  name: s.name,
  logo: s.stream_icon || null,
  group,
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    if (!Deno.env.get('IPTV_PLAYLIST_URL')) return json({ error: 'Playlist not configured' }, 500)

    const url = new URL(req.url)
    const category = url.searchParams.get('category')
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 60) || 60, 200)
    const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0)

    const snap = await getSnapshot()

    if (!category && !q) {
      return json({
        total: snap.all.length,
        categories: snap.categories,
        updatedAt: new Date(snap.at).toISOString(),
      })
    }

    const nameOf = (id: string) => snap.categories.find((c) => c.id === id)?.name ?? 'Other'

    let list: Stream[]
    if (category) {
      list = snap.byCat.get(category) ?? []
      if (q) list = list.filter((s) => s.name.toLowerCase().includes(q))
    } else {
      list = snap.all.filter((s) => s.name.toLowerCase().includes(q))
    }

    return json({
      total: list.length,
      channels: list.slice(offset, offset + limit).map((s) => shape(s, nameOf(s.category_id))),
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502)
  }
})
