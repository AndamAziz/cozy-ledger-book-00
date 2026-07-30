import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { parseXtream, isXtreamUrl, getM3U } from '../_shared/iptvConfig.ts'
import { resolveViewer, tokenFromRequest } from '../_shared/iptvViewer.ts'
import { egressFetch, finalUrlOf, hasEgressProxy, isGeoBlocked, GEO_BLOCK_MESSAGE } from '../_shared/iptvEgress.ts'
import { absorbCookies, cookieHeaderFor, isCloudflareChallenge } from '../_shared/iptvCookies.ts'
import { diagFetchRaw, type UpstreamDiag } from '../_shared/iptvDiag.ts'

/**
 * Browser playback needs explicit CORS on EVERY response — manifests, segments,
 * keys and errors alike — otherwise hls.js/mpegts.js abort the fetch.
 */
const cors: Record<string, string> = {
  ...corsHeaders,
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
}

const MOBILE_UA = 'IPTVSmartersPro/4.0.4 (Linux; Android 12) ExoPlayerLib/2.19.1'
const VLC_UA = 'VLC/3.0.20 LibVLC/3.0.20'
// Cloudflare bot-management scores a real desktop Chrome UA + client hints much
// higher than a bare player UA; used as the last handshake attempt.
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const SLOT_LIMIT_STATUS = 429

type UaKind = 'mobile' | 'vlc' | 'chrome'

/** Connect timeout for the upstream handshake (headers only — the body streams freely). */
const CONNECT_TIMEOUT_MS = 15000

function buildUpstreamHeaders(
  req: Request,
  upstream: URL,
  refererBase?: string,
  ua: UaKind = 'mobile',
): Record<string, string> {
  const headers: Record<string, string> = {
    // Most IPTV apps identify as an Android/ExoPlayer-style client. Keeping the
    // raw provider request server-side lets HTTP streams work from the HTTPS app
    // and avoids browser User-Agent / mixed-content limitations.
    'User-Agent': ua === 'vlc' ? VLC_UA : ua === 'chrome' ? CHROME_UA : MOBILE_UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    // Media is already compressed; a gzip/br hop through the relay only adds a
    // decoder that can truncate ("error reading a body from connection").
    'Accept-Encoding': 'identity',
    'Icy-MetaData': '1',
    'X-Requested-With': 'com.nathnetwork.xciptv',
    'Connection': 'keep-alive',
  }

  if (ua === 'chrome') {
    // Client hints + fetch metadata: Cloudflare flags a "Chrome" UA that sends
    // none of these as an obvious bot.
    headers['sec-ch-ua'] = '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="99"'
    headers['sec-ch-ua-mobile'] = '?0'
    headers['sec-ch-ua-platform'] = '"Windows"'
    headers['Sec-Fetch-Dest'] = 'empty'
    headers['Sec-Fetch-Mode'] = 'cors'
    headers['Sec-Fetch-Site'] = 'cross-site'
    headers['Accept'] = '*/*'
    delete headers['X-Requested-With']
    delete headers['Icy-MetaData']
  }

  const range = req.headers.get('range')
  if (range) headers['Range'] = range

  const origin = refererBase ?? `${upstream.protocol}//${upstream.host}/`
  headers['Origin'] = origin.replace(/\/$/, '')
  headers['Referer'] = origin.endsWith('/') ? origin : `${origin}/`

  // Replay Cloudflare clearance / panel session cookies handed out by earlier
  // requests to this host, exactly like a native IPTV app's HTTP client does.
  const cookie = cookieHeaderFor(upstream.toString())
  if (cookie) headers['Cookie'] = cookie

  return headers
}


/**
 * Pull the first chunk off an upstream body before handing it to the player.
 *
 * Edge → relay connections are pooled and are occasionally reused after the
 * peer already closed them, which surfaces as "error reading a body from
 * connection" the moment the body is read. Priming lets us detect that failure
 * while a retry is still possible, instead of the player receiving a broken
 * stream and hanging on "Connecting to stream…".
 */
