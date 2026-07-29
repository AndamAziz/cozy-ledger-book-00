import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const UA = 'VLC/3.0.20 LibVLC/3.0.20'

function creds() {
  const raw = Deno.env.get('IPTV_PLAYLIST_URL') ?? ''
  const u = new URL(raw)
  return {
    host: u.host,
    protocol: 'http:',
    username: u.searchParams.get('username') ?? '',
    password: u.searchParams.get('password') ?? '',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const err = (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (!Deno.env.get('IPTV_PLAYLIST_URL')) return err('Playlist not configured', 500)

  const reqUrl = new URL(req.url)
  const { host, protocol, username, password } = creds()
  const streamId = reqUrl.searchParams.get('id')
  const passthrough = reqUrl.searchParams.get('u')

  let upstream: URL
  if (streamId) {
    if (!/^\d+$/.test(streamId)) return err('Invalid id', 400)
    upstream = new URL(`${protocol}//${host}/live/${username}/${password}/${streamId}.m3u8`)
  } else if (passthrough) {
    try {
      upstream = new URL(passthrough)
    } catch {
      return err('Invalid url', 400)
    }
    // Only the provider host or its HLS edge nodes may be proxied.
    const isEdgeSegment = /^\/hls\//.test(upstream.pathname)
    if (upstream.host !== host && !isEdgeSegment) return err('Host not allowed', 403)
  } else {
    return err('Missing id or u parameter', 400)
  }

  const publicBase = (Deno.env.get('SUPABASE_URL') ?? reqUrl.origin).replace(/\/$/, '')
  const base = `${publicBase}/functions/v1/iptv-proxy`
  const apikey = reqUrl.searchParams.get('apikey')
  const proxied = (u: string) =>
    `${base}?u=${encodeURIComponent(u)}${apikey ? `&apikey=${encodeURIComponent(apikey)}` : ''}`

  const headers: Record<string, string> = { 'User-Agent': UA, Referer: `${protocol}//${host}/` }
  const range = req.headers.get('range')
  if (range) headers['Range'] = range

  try {
    // The provider limits concurrent sessions; a fresh session sometimes needs a retry.
    let res = await fetch(upstream.toString(), { headers, redirect: 'follow' })
    for (let attempt = 0; attempt < 3 && !res.ok && !!streamId; attempt++) {
      await new Promise((r) => setTimeout(r, 1200))
      res = await fetch(upstream.toString(), { headers, redirect: 'follow' })
    }

    const ct = res.headers.get('content-type') ?? ''
    const isPlaylist = ct.includes('mpegurl') || /\.m3u8?$/i.test(upstream.pathname)

    if (isPlaylist) {
      const text = await res.text()
      if (!res.ok) {
        const msg =
          res.status === 458 || res.status === 429
            ? 'All viewing slots are in use right now. Try again in a moment.'
            : `Stream unavailable (${res.status})`
        return err(msg, 502)
      }
      const finalUrl = new URL(res.url || upstream.toString())
      const rewritten = text
        .split(/\r?\n/)
        .map((line) => {
          const t = line.trim()
          if (!t) return line
          if (t.startsWith('#')) {
            return t.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${proxied(new URL(u, finalUrl).toString())}"`)
          }
          return proxied(new URL(t, finalUrl).toString())
        })
        .join('\n')

      return new Response(rewritten, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-store',
        },
      })
    }

    const out = new Headers(corsHeaders)
    out.set('Content-Type', ct || 'video/mp2t')
    const len = res.headers.get('content-length')
    if (len) out.set('Content-Length', len)
    const cr = res.headers.get('content-range')
    if (cr) out.set('Content-Range', cr)
    out.set('Accept-Ranges', 'bytes')
    out.set('Cache-Control', 'no-store')

    return new Response(res.body, { status: res.status, headers: out })
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e), 502)
  }
})
