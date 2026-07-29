/**
 * Tiny per-host cookie jar for IPTV provider traffic.
 *
 * Providers behind Cloudflare hand out clearance cookies (`cf_clearance`,
 * `__cf_bm`, `__cfduid`, plus the panel's own PHP session) on the FIRST
 * request — usually the playlist/manifest. Deno's `fetch` does not keep a
 * cookie jar, and our egress relay is stateless, so every follow-up segment
 * request looked like a brand-new client to Cloudflare and got challenged or
 * throttled (the player then hangs on "Connecting to stream…").
 *
 * Mobile IPTV apps do not hit this because their HTTP client keeps the session
 * cookies for the whole playback. This module gives the proxy the same
 * behaviour: cookies are stored per upstream host, in memory, for the lifetime
 * of the edge isolate, and replayed on every subsequent request to that host.
 */

type Jar = Map<string, { value: string; expires: number }>

const jars = new Map<string, Jar>()
const MAX_HOSTS = 64
const DEFAULT_TTL_MS = 30 * 60 * 1000

/** Cookies grouped per registrable-ish host so CDN edge nodes share clearance. */
function jarKey(host: string): string {
  const parts = host.toLowerCase().split(':')[0].split('.')
  return parts.length > 2 ? parts.slice(-2).join('.') : parts.join('.')
}

function jarFor(host: string): Jar {
  const key = jarKey(host)
  let jar = jars.get(key)
  if (!jar) {
    if (jars.size >= MAX_HOSTS) jars.delete(jars.keys().next().value as string)
    jar = new Map()
    jars.set(key, jar)
  }
  return jar
}

function setCookieList(res: Response): string[] {
  // Deno exposes every Set-Cookie separately; the relay may fold them into one
  // header or re-expose them as X-Set-Cookie, so read all three shapes.
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] }
  const list = typeof anyHeaders.getSetCookie === 'function' ? anyHeaders.getSetCookie() : []
  if (list.length) return list
  const single = res.headers.get('set-cookie') ?? res.headers.get('x-set-cookie')
  return single ? single.split(/,(?=[^;=]+=[^;])/g) : []
}

/** Absorb Set-Cookie headers from an upstream response into the host jar. */
export function absorbCookies(res: Response, target: string): void {
  let host: string
  try {
    host = new URL(target).host
  } catch {
    return
  }
  const cookies = setCookieList(res)
  if (!cookies.length) return
  const jar = jarFor(host)
  for (const raw of cookies) {
    const [pair, ...attrs] = raw.split(';')
    const eq = pair.indexOf('=')
    if (eq <= 0) continue
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (!name) continue

    let expires = Date.now() + DEFAULT_TTL_MS
    for (const attr of attrs) {
      const [k, v] = attr.split('=')
      const key = k.trim().toLowerCase()
      if (key === 'max-age' && v) {
        const secs = Number(v.trim())
        if (Number.isFinite(secs)) expires = Date.now() + secs * 1000
      } else if (key === 'expires' && v) {
        const t = Date.parse(v.trim())
        if (Number.isFinite(t)) expires = t
      }
    }
    // Deletion directive from upstream.
    if (expires <= Date.now() || value === '' || value === 'deleted') {
      jar.delete(name)
      continue
    }
    jar.set(name, { value, expires })
  }
}

/** Cookie header value for an upstream URL, or null when the jar is empty. */
export function cookieHeaderFor(target: string): string | null {
  let host: string
  try {
    host = new URL(target).host
  } catch {
    return null
  }
  const jar = jars.get(jarKey(host))
  if (!jar || jar.size === 0) return null
  const now = Date.now()
  const parts: string[] = []
  for (const [name, entry] of jar) {
    if (entry.expires <= now) {
      jar.delete(name)
      continue
    }
    parts.push(`${name}=${entry.value}`)
  }
  return parts.length ? parts.join('; ') : null
}

/** Cloudflare challenge / bot-management signature on an upstream response. */
export function isCloudflareChallenge(res: Response): boolean {
  const server = (res.headers.get('server') ?? '').toLowerCase()
  const cf = server.includes('cloudflare') || res.headers.has('cf-ray')
  if (!cf) return false
  if (res.headers.has('cf-mitigated')) return true
  return res.status === 403 || res.status === 503 || res.status === 429 || res.status === 1020
}
