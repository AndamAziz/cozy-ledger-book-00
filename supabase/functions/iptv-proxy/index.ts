import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { getPlaylistUrl, parseXtream, isXtreamUrl, getM3U } from '../_shared/iptvConfig.ts'
import { egressFetch, finalUrlOf, hasEgressProxy, isGeoBlocked, GEO_BLOCK_MESSAGE } from '../_shared/iptvEgress.ts'

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
    // All provider traffic exits through our own VPS relay (allowed country).
    return await egressFetch(url, { headers, signal: ctrl.signal })
  } finally {
    // Cleared once headers are in, so large 4K bodies are never cut short.
    clearTimeout(timer)
  }
}


function creds(raw: string) {
  const { host, username, password } = parseXtream(raw)
  return { host, protocol: 'http:', username, password }
}


/** Strips the Xtream username/password path segments before exposing a URL. */
function redact(u: string) {
  return u.replace(/\/(live|movie|series)\/[^/]+\/[^/]+\//, '/$1/***/***/')
}

type Attempt = {
  url: string
  ext: string
  ua: 'mobile' | 'vlc'
  status: number | null
  contentType: string | null
  ms: number
  accepted?: boolean
  error?: string
}

async function isAdminRequest(req: Request): Promise<boolean> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return false
  try {
    const { createClient } = await import('npm:@supabase/supabase-js@2')
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )
    const { data: userData } = await admin.auth.getUser(token)
    const user = userData?.user
    if (!user) return false
    const { data } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' })
    return !!data
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const reqUrlEarly = new URL(req.url)
  const debugParam = (reqUrlEarly.searchParams.get('debug') ?? '').toLowerCase()
  // debug=1 → compact X-IPTV-Debug header. debug=json → admin-only JSON report.
  const debugHeaderOn = debugParam === '1' || debugParam === 'true' || debugParam === 'json'
  const debugJson = debugParam === 'json' && (await isAdminRequest(req))
  const attempts: Attempt[] = []
  let chosen: Attempt | null = null

  // One id per probing session so a single request can be traced end-to-end
  // across headers, the JSON report and the function logs.
  const requestId =
    reqUrlEarly.searchParams.get('rid')?.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) ||
    req.headers.get('x-request-id')?.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) ||
    crypto.randomUUID()

  const debugHeaders = (): Record<string, string> => {
    if (!debugHeaderOn) return { 'X-Request-ID': requestId, 'Access-Control-Expose-Headers': 'X-Request-ID, X-Final-URL' }
    const compact = attempts
      .map((a) => `${a.ext || '-'}:${a.ua}:${a.status ?? a.error ?? 'err'}:${(a.contentType ?? '-').split(';')[0]}:${a.ms}ms${a.accepted ? ':CHOSEN' : ''}`)
      .join(' | ')
    return {
      'X-Request-ID': requestId,
      'X-IPTV-Debug': `rid=${requestId} | ${compact || 'no-attempts'}`.slice(0, 1800),
      'X-IPTV-Debug-Chosen': chosen ? `${chosen.ext || '-'}:${chosen.status}:${(chosen.contentType ?? '-').split(';')[0]}` : 'none',
      'Access-Control-Expose-Headers': 'X-Request-ID, X-IPTV-Debug, X-IPTV-Debug-Chosen, X-Final-URL',
    }
  }

  const debugReport = (extra: Record<string, unknown> = {}, status = 200) =>
    new Response(
      JSON.stringify(
        { requestId, attempts, chosen, candidateCount: attempts.length, ...extra },
        null,
        2,
      ),
      { status, headers: { ...corsHeaders, ...debugHeaders(), 'Content-Type': 'application/json' } },
    )

  const err = (msg: string, status: number, code?: string) =>
    debugJson
      ? debugReport({ error: msg, code }, 200)
      : new Response(JSON.stringify({ error: msg, code }), {
          status,
          headers: { ...corsHeaders, ...debugHeaders(), 'Content-Type': 'application/json' },
        })

  // Every stream is served from the caller's OWN provider account.
  const resolved = await resolveViewer(req)
  if (!resolved.ok) return err(resolved.message, resolved.status, resolved.error)
  const source = resolved.viewer.playlistUrl


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
    // Always probe .mp4 first: Safari/iOS cannot play the Matroska container
    // even with H.264/AAC inside, so .mkv is only ever a fallback.
    const exts = [...new Set(['mp4', extHint, 'mkv', 'avi'].filter(Boolean))]
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
    // Panels redirect segments to CDN nodes under /hls/, /hlsr/ or /hlsr2/.
    const isEdgeSegment = /^\/hlsr?\d*\//.test(upstream.pathname)
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

  // With the relay in place a geo-block should no longer happen; keep it only
  // as a fallback message for when the relay itself cannot reach the provider.
  const geoBlockResponse = () =>
    err(
      hasEgressProxy() ? GEO_BLOCK_MESSAGE : 'The provider blocks streaming from this server\u2019s country.',
      isProbe ? 200 : 451,
      'GEO_BLOCK',
    )

  try {
    // Walk the candidate list once (live HLS → live TS → VOD containers). Every
    // attempt is bounded by CONNECT_TIMEOUT_MS so a dead origin can never leave
    // the player hanging on "Connecting to stream…", and failed responses are
    // drained so their upstream socket (and viewing slot) is released at once.
    const isSlot = (status: number) => status === 458 || status === 429 || status === 407
    const record = (u: string, ua: 'mobile' | 'vlc', started: number, r: Response | null, error?: string) => {
      const a: Attempt = {
        url: redact(u),
        ext: (new URL(u).pathname.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase(),
        ua,
        status: r?.status ?? null,
        contentType: r?.headers.get('content-type') ?? null,
        ms: Date.now() - started,
        ...(error ? { error } : {}),
      }
      attempts.push(a)
      return a
    }
    const tryFetch = async (u: string) => {
      try {
        const nextUrl = new URL(u)
        const primaryHeaders = buildUpstreamHeaders(req, nextUrl, plain ? `${nextUrl.protocol}//${nextUrl.host}/` : refererBase)
        let t0 = Date.now()
        const first = await fetchUpstream(u, primaryHeaders, req.signal)
        record(u, 'mobile', t0, first)
        if (first.ok || isSlot(first.status) || isGeoBlocked(first.status)) return first
        await first.body?.cancel()

        // Some older panels whitelist VLC/libVLC instead of ExoPlayer. Retry the
        // handshake once with VLC headers before marking the channel offline.
        const fallbackHeaders = { ...primaryHeaders, 'User-Agent': VLC_UA }
        t0 = Date.now()
        const second = await fetchUpstream(u, fallbackHeaders, req.signal)
        record(u, 'vlc', t0, second)
        return second
      } catch (e) {
        record(u, 'mobile', Date.now(), null, e instanceof Error ? e.message : String(e))
        return null
      }
    }

    const list = streamId ? candidates : [upstream.toString()]
    // A wrong container guess (e.g. .mp4 for an .mkv-only title) answers 200 with
    // an empty text/plain body, so a 200 alone is not proof of a real stream.
    const isRealMedia = (r: Response, u: string) => {
      const ct = (r.headers.get('content-type') ?? '').toLowerCase()
      if (ct.includes('mpegurl') || /\.m3u8?$/i.test(u)) return true
      if (ct.startsWith('video/') || ct.startsWith('audio/') || ct.includes('octet-stream') || ct.includes('mp2t')) return true
      if (!ct || ct.startsWith('text/') || ct.includes('json') || ct.includes('html')) return false
      return true
    }
    let res: Response | null = null
    for (let i = 0; i < list.length; i++) {
      if (req.signal.aborted) return err('Client disconnected', 499)
      if (i > 0) await new Promise((r) => setTimeout(r, 300))
      const next = await tryFetch(list[i])
      if (next?.ok && isRealMedia(next, list[i])) {
        upstream = new URL(list[i])
        res = next
        chosen = attempts[attempts.length - 1] ?? null
        if (chosen) chosen.accepted = true
        if (debugJson) {
          await next.body?.cancel()
          return debugReport({ kind, streamId, extHint, finalUrl: redact(finalUrlOf(next, list[i])) })
        }
        break
      }

      if (next?.ok) {
        // Empty/HTML body: this container does not exist upstream — keep walking.
        await next.body?.cancel()
        continue
      }

      if (next) {
        // Slot limits are account-wide: trying another container just burns more
        // provider sessions, so surface it straight away.
        if (isSlot(next.status)) {
          await next.body?.cancel()
          return slotLimitResponse()
        }
        // Geo restrictions are account/region-wide too — every other candidate
        // will fail identically, so stop instead of burning provider sessions.
        if (isGeoBlocked(next.status)) {
          await next.body?.cancel()
          return geoBlockResponse()
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
        if (isGeoBlocked(res.status, text)) return geoBlockResponse()
        // 5xx / 521 / 404 mean the channel's own origin is down — not our error.
        const msg = slot
          ? 'All viewing slots are in use right now. Try again in a moment.'
          : `This channel is offline right now (${res.status}). Try another channel.`
        return slot ? slotLimitResponse() : err(msg, 502, 'OFFLINE')
      }

      // The relay follows redirects server-side; X-Final-URL is the host the
      // segment paths are relative to (the provider redirects before answering).
      const finalUrl = new URL(finalUrlOf(res, upstream.toString()))
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
          ...debugHeaders(),
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
      if (isGeoBlocked(res.status)) return geoBlockResponse()
      return err(`This channel is offline right now (${res.status}). Try another channel.`, 502, 'OFFLINE')
    }

    const out = new Headers({ ...corsHeaders, ...debugHeaders() })

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
