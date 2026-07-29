import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { getPlaylistUrl, parseXtream, isXtreamUrl, getM3U } from '../_shared/iptvConfig.ts'
import { egressUrl, isGeoBlocked, GEO_BLOCK_MESSAGE } from '../_shared/iptvEgress.ts'

const MOBILE_UA = 'IPTVSmartersPro/4.0.4 (Linux; Android 12) ExoPlayerLib/2.19.1'
const VLC_UA = 'VLC/3.0.20 LibVLC/3.0.20'
const SLOT_LIMIT_STATUS = 429

/** Connect timeout for the upstream handshake (headers only — the body streams freely). */
const CONNECT_TIMEOUT_MS = 14000

function buildUpstreamHeaders(req: Request, upstream: URL, refererBase?: string): Record<string, string> {
  const headers: Record<string, string> = {
    // Most IPTV apps identify as an Android/ExoPlayer-style client. Keeping the
    // raw provider request server-side lets HTTP streams work from the HTTPS app
    // and avoids browser User-Agent / mixed-content limitations.
    'User-Agent': MOBILE_UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Icy-MetaData': '1',
    'X-Requested-With': 'com.nathnetwork.xciptv',
  }

  const range = req.headers.get('range')
  if (range) headers['Range'] = range

  const origin = refererBase ?? `${upstream.protocol}//${upstream.host}/`
  headers['Origin'] = origin.replace(/\/$/, '')
  headers['Referer'] = origin.endsWith('/') ? origin : `${origin}/`

  return headers
}