async function primeBody(res: Response): Promise<ReadableStream<Uint8Array> | null> {
  if (!res.body) return new ReadableStream({ start: (c) => c.close() })
  const reader = res.body.getReader()
  let first: ReadableStreamReadResult<Uint8Array>
  try {
    first = await reader.read()
  } catch {
    try {
      await reader.cancel()
    } catch { /* already torn down */ }
    return null
  }
  return new ReadableStream<Uint8Array>({
    start(c) {
      if (first.value) c.enqueue(first.value)
      if (first.done) c.close()
    },
    async pull(c) {
      try {
        const { done, value } = await reader.read()
        if (done) c.close()
        else if (value) c.enqueue(value)
      } catch (e) {
        c.error(e)
      }
    },
    cancel(reason) {
      reader.cancel(reason).catch(() => undefined)
    },
  })
}


/**
 * Playlist vs segment vs key — logged as separate tags so a timing-out segment
 * can be told apart from a rejected manifest in the function logs.
 */
export function resourceTag(url: string): 'stream-playlist' | 'stream-segment' | 'stream-key' {
  try {
    const p = new URL(url).pathname.toLowerCase()
    if (/\.m3u8?$/.test(p)) return 'stream-playlist'
    if (/\/key|\.key$/.test(p)) return 'stream-key'
    return 'stream-segment'
  } catch {
    return 'stream-segment'
  }
}

async function fetchUpstream(
  url: string,
  headers: Record<string, string>,
  clientSignal?: AbortSignal,
  direct = false,
  attempt = 1,
  onDiag?: (d: UpstreamDiag) => void,
): Promise<Response> {
  // All provider traffic exits through our own VPS relay (allowed country).
  // `direct` is an admin-only diagnostic that bypasses the relay.
  // diagFetchRaw wraps the fetch itself in try/catch, applies the AbortController
  // timeout and logs the redacted URL / status / duration / headers / errorKind.
  const { res, diag } = await diagFetchRaw(resourceTag(url), url, {
    timeoutMs: CONNECT_TIMEOUT_MS,
    attempt,
    headers,
    signal: clientSignal,
    direct,
    onDiag,
  })

  if (!res) {
    const e = new Error(diag.message ?? 'Upstream request failed') as Error & { diag?: UpstreamDiag }
    e.diag = diag
    throw e
  }
  return res
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
  ua: UaKind

  status: number | null
  contentType: string | null
  ms: number
  accepted?: boolean
  error?: string
}

const SIGNATURE_TTL_SECONDS = 10 * 60
let hmacKey: Promise<CryptoKey | null> | null = null

