import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { parseXtream, isXtreamUrl, getM3U } from '../_shared/iptvConfig.ts'
import { resolveViewer, tokenFromRequest } from '../_shared/iptvViewer.ts'
import { egressFetch, finalUrlOf, isGeoBlocked, GEO_BLOCK_MESSAGE } from '../_shared/iptvEgress.ts'

/**
 * Lean Live TV stream proxy — a 1:1 copy of the playback pipeline used by the
 * IPTV M3U module (which plays flawlessly): a direct upstream fetch with a VLC
 * User-Agent, playlist rewriting back through this same function, and raw
 * pass-through for everything else. No relay hop, no cookie jar, no candidate
 * probing chains — those are what made /live-tv stall.
 *
 * The only addition over iptv-m3u-proxy is credential resolution: the caller's
 * own Xtream/M3U account is looked up server-side so credentials never reach
 * the browser.
 */

const cors: Record<string, string> = {
  ...corsHeaders,
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
}

import { IPTV_USER_AGENTS, isHtmlBlock, describeFetchError } from '../_shared/iptvFetch.ts'
import { clearCooldown, cooldownLeft, isRateLimited, markRateLimited } from '../_shared/iptvCooldown.ts'
import { classifyStatus, classifyTransport, streamError, type StreamError } from '../_shared/iptvErrors.ts'

const SELF = (req: Request) =>
  `${(Deno.env.get('SUPABASE_URL') || new URL(req.url).origin).replace(/\/$/, '')}/functions/v1/iptv-stream`

function isHttp(u: string) {
  try {
    const p = new URL(u)
    return p.protocol === 'http:' || p.protocol === 'https:'
  } catch {
    return false
  }
}
/**
 * Per-channel headers (Referer/User-Agent/Origin/Cookie) travel with segment
 * URLs as a url-safe base64 `h=` param, exactly like the IPTV M3U proxy — a
 * <video>/hls.js request cannot set them itself.
 */
function encodeHeaderBag(bag: Record<string, string | undefined>): string {
  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(bag)) if (typeof v === 'string' && v.trim()) clean[k] = v.trim()
  if (!Object.keys(clean).length) return ''
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(clean))))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeHeaderBag(raw: string | null): Record<string, string> {
  if (!raw || raw.length > 2048) return {}
  try {
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/')
    const obj = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))
    const map: Record<string, string> = {
      referer: 'Referer',
      origin: 'Origin',
      userAgent: 'User-Agent',
      cookie: 'Cookie',
    }
    const out: Record<string, string> = {}
    if (obj && typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj)) {
        const name = map[k]
        if (name && typeof v === 'string' && v.trim() && v.length < 512) out[name] = v.trim()
      }
    }
    return out
  } catch {
    return {}
  }
}


