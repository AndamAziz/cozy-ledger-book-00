/**
 * Egress relay for ALL IPTV provider traffic (API calls, m3u8 playlists and
 * .ts segments).
 *
 * The provider geo-blocks the edge region and answers HTTP 459
 * ("country-not-allow"). Our own VPS relay sits in an allowed country, so every
 * upstream request is sent as:
 *
 *   ${IPTV_EGRESS_PROXY_URL}?url=<encoded target>
 *   X-Relay-Token: ${IPTV_EGRESS_PROXY_TOKEN}
 *
 * The relay follows redirects server-side and returns the final resolved URL in
 * the `X-Final-URL` response header — that value must be used as the base when
 * resolving relative paths inside an m3u8 playlist.
 */

let cachedTemplate: string | null | undefined
let cachedToken: string | null | undefined

/** Default relay endpoint — the confirmed working contract is `/proxy?url=…`. */
const DEFAULT_RELAY = 'https://relay.andam.uk:8443/proxy'

function template(): string | null {
  if (cachedTemplate === undefined) {
    const raw = (Deno.env.get('IPTV_EGRESS_PROXY_URL') ?? '').trim()
    cachedTemplate = raw || DEFAULT_RELAY
  }
  return cachedTemplate ?? null
}

function token(): string | null {
  if (cachedToken === undefined) {
    const raw = (Deno.env.get('RELAY_TOKEN') ?? Deno.env.get('IPTV_EGRESS_PROXY_TOKEN') ?? '').trim()
    if (!raw) {
      console.error(
        '[iptvEgress] MISSING RELAY_TOKEN — relay requests will be rejected (HTTP 403). Set the RELAY_TOKEN secret.',
      )
    }
    cachedToken = raw || null
  }
  return cachedToken ?? null
}

/** True when an egress relay is configured. */
export function hasEgressProxy(): boolean {
  return template() !== null
}

/**
 * Wrap an upstream URL so the request leaves through the relay.
 * Contract: `<relay-origin>/proxy?url=<encoded target>` + `X-Relay-Token`.
 */
export function egressUrl(target: string): string {
  const t = template()
  if (!t) return target
  const encoded = encodeURIComponent(target)
  if (t.includes('{url}')) return t.replace('{url}', encoded)
  let base = t.replace(/\/+$/, '')
  // Accept a bare origin in config and normalise it onto the /proxy path.
  if (!/\/proxy(\?|$)/i.test(base) && !base.includes('?')) base = `${base}/proxy`
  return `${base}${base.includes('?') ? '&' : '?'}url=${encoded}`
}

/** Headers the relay itself needs (auth token). */
export function egressHeaders(base: HeadersInit = {}): Headers {
  const h = new Headers(base)
  const tk = token()
  if (tk && hasEgressProxy()) h.set('X-Relay-Token', tk)
  return h
}

/**
 * Fetch an upstream IPTV URL through the relay (or directly when no relay is
 * configured). The response body is NOT buffered — callers stream it.
 *
 * If the relay itself is unreachable (down, DNS/TLS failure, timeout) we fall
 * back to a direct fetch so metadata calls keep working even while the VPS is
 * offline.
 */
export async function egressFetch(
  target: string,
  init: RequestInit = {},
  opts: { direct?: boolean } = {},
): Promise<Response> {
  if (opts.direct || !hasEgressProxy()) {
    return await fetch(target, { ...init, redirect: 'follow' })
  }
  try {
    const res = await fetch(egressUrl(target), {
      ...init,
      redirect: 'follow',
      headers: egressHeaders(init.headers ?? {}),
    })
    // The relay is up but could not reach the provider (502/504/503): retry the
    // request directly so metadata keeps working while the VPS misbehaves.
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      console.warn(`[iptvEgress] relay unusable (HTTP ${res.status}) — falling back to direct`)
      await res.body?.cancel().catch(() => {})
      try {
        return await fetch(target, { ...init, redirect: 'follow' })
      } catch {
        return res
      }
    }
    // The relay itself rejected US (bad/missing X-Relay-Token). Its own 401/403
    // must never be reported as a provider refusal: it advertises the relay
    // token header in CORS and never proxies upstream headers on that path.
    if (res.status === 401 || res.status === 403) {
      const acah = (res.headers.get('access-control-allow-headers') ?? '').toLowerCase()
      const selfRejected = acah.includes('x-relay-token') || !!res.headers.get('x-powered-by')
      if (selfRejected) {
        console.error(
          `[iptvEgress] relay rejected our token (HTTP ${res.status}) — check IPTV_EGRESS_PROXY_TOKEN; falling back to direct`,
        )
        await res.body?.cancel().catch(() => {})
        try {
          return await fetch(target, { ...init, redirect: 'follow' })
        } catch {
          return res
        }
      }
    }
    return res

  } catch (e) {
    console.warn(`[iptvEgress] relay unreachable (${e instanceof Error ? e.message : 'error'}) — falling back to direct`)
    return await fetch(target, { ...init, redirect: 'follow' })
  }
}



/**
 * The URL the relay actually ended up on, after following redirects. Used as
 * the base for resolving relative m3u8 segment paths.
 */
export function finalUrlOf(res: Response, fallback: string): string {
  const header = res.headers.get('x-final-url') ?? res.headers.get('X-Final-URL')
  if (header && /^https?:\/\//i.test(header.trim())) return header.trim()
  // Without a relay, fetch() exposes the resolved URL directly.
  if (res.url && !res.url.startsWith(template() ?? '\u0000')) return res.url
  return fallback
}

/** Provider geo-block signature (Xtream panels answer 459 / "country-not-allow"). */
export function isGeoBlocked(status: number, body?: string): boolean {
  if (status === 459 || status === 451) return true
  return !!body && /country[-\s]?not[-\s]?allow|geo[-\s]?block/i.test(body)
}

export const GEO_BLOCK_MESSAGE =
  'The stream relay could not reach the provider. Please try again in a moment.'
