import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

interface Channel {
  id: string
  name: string
  logo: string | null
  group: string
  url: string
}

let cache: { at: number; data: unknown } | null = null
const TTL = 10 * 60 * 1000

function parseM3U(text: string): Channel[] {
  const lines = text.split(/\r?\n/)
  const out: Channel[] = []
  let pending: Omit<Channel, 'url'> | null = null
  let i = 0
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#EXTINF')) {
      const attrs: Record<string, string> = {}
      for (const m of line.matchAll(/([a-zA-Z0-9-]+)="([^"]*)"/g)) attrs[m[1]] = m[2]
      const name = line.split(',').slice(1).join(',').trim() || attrs['tvg-name'] || 'Channel'
      pending = {
        id: attrs['tvg-id'] || `ch-${i++}`,
        name,
        logo: attrs['tvg-logo'] || null,
        group: attrs['group-title'] || 'Other',
      }
    } else if (!line.startsWith('#') && pending) {
      out.push({ ...pending, id: `${pending.id}-${out.length}`, url: line })
      pending = null
    }
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const src = Deno.env.get('IPTV_PLAYLIST_URL')
    if (!src) {
      return new Response(JSON.stringify({ error: 'Playlist not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (cache && Date.now() - cache.at < TTL) {
      return new Response(JSON.stringify(cache.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const res = await fetch(src, {
      headers: { 'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20' },
    })
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Playlist fetch failed (${res.status})` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const text = await res.text()
    const channels = parseM3U(text)

    const groupMap = new Map<string, Channel[]>()
    for (const c of channels) {
      const arr = groupMap.get(c.group) ?? []
      arr.push(c)
      groupMap.set(c.group, arr)
    }
    const groups = [...groupMap.entries()]
      .map(([name, items]) => ({ name, count: items.length, channels: items }))
      .sort((a, b) => b.count - a.count)

    const data = { total: channels.length, groups, updatedAt: new Date().toISOString() }
    cache = { at: Date.now(), data }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
