import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { getPlaylistUrl, parseXtream } from '../_shared/iptvConfig.ts'

const UA = 'VLC/3.0.20 LibVLC/3.0.20'

/** Connect timeout for the upstream handshake (headers only — the body streams freely). */
const CONNECT_TIMEOUT_MS = 8000

async function fetchUpstream(url: string, headers: Record<string, string>) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), CONNECT_TIMEOUT_MS)
  try {
    return await fetch(url, { headers, redirect: 'follow', signal: ctrl.signal })
  } finally {
    // Cleared once headers are in, so large 4K bodies are never cut short.
    clearTimeout(timer)
  }
}

function creds(raw: string) {
  const { host, username, password } = parseXtream(raw)
  return { host, protocol: 'http:', username, password }
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const err = (msg: string, status: number, code?: string) =>
    new Response(JSON.stringify({ error: msg, code }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  const source = await getPlaylistUrl()
  if (!source) return err('Playlist not configured', 500)

  const reqUrl = new URL(req.url)
  const { host, protocol, username, password } = creds(source)
  const streamId = reqUrl.searchParams.get('id')
  const kindParam = reqUrl.searchParams.get('kind')
  const kind = kindParam === 'vod' || kindParam === 'series' ? kindParam : 'live'
  const extHint = (reqUrl.searchParams.get('ext') ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase()
  const passthrough = reqUrl.searchParams.get('u')

  // Candidate upstreams: live HLS first, then Xtream VOD/series containers.
  let candidates: string[] = []
  let upstream: URL
  if (streamId) {
    if (!/^\d+$/.test(streamId)) return err('Invalid id', 400)
    const cred = `${protocol}//${host}`
    const live = `${cred}/live/${username}/${password}/${streamId}.m3u8`
    const exts = [...new Set([extHint, 'mp4', 'mkv', 'avi'].filter(Boolean))]
    // Series episodes live under /series/, movies under /movie/ — try the likely one first.
    const dirs = kind === 'series' ? ['series', 'movie'] : ['movie', 'series']
    const vod = exts.flatMap((ext) => dirs.map((dir) => `${cred}/${dir}/${username}/${password}/${streamId}.${ext}`))
    candidates = kind === 'live' ? [live] : kind === 'series' ? [...vod, live] : [live, ...vod]
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
    // Every attempt is bounded by CONNECT_TIMEOUT_MS so a dead origin can never
    // leave the player hanging on "Connecting to stream…".
    const tryFetch = async (u: string) => {
      try {
        return await fetchUpstream(u, headers)
      } catch {
        return null
      }
    }

    let res = await tryFetch(upstream.toString())
    if ((!res || !res.ok) && streamId) {
      outer: for (const candidate of candidates) {
        for (let attempt = 0; attempt < (candidates.length > 1 ? 1 : 2); attempt++) {
          await new Promise((r) => setTimeout(r, 400))
          const next = await tryFetch(candidate)
          if (next?.ok) {
            upstream = new URL(candidate)
            res = next
            break outer
          }
          if (next) res = next
        }
      }
    }
    if (!res) return err('Stream timed out while connecting. Try again.', 504, 'TIMEOUT')


    const ct = res.headers.get('content-type') ?? ''
    const isPlaylist = ct.includes('mpegurl') || /\.m3u8?$/i.test(upstream.pathname)


    if (isPlaylist) {
      const text = await res.text()
      if (!res.ok) {
        const msg =
          res.status === 458 || res.status === 429
            ? 'All viewing slots are in use right now. Try again in a moment.'
            : `Stream unavailable (${res.status})`
        return err(msg, 502, res.status === 458 || res.status === 429 ? 'SLOT_LIMIT' : undefined)
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

    // Provider slot limits come back as 458/429 — surface a readable message.
    if (streamId && (res.status === 458 || res.status === 429)) {
      return err('All viewing slots are in use right now. Try again in a moment.', 502, 'SLOT_LIMIT')
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