function signingSecret(): string | null {
  return (Deno.env.get('IPTV_ENC_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim() || null
}

function signingKey(): Promise<CryptoKey | null> {
  if (!hmacKey) {
    const secret = signingSecret()
    hmacKey = secret
      ? crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign', 'verify'],
        )
      : Promise.resolve(null)
  }
  return hmacKey
}

function b64url(bytes: ArrayBuffer): string {
  let binary = ''
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/** Short-lived signature for CDN segment/key URLs emitted from rewritten m3u8 files. */
async function signPassthrough(url: string, exp: number): Promise<string | null> {
  const key = await signingKey()
  if (!key) return null
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${exp}\n${url}`))
  return b64url(mac)
}

async function validPassthroughSignature(url: string, expRaw: string | null, sig: string | null): Promise<boolean> {
  if (!expRaw || !sig) return false
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false
  const expected = await signPassthrough(url, exp)
  if (!expected || expected.length !== sig.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  return diff === 0
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const reqUrlEarly = new URL(req.url)
  const debugParam = (reqUrlEarly.searchParams.get('debug') ?? '').toLowerCase()
  // debug=1 → compact X-IPTV-Debug header. debug=json → admin-only JSON report.
  const debugHeaderOn = debugParam === '1' || debugParam === 'true' || debugParam === 'json'
  const debugJson = debugParam === 'json' && (await isAdminRequest(req))
  // Admin-only diagnostic: bypass the VPS relay and hit the provider directly.
  const directEgress =
    (reqUrlEarly.searchParams.get('egress') ?? '') === 'direct' && (debugJson || (await isAdminRequest(req)))
  const attempts: Attempt[] = []
  let chosen: Attempt | null = null
  // Last upstream diagnostic for this request (surfaced in logs + error JSON).
  let lastDiag: UpstreamDiag | null = null

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
        { requestId, attempts, chosen, candidateCount: attempts.length, upstream: lastDiag, ...extra },
        null,
        2,
      ),
      { status, headers: { ...cors, ...debugHeaders(), 'Content-Type': 'application/json' } },
    )

  const err = (msg: string, status: number, code?: string) =>
    debugJson
      ? debugReport({ error: msg, code }, 200)
      : new Response(JSON.stringify({ error: msg, code, reqId: requestId, upstream: lastDiag }), {
          status,
          headers: { ...cors, ...debugHeaders(), 'Content-Type': 'application/json' },
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

  // Candidate upstreams: browser-capable HLS for iOS/Safari, raw TS first for
  // Chrome/Android/desktop so one-slot providers are not forced into many HLS
  // segment connections. VOD/series try their real /movie or /series path first.
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
    const browserUa = req.headers.get('user-agent') ?? ''
    const needsNativeHls = /iphone|ipad|ipod/i.test(browserUa) || (/safari/i.test(browserUa) && !/chrome|chromium|crios|android/i.test(browserUa))
    const liveCandidates = needsNativeHls || extHint === 'm3u8' ? [live, liveTs] : [liveTs, live]
    candidates = kind === 'live' ? liveCandidates : [...vod, live]

    upstream = new URL(candidates[0])

  } else if (passthrough) {
    try {
      upstream = new URL(passthrough)
    } catch {
      return err('Invalid url', 400)
    }
    // Only the provider host or its HLS edge nodes may be proxied.
    // Panels redirect segments to CDN nodes under /hls/, /hlsr/ or /hlsr2/.
    const isEdgeSegment = /^\/(hlsr?\d*|live|movie|series|stream|streams|play|playlist|key|keys|cdn|edge)\//i.test(
      upstream.pathname,
    )
    const signed = await validPassthroughSignature(
      upstream.toString(),
      reqUrl.searchParams.get('exp'),
      reqUrl.searchParams.get('sig'),
    )
    const allowed = plain ? !!plainHosts?.has(upstream.host) : upstream.host === host
    if (!allowed && !isEdgeSegment && !signed) return err('Host not allowed', 403)
    candidates = [upstream.toString()]
  } else {
    return err('Missing id or u parameter', 400)
  }

  const publicBase = (Deno.env.get('SUPABASE_URL') ?? reqUrl.origin).replace(/\/$/, '')
  const base = `${publicBase}/functions/v1/iptv-proxy`
  const apikey = reqUrl.searchParams.get('apikey')
  // Segment/keys URLs are fetched by the player without headers, so the
  // viewer's token has to ride along on the rewritten playlist entries.
  const viewerToken = tokenFromRequest(req)
  const proxied = async (u: string) => {
    const exp = Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS
    const sig = await signPassthrough(u, exp)
    return (
      `${base}?u=${encodeURIComponent(u)}` +
      `${apikey ? `&apikey=${encodeURIComponent(apikey)}` : ''}` +
      `${viewerToken ? `&token=${encodeURIComponent(viewerToken)}` : ''}` +
      `${sig ? `&exp=${exp}&sig=${encodeURIComponent(sig)}` : ''}`
    )
  }

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
    const record = (u: string, ua: UaKind, started: number, r: Response | null, error?: string) => {
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
    // Hosts that are NOT the subscriber's panel (jmvstream / dai.google.com /
    // broadcaster CDNs that a 24/7 channel's playlist points at) are ordinary
    // public CDNs: they are not geo-blocked, so when the relay hop misbehaves we
    // may retry them straight from the edge.
    const isThirdPartyHost = (h: string) => !!host && h !== host
    const tryFetch = async (u: string, opts: { direct?: boolean } = {}) => {
      const nextUrl = new URL(u)
      const referer = plain ? `${nextUrl.protocol}//${nextUrl.host}/` : refererBase
      const useDirect = directEgress || opts.direct === true
      // Each attempt re-reads the cookie jar, so clearance cookies handed out by
      // the previous attempt (or by the manifest request) ride along.
      let attemptNo = 0

      const attempt = async (ua: UaKind) => {
        const t0 = Date.now()
        attemptNo += 1
        const res = await fetchUpstream(
          u,
          buildUpstreamHeaders(req, nextUrl, referer, ua),
          req.signal,
          useDirect,
          attemptNo,
          (d) => {
            lastDiag = d
          },
        )
        absorbCookies(res, u)
        record(u, ua, t0, res)
        return res
      }
      try {
        const first = await attempt('mobile')
        if (first.ok || isSlot(first.status) || isGeoBlocked(first.status)) return first
        const cfFirst = isCloudflareChallenge(first)
        await first.body?.cancel()

        // Cloudflare-fronted providers reject bare player UAs: retry immediately
        // as desktop Chrome (client hints + fetch metadata + session cookies).
        if (cfFirst) {
          const cf = await attempt('chrome')
          if (cf.ok || isSlot(cf.status) || isGeoBlocked(cf.status)) return cf
          await cf.body?.cancel()
        }

        // Some older panels whitelist VLC/libVLC instead of ExoPlayer. Retry the
        // handshake once with VLC headers before marking the channel offline.
        const second = await attempt('vlc')
        if (second.ok || cfFirst || isSlot(second.status) || isGeoBlocked(second.status)) return second
        await second.body?.cancel()

        // Last resort for hosts that only answer challenged responses on later
        // requests (Cloudflare rotates __cf_bm mid-session).
        return await attempt('chrome')
      } catch (e) {
        const d = (e as { diag?: UpstreamDiag })?.diag
        if (d) lastDiag = d
        console.error(`[iptv-proxy] ${JSON.stringify({ reqId: requestId, upstream: d ?? { message: String(e) } })}`)
        record(u, 'mobile', Date.now(), null, d ? `${d.kind}: ${d.message ?? ''}`.trim() : e instanceof Error ? e.message : String(e))
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
    let active: Response = res



    const ct = active.headers.get('content-type') ?? ''
    const isPlaylist = ct.includes('mpegurl') || /\.m3u8?$/i.test(upstream.pathname)
    const chosenUrl = upstream.toString()
    // A pooled edge→relay connection can be dead on arrival; the failure only
    // shows when the body is read. Re-open the same upstream a bounded number of
    // times — with backoff, and with the relay bypassed for third-party CDN
    // hosts, since the relay hop is what drops these bodies — before telling the
    // player the channel is down.
    const BODY_RETRIES = 2
    const BODY_BACKOFF_MS = [400, 1200]
    const thirdParty = isThirdPartyHost(upstream.host)
    // Retry #1 keeps the relay (transient pooled-socket drop); retry #2 goes
    // straight to the CDN when that host does not need the geo relay.
    const retryDirect = (i: number) => thirdParty && i >= 1
    const reopen = async (i: number) => {
      await new Promise((r) => setTimeout(r, BODY_BACKOFF_MS[i] ?? 1200))
      if (req.signal.aborted) return null
      return await tryFetch(chosenUrl, { direct: retryDirect(i) })
    }

    if (isPlaylist) {
      let text: string | null = null
      let current: Response = active
      for (let i = 0; i <= BODY_RETRIES; i++) {
        try {
          text = await current.text()
          break
        } catch (_e) {
          if (i === BODY_RETRIES) break
          const again = await reopen(i)
          if (!again) break
          current = again
        }
      }
      active = current
      if (text === null) return err('Stream connection dropped. Try again.', 502, 'BODY_ERROR')


      if (!active.ok) {
        const slot = active.status === 458 || active.status === 429 || active.status === 407
        if (isGeoBlocked(active.status, text)) return geoBlockResponse()
        // 5xx / 521 / 404 mean the channel's own origin is down — not our error.
        const msg = slot
          ? 'All viewing slots are in use right now. Try again in a moment.'
          : `This channel is offline right now (${active.status}). Try another channel.`
        return slot ? slotLimitResponse() : err(msg, 502, 'OFFLINE')
      }

      // The relay follows redirects server-side; X-Final-URL is the host the
      // segment paths are relative to (the provider redirects before answering).
      const finalUrl = new URL(finalUrlOf(active, chosenUrl))
      const rewritten = (
        await Promise.all(text
        .split(/\r?\n/)
        .map(async (line) => {
          const t = line.trim()
          if (!t) return line
          if (t.startsWith('#')) {
            let out = t
            const matches = [...t.matchAll(/URI="([^"]+)"/g)]
            for (const m of matches) {
              const raw = m[1]
              out = out.replace(`URI="${raw}"`, `URI="${await proxied(new URL(raw, finalUrl).toString())}"`)
            }
            return out
          }
          return await proxied(new URL(t, finalUrl).toString())
        })))
        .join('\n')

      return new Response(rewritten, {
        status: 200,
        headers: {
          ...cors,
          ...debugHeaders(),
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-store',
        },
      })

    }

    // Provider slot limits come back as 458/429/407 — surface a readable message.
    if (!active.ok) {
      await active.body?.cancel()
      const slot = active.status === 458 || active.status === 429 || active.status === 407
      if (slot) return slotLimitResponse()
      if (isGeoBlocked(active.status)) return geoBlockResponse()
      return err(`This channel is offline right now (${active.status}). Try another channel.`, 502, 'OFFLINE')
    }

    let body = await primeBody(active)
    for (let i = 0; body === null && i < BODY_RETRIES; i++) {
      const again = await tryFetch(chosenUrl)
      if (!again) break
      if (!again.ok) {
        await again.body?.cancel()
        break
      }
      active = again
      body = await primeBody(again)
    }
    if (body === null) return err('Stream connection dropped. Try again.', 502, 'BODY_ERROR')

    const out = new Headers({ ...cors, ...debugHeaders() })

    // Providers frequently serve segments as text/plain or octet-stream, which
    // makes some browsers refuse the buffer — force the real media type.
    const path = upstream.pathname.toLowerCase()
    const byExt = /\.ts$/.test(path)
      ? 'video/mp2t'
      : /\.m4s$|\.mp4$/.test(path)
        ? 'video/mp4'
        : /\.aac$/.test(path)
          ? 'audio/aac'
          : /\.key$/.test(path)
            ? 'application/octet-stream'
            : ''
    const upstreamCt = (ct || '').toLowerCase()
    const ctUsable = upstreamCt.startsWith('video/') || upstreamCt.startsWith('audio/')
    out.set('Content-Type', byExt || (ctUsable ? ct : 'video/mp2t'))

    const len = active.headers.get('content-length')
    if (len) out.set('Content-Length', len)
    const cr = active.headers.get('content-range')
    if (cr) out.set('Content-Range', cr)
    out.set('Accept-Ranges', 'bytes')
    out.set('Cache-Control', 'no-store')

    return new Response(body, { status: active.status, headers: out })

  } catch (e) {
    return err(e instanceof Error ? e.message : String(e), 502)
  }
})