function rewritePlaylist(body: string, base: string, self: string, suffix: string) {
  const abs = (raw: string) => {
    try {
      return `${self}?u=${encodeURIComponent(new URL(raw, base).toString())}${suffix}`
    } catch {
      return raw
    }
  }
  return body
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim()
      if (!t) return line
      if (t.startsWith('#')) return t.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${abs(u)}"`)
      return abs(t)
    })
    .join('\n')
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const reqUrl = new URL(req.url)
  const passthrough = reqUrl.searchParams.get('u')
  const streamId = reqUrl.searchParams.get('id')
  const kindParam = reqUrl.searchParams.get('kind')
  const kind = kindParam === 'vod' || kindParam === 'series' ? kindParam : 'live'
  const extHint = (reqUrl.searchParams.get('ext') ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase()
  const rawFirst = reqUrl.searchParams.get('raw') === '1'

  // Every stream is served from the caller's OWN provider account.
  const resolved = await resolveViewer(req)
  if (!resolved.ok) return json({ error: resolved.message, code: resolved.error }, resolved.status)
  const source = resolved.viewer.playlistUrl
  const plain = !isXtreamUrl(source)

  // Candidate upstreams, in the order the M3U module proves reliable:
  // HLS manifest first (segment-based, survives slow links), raw TS as backup.
  let candidates: string[] = []
  // Custom per-channel headers: forwarded from the playlist entry on the first
  // hop, then carried on segment URLs via `h=`.
  let hRaw = reqUrl.searchParams.get('h')
  if (passthrough) {
    if (!isHttp(passthrough)) return json({ error: 'Invalid url' }, 400)
    candidates = [passthrough]
  } else if (plain && streamId) {
    const { byId, entries } = await getM3U(source)
    let entry = byId.get(streamId)
    if (!entry) {
      const legacy = /^m(\d+)$/.exec(streamId)
      if (legacy) entry = entries[Number(legacy[1])]
    }
    if (!entry) return json({ error: `Unknown stream id: ${streamId}` }, 404)
    candidates = [entry.url]
    if (entry.headers) hRaw = encodeHeaderBag(entry.headers) || hRaw
  } else if (streamId) {
    if (!/^\d+$/.test(streamId)) return json({ error: 'Invalid id' }, 400)
    const { host, protocol, username, password } = parseXtream(source)
    const cred = `${protocol}//${host}`
    if (kind === 'live') {
      const hls = `${cred}/live/${username}/${password}/${streamId}.m3u8`
      const ts = `${cred}/live/${username}/${password}/${streamId}.ts`
      // `raw=1` (mpegts.js engine) wants the transport stream first; the default
      // order prefers the HLS manifest, which survives slow links better.
      candidates = rawFirst ? [ts, hls] : [hls, ts]
    } else {
      // Provider's real container_extension (sent by the client as `ext`) is
      // tried FIRST and alone; the broad matrix is only a fallback when that
      // specific hint fails, so a correct hint commits on attempt #1.
      const dirs = kind === 'series' ? ['series', 'movie'] : ['movie', 'series']
      const url = (d: string, ext: string) => `${cred}/${d}/${username}/${password}/${streamId}.${ext}`
      const primary = extHint ? [url(dirs[0], extHint), url(dirs[1], extHint)] : []
      const fallbackExts = ['mp4', 'mkv', 'avi'].filter((e) => e !== extHint)
      const fallback = fallbackExts.flatMap((ext) => dirs.map((d) => url(d, ext)))
      candidates = [...new Set([...primary, ...fallback])]
    }

  } else {
    return json({ error: 'Missing id or u parameter' }, 400)
  }

  const range = req.headers.get('range')
  const custom = decodeHeaderBag(hRaw)
  const baseHeaders: Record<string, string> = {
    Accept: '*/*',
    ...custom,
    ...(range ? { Range: range } : {}),
  }
  // A playlist-declared User-Agent wins; otherwise rotate through the player
  // UAs so a panel that filters one client still serves the stream.
  const uaList = custom['User-Agent'] ? [custom['User-Agent']] : IPTV_USER_AGENTS

  let upstream: Response | null = null
  /** Provider URL the committed response really came from (relay-aware). */
  let upstreamBase = candidates[0] ?? ''
  let lastError = 'fetch failed'
  let deadlineHit = false
  const trace: string[] = []

  const OVERALL_DEADLINE_MS = 12_000
  const startedAt = Date.now()
  const remaining = () => OVERALL_DEADLINE_MS - (Date.now() - startedAt)

  /** Fatal per-host errors: another UA/transport will not help. */
  const isDeadHost = (msg: string) =>
    msg.startsWith('Connection refused') || msg.startsWith('Host not found')

  // Attempt plan: every candidate gets a fast direct hop then the geo-relay with
  // the primary UA. Only if the whole list fails do we rotate UAs — on the first
  // (most likely) candidate only, instead of cross-producing the full matrix.
  type Attempt = { target: string; via: 'direct' | 'relay'; ua: string }
  const plan: Attempt[] = []
  for (const target of candidates) {
    plan.push({ target, via: 'direct', ua: uaList[0] })
    plan.push({ target, via: 'relay', ua: uaList[0] })
  }
  for (const ua of uaList.slice(1)) {
    plan.push({ target: candidates[0], via: 'direct', ua })
    plan.push({ target: candidates[0], via: 'relay', ua })
  }

  const deadHosts = new Set<string>()
  /** Best classified reason so far — shown to the user if nothing plays. */
  let classified: StreamError | null = null
  let rateLimited = false
  /** `host|via` pairs the provider geo-blocks — no UA rotation can fix those. */
  const blockedRoutes = new Set<string>()
  let geoBlocked = false

  for (const { target, via, ua } of plan) {
    if (remaining() <= 500) {
      deadlineHit = true
      break
    }
    let hostKey = target
    try {
      hostKey = new URL(target).host
    } catch { /* keep raw */ }
    if (deadHosts.has(hostKey)) continue
    if (blockedRoutes.has(`${hostKey}|${via}`)) continue
    // Never hammer a panel that just rate-limited us: that is how an egress IP
    // earns a ban. Park it and report a retryable error instead.
    if (cooldownLeft(target)) {
      rateLimited = true
      classified = streamError('RATE_LIMITED')
      lastError = 'provider is rate limiting this connection'
      continue
    }

    const headers = { ...baseHeaders, 'User-Agent': ua }
    // A FRESH signal per attempt — a signal that already fired would abort the
    // next request instantly.
    const signal = AbortSignal.timeout(Math.max(1_500, Math.min(8_000, remaining() - 300)))
    try {
      const res =
        via === 'direct'
          ? await fetch(target, { headers, redirect: 'follow', signal })
          : await egressFetch(target, { headers, redirect: 'follow', signal })
      if (res.ok || res.status === 206) {
        const ctype = res.headers.get('content-type') || ''
        const resolvedUrl = finalUrlOf(res, target)
        // A WAF / panel block page arrives as HTML, sometimes with HTTP 200:
        // never hand that to the player — retry with the next UA.
        if (isHtmlBlock(ctype)) {
          await res.body?.cancel().catch(() => undefined)
          lastError = 'provider returned a block page (HTML)'
          continue
        }
        // Some providers answer 200 with a text error page for dead channels.
        // Verify manifests really are manifests before committing.
        let manifestPath = ''
        try {
          manifestPath = new URL(resolvedUrl).pathname
        } catch { /* ignore */ }
        const looksManifest = ctype.includes('mpegurl') || /\.m3u8?(\?|$)/i.test(manifestPath)
        if (looksManifest) {
          const text = await res.text()
          if (isHtmlBlock(null, text)) {
            lastError = 'provider returned a block page (HTML)'
            continue
          }
          if (!text.trimStart().startsWith('#EXTM3U')) {
            lastError = 'invalid manifest'
            continue
          }
          upstream = new Response(text, {
            status: 200,
            headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
          })
          upstreamBase = resolvedUrl
          break
        }
        upstream = res
        upstreamBase = resolvedUrl
        clearCooldown(target)
        break
      }
      // 429/509: throttled. Stop the whole plan for this host — a different UA
      // or transport only deepens the throttle.
      if (isRateLimited(res.status) && res.status !== 503) {
        markRateLimited(target, res.headers)
        rateLimited = true
        classified = streamError('RATE_LIMITED', `HTTP ${res.status}`)
        blockedRoutes.add(`${hostKey}|direct`)
        blockedRoutes.add(`${hostKey}|relay`)
        lastError = `HTTP ${res.status}`
        await res.body?.cancel().catch(() => undefined)
        continue
      }
      if (!classified || classified.code === 'UNKNOWN') classified = classifyStatus(res.status)
      // 456/459/451: the panel refuses this egress IP (geo / stream block).
      // Another User-Agent will never change that — stop hammering this route.
      if (isGeoBlocked(res.status) || res.status === 456) {
        geoBlocked = true
        blockedRoutes.add(`${hostKey}|${via}`)
      }
      lastError = `HTTP ${res.status}`
      trace.push(`${via}:${res.status}`)
      await res.body?.cancel().catch(() => undefined)
    } catch (e) {
      lastError = describeFetchError(e)
      if (!classified || classified.code === 'UNKNOWN') classified = classifyTransport(lastError)
      trace.push(`${via}:err:${lastError.slice(0, 60)}`)
      // Refused / DNS failure will not improve with another UA or transport.
      if (via === 'direct' && isDeadHost(lastError)) deadHosts.add(hostKey)
    }
  }

  if (!upstream) {
    // One actionable sentence, the way IPTV Smarters / VLC report failures.
    const error: StreamError = rateLimited
      ? streamError('RATE_LIMITED')
      : geoBlocked
        ? { code: 'GEO_BLOCKED', message: GEO_BLOCK_MESSAGE, retryable: true }
        : deadlineHit
          ? streamError('TIMEOUT', `${OVERALL_DEADLINE_MS / 1000}s`)
          : (classified ?? classifyTransport(lastError))
    console.error(
      `[iptv-stream] ${JSON.stringify({ kind, streamId, candidates: candidates.length, deadlineHit, geoBlocked, rateLimited, code: error.code, lastError, trace })}`,
    )
    return json(
      {
        error: error.message,
        code: error.code,
        retryable: error.retryable,
        deadline: deadlineHit,
        geoBlocked,
        rateLimited,
        detail: lastError,
        candidates: candidates.length,
      },
      rateLimited ? 429 : 502,
    )
  }

  const finalUrl = new URL(upstreamBase)

  const ct = upstream.headers.get('content-type') || ''
  const isPlaylist = ct.includes('mpegurl') || /\.m3u8?(\?|$)/i.test(finalUrl.pathname + finalUrl.search)

  if (isPlaylist) {
    const apikey = reqUrl.searchParams.get('apikey')
    const token = tokenFromRequest(req)
    const suffix =
      `${apikey ? `&apikey=${encodeURIComponent(apikey)}` : ''}` +
      `${token ? `&token=${encodeURIComponent(token)}` : ''}` +
      `${hRaw ? `&h=${encodeURIComponent(hRaw)}` : ''}`

    const text = await upstream.text()
    return new Response(rewritePlaylist(text, upstreamBase, SELF(req), suffix), {
      status: upstream.status,
      headers: {
        ...cors,
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store',
      },
    })
  }

  const out = new Headers(cors)
  out.set('Content-Type', ct || 'application/octet-stream')
  const cr = upstream.headers.get('content-range')
  if (cr) out.set('Content-Range', cr)
  out.set('Accept-Ranges', 'bytes')
  out.set('Cache-Control', 'no-store')

  return new Response(upstream.body, { status: upstream.status, headers: out })
})
