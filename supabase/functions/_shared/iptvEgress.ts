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

function template(): string | null {
  if (cachedTemplate === undefined) {
    const raw = (Deno.env.get('IPTV_EGRESS_PROXY_URL') ?? '').trim()
    cachedTemplate = raw || null
  }
  return cachedTemplate ?? null
}

function token(): string | null {
  if (cachedToken === undefined) {
    const raw = (Deno.env.get('IPTV_EGRESS_PROXY_TOKEN') ?? '').trim()
    cachedToken = raw || null
  }
  return cachedToken ?? null
}

/** True when an egress relay is configured. */
export function hasEgressProxy(): boolean {
  return template() !== null
}

/** Wrap an upstream URL so the request leaves through the configured relay. */
export function egressUrl(target: string): string {
  const t = template()
  if (!t) return target
  const encoded = encodeURIComponent(target)
  if (t.includes('{url}')) return t.replace('{url}', encoded)
  return `${t}${t.includes('?') ? '&' : '?'}url=${encoded}`
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
 */
export function egressFetch(target: string, init: RequestInit = {}): Promise<Response> {
  return fetch(egressUrl(target), {
    ...init,
    redirect: 'follow',
    headers: egressHeaders(init.headers ?? {}),
  })
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
