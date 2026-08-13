import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { parseXtream, isXtreamUrl, getM3U, xtreamOrigins } from '../_shared/iptvConfig.ts'
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
import {
  candidateFormat,
  invalidateLiveFormats,
  liveFormatOrder,
  liveFormats,
  liveFormatsAge,
  refusalScope,
  type LiveFormats,
} from '../_shared/iptvFormats.ts'

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

/**
 * Provider redirect resolution — generic fix for panels that answer the
 * pre-redirect path (`/live/user/pass/123.m3u8`) with a 302 to a *tokenized*
 * URL, while refusing (401/403) any request for the original path coming from
 * our relay's IP.
 *
 * The initial 30x hop is therefore resolved DIRECTLY (edge → provider, which is
 * only geo-blocked on the media hop, never on the redirect) and only the final
 * tokenized URL is handed to the relay for the actual streaming hop.
 *
 * Applies to every provider: when there is no redirect the target is returned
 * unchanged, so nothing is provider-specific.
 */
const redirectCache = new Map<string, { url: string; at: number }>()
const REDIRECT_TTL_MS = 30_000

async function resolveTokenizedUrl(
  target: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<string> {
  const hit = redirectCache.get(target)
  if (hit && Date.now() - hit.at < REDIRECT_TTL_MS) return hit.url

  let current = target
  for (let hop = 0; hop < 4; hop++) {
    let res: Response
    try {
      res = await fetch(current, { headers, redirect: 'manual', signal })
    } catch {
      break
    }
    const loc = res.headers.get('location')
    // Never keep the redirect's body open — the account has a single slot.
    await res.body?.cancel().catch(() => undefined)
    if (res.status >= 300 && res.status < 400 && loc) {
      try {
        current = new URL(loc, current).toString()
      } catch {
        break
      }
      continue
    }
    break
  }
  if (current !== target) {
    redirectCache.set(target, { url: current, at: Date.now() })
    if (redirectCache.size > 200) redirectCache.delete(redirectCache.keys().next().value as string)
  }
  return current
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
  const softErrors = reqUrl.searchParams.get('soft') === '1'

  // Every stream is served from the caller's OWN provider account.
  const resolved = await resolveViewer(req)
  if (!resolved.ok) return json({ error: resolved.message, code: resolved.error }, resolved.status)
  const source = resolved.viewer.playlistUrl
  const plain = !isXtreamUrl(source)

  /** Live containers the panel advertises (`allowed_output_formats`). */
  let liveFmt: LiveFormats | null = null

  /**
   * `info=1` — capability handshake for the player. The engine ladder must lead
   * with mpegts.js for TS-only panels, otherwise hls.js commits to a `.m3u8`
   * the provider refuses and the player loops on a false slot-limit error.
   */
  if (reqUrl.searchParams.get('info') === '1') {
    // `refresh=1` re-probes the panel now: an admin changing the provider's
    // allowed output formats does not have to wait out the 10 min cache TTL.
    const force = reqUrl.searchParams.get('refresh') === '1'
    if (force && !plain) invalidateLiveFormats(source)
    const fmt = plain
      ? { formats: [], tsOnly: false, hls: false }
      : await liveFormats(source, 6_000, { force })
    return new Response(
      JSON.stringify({
        kind: plain ? 'm3u' : 'xtream',
        ...fmt,
        refreshed: force,
        cacheAgeMs: plain ? null : liveFormatsAge(source),
        candidateOrder: plain ? [] : liveFormatOrder(fmt as LiveFormats),
      }),
      {
        headers: {
          ...cors,
          'Content-Type': 'application/json',
          'Cache-Control': force ? 'no-store' : 'private, max-age=300',
        },
      },
    )
  }

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
    const { username, password } = parseXtream(source)
    // Which live containers the panel actually serves. TS-only providers refuse
    // `.m3u8` with a private status that looks like a slot limit, so the
    // impossible candidate is never built for them.
    if (kind === 'live') liveFmt = await liveFormats(source)
    const build = (cred: string) => {
      if (kind === 'live') {
        // Order comes from the panel's advertised formats, with a minimal
        // ts-then-m3u8 probe when it advertises nothing at all.
        return liveFormatOrder(liveFmt, rawFirst).map(
          (f) => `${cred}/live/${username}/${password}/${streamId}.${f}`,
        )
      }
      // Provider's real container_extension (sent by the client as `ext`) is
      // tried FIRST and alone; the broad matrix is only a fallback when that
      // specific hint fails, so a correct hint commits on attempt #1.
      const dirs = kind === 'series' ? ['series', 'movie'] : ['movie', 'series']
      const url = (d: string, ext: string) => `${cred}/${d}/${username}/${password}/${streamId}.${ext}`
      const primary = extHint ? [url(dirs[0], extHint), url(dirs[1], extHint)] : []
      const fallbackExts = ['mp4', 'mkv', 'avi'].filter((e) => e !== extHint)
      const fallback = fallbackExts.flatMap((ext) => dirs.map((d) => url(d, ext)))
      return [...primary, ...fallback]
    }
    // http/https are both tried (best guess first) so any provider works as-is.
    candidates = [...new Set(xtreamOrigins(source).flatMap(build))]



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

  /**
   * `resolve=1` — direct-play handshake.
   *
   * Streaming megabytes of TS/MP4 through an Edge Function adds a hop, a CPU
   * budget and a hard wall-clock limit: that is what produced the buffering and
   * timeouts. So the browser asks for the *URL* instead of the bytes: we resolve
   * the provider's tokenized location server-side (credentials never leave the
   * server beyond the signed URL the provider itself issues) and the player
   * fetches media straight from the CDN.
   *
   * `direct` is only true for https targets — an http URL would be blocked as
   * mixed content on our https origin, and those keep using the proxy path.
   */
  if (reqUrl.searchParams.get('resolve') === '1') {
    const target = candidates[0]
    if (!target) return json({ error: 'No candidate' }, 404)
    let url = target
    try {
      url = await resolveTokenizedUrl(
        target,
        { ...baseHeaders, 'User-Agent': uaList[0] },
        AbortSignal.timeout(6_000),
      )
    } catch {
      // Redirect probing failed: the un-resolved candidate is still worth a try.
    }
    /**
     * VOD only: a movie/episode is worthless without seeking. Some panels/CDNs
     * answer a ranged request with a full-body 200, and the media element then
     * reports a length it cannot seek inside — the exact reason playback jumped
     * to the end after a few seconds. Probe one tiny range: when the provider
     * does NOT honour it, direct play is refused and the proxy path (which
     * fabricates proper 206 slices) is used instead.
     */
    let ranges: boolean | null = null
    if (kind !== 'live' && /^https:\/\//i.test(url)) {
      try {
        const probe = await fetch(url, {
          headers: { ...baseHeaders, Range: 'bytes=0-1', 'User-Agent': uaList[0] },
          redirect: 'follow',
          signal: AbortSignal.timeout(6_000),
        })
        ranges =
          probe.status === 206 &&
          /bytes/i.test(probe.headers.get('content-range') ?? '')
        await probe.body?.cancel().catch(() => undefined)
      } catch {
        ranges = null
      }
    }
    const direct = /^https:\/\//i.test(url) && (kind === 'live' || ranges === true)
    return new Response(
      JSON.stringify({
        url,
        direct,
        ranges,
        candidates: candidates.length,
        format: candidateFormat(target),
        tsOnly: Boolean(liveFmt?.tsOnly),
      }),
      { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=20' } },
    )
  }



  let upstream: Response | null = null
  /** Provider URL the committed response really came from (relay-aware). */
  let upstreamBase = candidates[0] ?? ''
  /** Container of the candidate the ladder committed to (diagnostics header). */
  let chosenFmt = candidateFormat(candidates[0] ?? '')
  let lastError = 'fetch failed'
  let deadlineHit = false
  const trace: string[] = []

  const OVERALL_DEADLINE_MS = 12_000
  const startedAt = Date.now()
  const remaining = () => OVERALL_DEADLINE_MS - (Date.now() - startedAt)

  /** Fatal per-host errors: another UA/transport will not help. */
  const isDeadHost = (msg: string) =>
    msg.startsWith('Connection refused') || msg.startsWith('Host not found')

  // Attempt plan: media ALWAYS goes through the configured egress relay first.
  // This provider rejects the Edge region with non-standard 45x statuses (458
  // included), so probing it directly first both creates a false
  // MAX_CONNECTIONS verdict and can briefly occupy the account's only slot.
  // egressFetch already falls back to direct when the relay itself is down, so a
  // second explicit direct request here is unnecessary and harmful for
  // max_connections=1 accounts.
  type Attempt = { target: string; via: 'direct' | 'relay'; ua: string }
  const plan: Attempt[] = []
  for (const target of candidates) {
    plan.push({ target, via: 'relay', ua: uaList[0] })
  }
  for (const ua of uaList.slice(1)) {
    plan.push({ target: candidates[0], via: 'relay', ua })
  }

  const deadHosts = new Set<string>()
  /** Best classified reason so far — shown to the user if nothing plays. */
  let classified: StreamError | null = null
  let rateLimited = false
  /** Provider answered 458/407 — the account's viewing slots are all in use. */
  let slotLimited = false

  /**
   * `host|via|format` triples the provider refuses — no UA rotation can fix
   * those. The FORMAT is part of the key on purpose: a panel that only serves
   * transport streams answers `.m3u8` with 407/458, and blocking the whole host
   * on that verdict meant the working `.ts` candidate was never tried. Genuine
   * host-wide refusals (rate limits, geo blocks) still block every format below.
   */
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
    const fmt = candidateFormat(target)
    if (deadHosts.has(hostKey)) continue
    if (blockedRoutes.has(`${hostKey}|${via}`)) continue
    if (blockedRoutes.has(`${hostKey}|${via}|${fmt}`)) continue
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
      // Live streams must use exactly ONE upstream connection. Resolving a 302
      // directly before opening the relayed media request briefly occupies the
      // subscriber's only Xtream slot; the actual relay request then receives
      // HTTP 458/MAX_CONNECTIONS. Let the relay follow the live redirect in the
      // same request instead. Keep the established token-resolution path for
      // Movies/Series, whose playback and Range handling already work.
      const hopTarget = via === 'relay' && kind !== 'live'
        ? await resolveTokenizedUrl(target, headers, signal)
        : target
      const res =
        via === 'direct'
          ? await fetch(target, { headers, redirect: 'follow', signal })
          : await egressFetch(hopTarget, { headers, redirect: 'follow', signal }, { stream: true })
      if (res.ok || res.status === 206) {
        const ctype = res.headers.get('content-type') || ''
        const resolvedUrl = finalUrlOf(res, hopTarget)

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
          chosenFmt = fmt
        upstream = new Response(text, {
            status: 200,
            headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
          })
          upstreamBase = resolvedUrl
          break
        }
        // Some Xtream panels incorrectly label valid MP4/MKV/episode byte
        // streams as text/html. Header-only HTML detection therefore breaks all
        // VOD while manifests still work. Only reject an HTML content type here
        // when the request is not a ranged/progressive media response; genuine
        // block pages on manifests are body-checked above.
        if (isHtmlBlock(ctype) && !range && kind === 'live') {
          await res.body?.cancel().catch(() => undefined)
          lastError = 'provider returned a block page (HTML)'
          continue
        }
        chosenFmt = fmt
        upstream = res
        upstreamBase = resolvedUrl
        clearCooldown(target)
        break
      }
      // 458/407 from the relayed provider response usually means the Xtream
      // account is at its viewing limit. But panels that do not serve HLS answer
      // a `.m3u8` request with exactly those statuses, so when another container
      // is still untried this is a FORMAT refusal: rule out that one format for
      // the host and keep going instead of reporting a false "slots in use".
      if (res.status === 458 || res.status === 407) {
        const otherFormats = candidates.some(
          (c) => candidateFormat(c) !== fmt && !blockedRoutes.has(`${hostKey}|${via}|${candidateFormat(c)}`),
        )
        const formatRefusal =
          refusalScope({ status: res.status, kind, format: fmt, otherFormatsUntried: otherFormats }) === 'format'
        if (via === 'relay') {
          if (formatRefusal) {
            blockedRoutes.add(`${hostKey}|relay|${fmt}`)
          } else {
            slotLimited = true
            classified = streamError('MAX_CONNECTIONS', `HTTP ${res.status}`)
            blockedRoutes.add(`${hostKey}|relay`)
          }
        } else {
          if (!formatRefusal) geoBlocked = true
          blockedRoutes.add(formatRefusal ? `${hostKey}|direct|${fmt}` : `${hostKey}|direct`)
        }
        lastError = `HTTP ${res.status}`
        trace.push(`${via}:${res.status}:${fmt}${formatRefusal ? ':fmt' : ''}`)
        await res.body?.cancel().catch(() => undefined)
        continue
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
    const error: StreamError = slotLimited
      ? streamError('MAX_CONNECTIONS')
      : rateLimited
        ? streamError('RATE_LIMITED')
        : geoBlocked
          ? { code: 'GEO_BLOCKED', message: GEO_BLOCK_MESSAGE, retryable: true }
          : deadlineHit
            ? streamError('TIMEOUT', `${OVERALL_DEADLINE_MS / 1000}s`)
            : (classified ?? classifyTransport(lastError))
    console.error(
      `[iptv-stream] ${JSON.stringify({ kind, streamId, candidates: candidates.length, deadlineHit, geoBlocked, rateLimited, slotLimited, code: error.code, lastError, trace })}`,
    )
    return json(
      {
        error: error.message,
        code: error.code,
        retryable: error.retryable,
        deadline: deadlineHit,
        geoBlocked,
        rateLimited,
        slotLimited,
        detail: lastError,
        candidates: candidates.length,
      },
       softErrors && (rateLimited || slotLimited) ? 200 : rateLimited || slotLimited ? 429 : 502,
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
      `${resolved.viewer.sourceId ? `&source=${encodeURIComponent(resolved.viewer.sourceId)}` : ''}` +
      `${hRaw ? `&h=${encodeURIComponent(hRaw)}` : ''}`

    const text = await upstream.text()
    return new Response(rewritePlaylist(text, upstreamBase, SELF(req), suffix), {
      status: upstream.status,
      headers: {
        ...cors,
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-store',
        'Access-Control-Expose-Headers': 'Content-Type, X-Iptv-Format, X-Iptv-Upstream-Type',
        'X-Iptv-Format': chosenFmt,
        'X-Iptv-Upstream-Type': ct || 'unknown',
      },
    })
  }

  const out = new Headers(cors)
  out.set('Content-Type', ct || 'application/octet-stream')
  out.set('Accept-Ranges', 'bytes')
  out.set('Cache-Control', 'no-store')
  // Media stacks and debug fetches must be able to READ the range headers on a
  // cross-origin response, otherwise CORS hides them and seeking breaks.
  out.set(
    'Access-Control-Expose-Headers',
    'Content-Range, Content-Length, Accept-Ranges, Content-Type, X-Iptv-Format, X-Iptv-Upstream-Type',
  )
  // Live diagnostics: which container the ladder committed to, and what the
  // provider actually answered with.
  out.set('X-Iptv-Format', chosenFmt)
  out.set('X-Iptv-Upstream-Type', ct || 'unknown')
  const cr = upstream.headers.get('content-range')
  const clen = upstream.headers.get('content-length')
  console.log(
    `[iptv-stream:media] ${JSON.stringify({ kind, streamId, reqRange: range ?? null, upstreamStatus: upstream.status, ct, contentRange: cr, contentLength: clen })}`,
  )


  // Upstream honoured the Range request: pass 206 + range headers through.
  //
  // BUT some Xtream panels answer a SUFFIX range (`bytes=-N`, which is exactly
  // what a browser sends to read a non-faststart MP4's trailing `moov` atom)
  // with a MALFORMED header that echoes the request instead of the resolved
  // window: `Content-Range: bytes -131072/4181661025`. Per RFC 7233 that is
  // invalid, so Chromium/Safari discard the whole response and the <video>
  // element reports MEDIA_ERR_SRC_NOT_SUPPORTED with readyState 0 — the movie
  // never starts. Normalise it from the total size and the body length before
  // forwarding.
  if (cr) {
    let fixed = cr
    const wellFormed = /^bytes\s+\d+-\d+\/(\d+|\*)$/i.test(cr.trim())
    if (!wellFormed) {
      const total = Number(/\/(\d+)\s*$/.exec(cr)?.[1] ?? NaN)
      const len = Number(clen ?? NaN)
      if (Number.isFinite(total) && Number.isFinite(len) && len > 0 && len <= total) {
        // A suffix window always ends at the last byte of the resource.
        const end = total - 1
        const start = Math.max(0, total - len)
        fixed = `bytes ${start}-${end}/${total}`
      }
    }
    if (fixed !== cr) console.log(`[iptv-stream:media] normalised Content-Range "${cr}" -> "${fixed}"`)
    out.set('Content-Range', fixed)
    if (clen) out.set('Content-Length', clen)
    return new Response(upstream.body, { status: upstream.status, headers: out })
  }


  // Upstream (or our relay) ignored Range and answered a full-body 200. A
  // <video> element needs a 206 with Content-Range to start progressive
  // playback, so synthesize one: skip `start` bytes and stop after the
  // requested window instead of streaming the whole file.
  const parsed = range ? /^bytes=(\d*)-(\d*)$/i.exec(range.trim()) : null
  // A SUFFIX range (`bytes=-N`, used to read a non-faststart MP4's trailing
  // `moov` atom) cannot be honoured without a known total size: answering it
  // with leading bytes would hand the demuxer corrupt data. Be honest instead.
  const suffixRange = !!parsed && !parsed[1] && !!parsed[2]
  if (suffixRange && !clen) {
    await upstream.body?.cancel().catch(() => undefined)
    out.set('Content-Range', 'bytes */*')
    return new Response(null, { status: 416, headers: out })
  }
  if (parsed && upstream.status === 200 && upstream.body) {
    const total = clen ? Number(clen) : NaN
    const start = parsed[1] ? Number(parsed[1]) : suffixRange ? Math.max(0, total - Number(parsed[2])) : 0
    const endReq = parsed[1] && parsed[2] ? Number(parsed[2]) : suffixRange ? total - 1 : NaN

    // Cap an open-ended range so we never buffer an entire movie in memory.
    const OPEN_WINDOW = 4 * 1024 * 1024
    const end = Number.isFinite(endReq)
      ? endReq
      : Number.isFinite(total)
        ? total - 1
        : start + OPEN_WINDOW - 1
    if (!Number.isFinite(start) || start < 0 || end < start) {
      await upstream.body.cancel().catch(() => undefined)
      return new Response(null, { status: 416, headers: out })
    }
    const wanted = end - start + 1
    const reader = upstream.body.getReader()
    let skipped = 0
    let sent = 0
    const sliced = new ReadableStream<Uint8Array>({
      async pull(controller) {
        while (true) {
          const { done, value } = await reader.read()
          if (done || !value) {
            controller.close()
            return
          }
          let chunk = value
          if (skipped < start) {
            const need = start - skipped
            if (chunk.byteLength <= need) {
              skipped += chunk.byteLength
              continue
            }
            chunk = chunk.subarray(need)
            skipped = start
          }
          if (sent + chunk.byteLength > wanted) chunk = chunk.subarray(0, wanted - sent)
          sent += chunk.byteLength
          controller.enqueue(chunk)
          if (sent >= wanted) {
            controller.close()
            await reader.cancel().catch(() => undefined)
          }
          return
        }
      },
      cancel: (reason) => reader.cancel(reason).catch(() => undefined),
    })
    out.set('Content-Range', `bytes ${start}-${end}/${Number.isFinite(total) ? total : '*'}`)
    out.set('Content-Length', String(wanted))
    return new Response(sliced, { status: 206, headers: out })
  }

  if (clen) out.set('Content-Length', clen)
  return new Response(upstream.body, { status: upstream.status, headers: out })
})

