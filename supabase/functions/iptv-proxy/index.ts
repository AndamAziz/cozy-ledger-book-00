import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { getPlaylistUrl, parseXtream } from '../_shared/iptvConfig.ts'

const UA = 'VLC/3.0.20 LibVLC/3.0.20'

function creds(raw: string) {
  const { host, username, password } = parseXtream(raw)
  return { host, protocol: 'http:', username, password }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const err = (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  const source = await getPlaylistUrl()
  if (!source) return err('Playlist not configured', 500)

  const reqUrl = new URL(req.url)
  const { host, protocol, username, password } = creds(source)
  const streamId = reqUrl.searchParams.get('id')
  const kind = reqUrl.searchParams.get('kind') === 'vod' ? 'vod' : 'live'
  const passthrough = reqUrl.searchParams.get('u')

  // Candidate upstreams: live HLS first, then Xtream VOD/series containers.
  let candidates: string[] = []
  let upstream: URL
  if (streamId) {
    if (!/^\d+$/.test(streamId)) return err('Invalid id', 400)
    const cred = `${protocol}//${host}`
    const live = `${cred}/live/${username}/${password}/${streamId}.m3u8`
    const vod = ['mp4', 'mkv', 'avi'].flatMap((ext) => [
      `${cred}/movie/${username}/${password}/${streamId}.${ext}`,
      `${cred}/series/${username}/${password}/${streamId}.${ext}`,
    ])
    candidates = kind === 'vod' ? [live, ...vod] : [live]
    upstream = new URL(candidates[0])
  } else if (passthrough) {
    try {
      upstream = new URL(passthrough)
    } catch {
      return err('Invalid url', 400)
    }
    // Only the provider host or its HLS edge nodes may be proxied.
    const isEdgeSegment = /^\/hls\//.test(upstream.pathname)
    if (upstream.host !== host && !isEdgeSegment) return err('Host not allowed', 403)
    candidates = [upstream.toString()]
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
    // For VOD we also walk the candidate list (live → movie → series containers).
    let res = await fetch(upstream.toString(), { headers, redirect: 'follow' })
    if (!res.ok && streamId) {
      outer: for (const candidate of candidates) {
        for (let attempt = 0; attempt < (candidates.length > 1 ? 1 : 3); attempt++) {
          await new Promise((r) => setTimeout(r, 800))
          const next = await fetch(candidate, { headers, redirect: 'follow' })
          if (next.ok) {
            upstream = new URL(candidate)
            res = next
            break outer
          }
          res = next
        }
      }
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