async function fetchUpstream(url: string, headers: Record<string, string>, clientSignal?: AbortSignal) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), CONNECT_TIMEOUT_MS)
  // Propagate client disconnects upstream: with single-slot provider accounts a
  // lingering upstream socket keeps the only viewing slot busy forever.
  const onAbort = () => ctrl.abort()
  clientSignal?.addEventListener('abort', onAbort, { once: true })
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
  const plain = !isXtreamUrl(source)
  const { host, protocol, username, password } = plain
    ? { host: '', protocol: 'http:', username: '', password: '' }
    : creds(source)
  const streamId = reqUrl.searchParams.get('id')
  const kindParam = reqUrl.searchParams.get('kind')
  const kind = kindParam === 'vod' || kindParam === 'series' ? kindParam : 'live'
  const extHint = (reqUrl.searchParams.get('ext') ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase()
  const passthrough = reqUrl.searchParams.get('u')

  // Candidate upstreams: live HLS first, then Xtream VOD/series containers.
  let candidates: string[] = []
  let upstream: URL
  // Plain M3U playlists: the id maps to a parsed #EXTINF entry URL.
  let plainHosts: Set<string> | null = null
  if (plain) {
    try {
      plainHosts = (await getM3U(source)).hosts
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e), 502)
    }
  }

  if (plain && streamId) {
    const { byId, entries } = await getM3U(source)
    let entry = byId.get(streamId)
    // Legacy index-based ids ("m0", "m12") issued before content-hashed ids.
    if (!entry) {
      const legacy = /^m(\d+)$/.exec(streamId)
      if (legacy) entry = entries[Number(legacy[1])]
    }
    if (!entry) return err(`Unknown stream id: ${streamId}`, 404)

    try {
      upstream = new URL(entry.url)
    } catch {
      return err('Invalid stream url', 502)
    }
    candidates = [entry.url]
  } else if (streamId) {
    if (!/^\d+$/.test(streamId)) return err('Invalid id', 400)
    const cred = `${protocol}//${host}`
    const live = `${cred}/live/${username}/${password}/${streamId}.m3u8`
    // Some panels only expose raw MPEG-TS for live channels (no HLS packaging).
    const liveTs = `${cred}/live/${username}/${password}/${streamId}.ts`
    const exts = [...new Set([extHint, 'mp4', 'mkv', 'avi'].filter(Boolean))]
    // Series episodes live under /series/, movies under /movie/ — try the likely one first.
    const dirs = kind === 'series' ? ['series', 'movie'] : ['movie', 'series']
    const vod = exts.flatMap((ext) => dirs.map((dir) => `${cred}/${dir}/${username}/${password}/${streamId}.${ext}`))
    candidates =
      kind === 'live' ? [live, liveTs] : kind === 'series' ? [...vod, live] : [live, ...vod]

    upstream = new URL(candidates[0])

  } else if (passthrough) {
    try {
      upstream = new URL(passthrough)
    } catch {
      return err('Invalid url', 400)
    }
    // Only the provider host or its HLS edge nodes may be proxied.
    const isEdgeSegment = /^\/hls\//.test(upstream.pathname)
    const allowed = plain ? !!plainHosts?.has(upstream.host) : upstream.host === host
    if (!allowed && !isEdgeSegment) return err('Host not allowed', 403)
    candidates = [upstream.toString()]
  } else {
    return err('Missing id or u parameter', 400)
  }

  const publicBase = (Deno.env.get('SUPABASE_URL') ?? reqUrl.origin).replace(/\/$/, '')
  const base = `${publicBase}/functions/v1/iptv-proxy`
  const apikey = reqUrl.searchParams.get('apikey')
  const proxied = (u: string) =>
    `${base}?u=${encodeURIComponent(u)}${apikey ? `&apikey=${encodeURIComponent(apikey)}` : ''}`

  const refererBase = plain ? `${upstream.protocol}//${upstream.host}/` : `${protocol}//${host}/`
  const wantsJson = (req.headers.get('accept') ?? '').toLowerCase().includes('application/json')
  const isProbe = wantsJson && req.headers.get('range') === 'bytes=0-0'

  const slotLimitResponse = () =>
    err(
      'All viewing slots are in use right now. Try again in a moment.',
      isProbe ? 200 : SLOT_LIMIT_STATUS,
      'SLOT_LIMIT',
    )

  try {
    // Walk the candidate list once (live HLS → live TS → VOD containers). Every
    // attempt is bounded by CONNECT_TIMEOUT_MS so a dead origin can never leave
    // the player hanging on "Connecting to stream…", and failed responses are
    // drained so their upstream socket (and viewing slot) is released at once.
    const isSlot = (status: number) => status === 458 || status === 429 || status === 407
    const tryFetch = async (u: string) => {
      try {
        const nextUrl = new URL(u)
        const primaryHeaders = buildUpstreamHeaders(req, nextUrl, plain ? `${nextUrl.protocol}//${nextUrl.host}/` : refererBase)
        const first = await fetchUpstream(u, primaryHeaders, req.signal)
        if (first.ok || isSlot(first.status)) return first
        await first.body?.cancel()

        // Some older panels whitelist VLC/libVLC instead of ExoPlayer. Retry the
        // handshake once with VLC headers before marking the channel offline.
        const fallbackHeaders = { ...primaryHeaders, 'User-Agent': VLC_UA }
        return await fetchUpstream(u, fallbackHeaders, req.signal)
      } catch {
        return null
      }
    }
    const list = streamId ? candidates : [upstream.toString()]
    let res: Response | null = null
    for (let i = 0; i < list.length; i++) {
      if (req.signal.aborted) return err('Client disconnected', 499)
      if (i > 0) await new Promise((r) => setTimeout(r, 300))
      const next = await tryFetch(list[i])
      if (next?.ok) {
        upstream = new URL(list[i])
        res = next
        break
      }
      if (next) {
        // Slot limits are account-wide: trying another container just burns more
        // provider sessions, so surface it straight away.
        if (isSlot(next.status)) {
          await next.body?.cancel()
          return slotLimitResponse()
        }
        if (res) await res.body?.cancel()
        res = next
      }
    }
    if (!res) return err('Stream timed out while connecting. Try again.', 504, 'TIMEOUT')



    const ct = res.headers.get('content-type') ?? ''
    const isPlaylist = ct.includes('mpegurl') || /\.m3u8?$/i.test(upstream.pathname)


    if (isPlaylist) {
      const text = await res.text()
      if (!res.ok) {
        const slot = res.status === 458 || res.status === 429 || res.status === 407
        // 5xx / 521 / 404 mean the channel's own origin is down — not our error.
        const msg = slot
          ? 'All viewing slots are in use right now. Try again in a moment.'
          : `This channel is offline right now (${res.status}). Try another channel.`
        return slot ? slotLimitResponse() : err(msg, 502, 'OFFLINE')
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

    // Provider slot limits come back as 458/429/407 — surface a readable message.
    if (!res.ok) {
      await res.body?.cancel()
      const slot = res.status === 458 || res.status === 429 || res.status === 407
      if (slot) return slotLimitResponse()
      return err(`This channel is offline right now (${res.status}). Try another channel.`, 502, 'OFFLINE')
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
