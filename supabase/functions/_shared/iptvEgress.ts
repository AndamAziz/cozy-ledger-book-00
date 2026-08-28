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
  // A config value that already ends in `?url=` (or carries an empty `url`
  // param) produced `?url=&url=<target>`. Express reads the duplicate key as an
  // array, fetch rejects it, and the relay answered 502 for every request --
  // which tripped the breaker and sent all traffic direct into a provider 458.
  let base = t.replace(/[?&]url=$/i, '').replace(/\/+$/, '')
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
 * Relay circuit breaker.
 *
 * A hanging/crashed relay must never become the platform's single point of
 * failure: after a failed hop we stop dialling it for `RELAY_COOLDOWN_MS` and
 * serve every request with a direct fetch instead. The first request after the
 * cooldown probes the relay again (half-open).
 */
const RELAY_TIMEOUT_MS = 4_000
const RELAY_COOLDOWN_MS = 45_000
let relayDownUntil = 0
let relayLastError = ''

function tripRelay(reason: string) {
  relayDownUntil = Date.now() + RELAY_COOLDOWN_MS
  relayLastError = reason
  console.warn(`[iptvEgress] relay circuit OPEN for ${RELAY_COOLDOWN_MS / 1000}s (${reason})`)
}

/** Monitoring view of the breaker. */
export function relayState() {
  const open = Date.now() < relayDownUntil
  return {
    configured: hasEgressProxy(),
    open,
    cooldownMsLeft: open ? relayDownUntil - Date.now() : 0,
    lastError: relayLastError || null,
  }
}

/** Direct (non-relay) hop. */
const direct = (target: string, init: RequestInit) => fetch(target, { ...init, redirect: 'follow' })

/**
 * Sequential request gate.
 *
 * The provider account allows a single simultaneous connection, so catalogue /
 * metadata hops are serialised per instance: they run one after another instead
 * of in parallel. Media requests (`stream: true`) bypass the gate — they are the
 * playback itself and are already single-slot by design.
 */
let gate: Promise<unknown> = Promise.resolve()
function serialise<T>(task: () => Promise<T>): Promise<T> {
  const run = gate.then(task, task)
  gate = run.then(() => undefined, () => undefined)
  return run
}


/**
 * Fetch an upstream IPTV URL through the relay (or directly when no relay is
 * configured / the breaker is open). The response body is NOT buffered —
 * callers stream it.
 *
 * If the relay itself is unreachable (down, DNS/TLS failure, timeout, hang) we
 * fall back to a direct fetch so playback and metadata keep working while the
 * VPS is offline.
 */
export async function egressFetch(
  target: string,
  init: RequestInit = {},
  opts: { direct?: boolean; stream?: boolean; relayTimeoutMs?: number } = {},
): Promise<Response> {
  // Catalogue/metadata hops are queued so the provider never sees a burst.
  if (!opts.stream) return await serialise(() => egressHop(target, init, opts))
  return await egressHop(target, init, opts)
}

async function egressHop(
  target: string,
  init: RequestInit,
  opts: { direct?: boolean; stream?: boolean; relayTimeoutMs?: number },
): Promise<Response> {
  if (opts.direct || !hasEgressProxy()) return await direct(target, init)
  if (Date.now() < relayDownUntil) return await direct(target, init)

  try {
    // A crashed//hung relay must not consume the caller's whole deadline: race
    // the hop against a short timer and fall back to direct on expiry.
    // Heavy catalogue payloads (get_live_streams can be several MB) need a
    // longer allowance, which callers pass via `relayTimeoutMs`.
    const hopTimeout = Math.max(1_000, opts.relayTimeoutMs ?? RELAY_TIMEOUT_MS)
    const hop = fetch(egressUrl(target), {
      ...init,
      redirect: 'follow',
      headers: egressHeaders(init.headers ?? {}),
    })
    let timer: number | undefined
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), hopTimeout)
    })
    const raced = await Promise.race([hop, timeout])
    if (timer !== undefined) clearTimeout(timer)
    if (raced === 'timeout') {
      // Never leak the abandoned hop's body.
      hop.then((r) => r.body?.cancel().catch(() => {})).catch(() => {})
      tripRelay(`no response within ${hopTimeout}ms`)
      return await direct(target, init)
    }

    const res = raced as Response

    // The relay is up but could not reach the provider (502/504/503): retry the
    // request directly so metadata keeps working while the VPS misbehaves.
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      tripRelay(`HTTP ${res.status}`)
      await res.body?.cancel().catch(() => {})
      try {
        return await direct(target, init)
      } catch {
        return res
      }
    }
    // The relay itself rejected US (bad/missing X-Relay-Token). Its own 401/403
    // must never be reported as a provider refusal — but the reverse matters
    // just as much: the relay stamps its Express/CORS headers on EVERY reply,
    // including proxied upstream ones, so those alone cannot identify a
    // self-rejection. `X-Final-URL` is only present once the relay actually
    // reached the provider, so a 401/403 carrying it is the provider's answer.
    if (res.status === 401 || res.status === 403) {
      const proxied = !!(res.headers.get('x-final-url') ?? res.headers.get('X-Final-URL'))
      if (!proxied) {
        const tk = token()
        let ep = 'invalid'
        try { const u = new URL(egressUrl(target)); ep = `${u.host}${u.pathname}` } catch { /* ignore */ }
        console.error(
          `[iptvEgress] relay rejected our token (HTTP ${res.status}) endpoint=${ep} tokenLen=${tk?.length ?? 0} src=${Deno.env.get('RELAY_TOKEN') ? 'RELAY_TOKEN' : (Deno.env.get('IPTV_EGRESS_PROXY_TOKEN') ? 'IPTV_EGRESS_PROXY_TOKEN' : 'none')}; falling back to direct`,
        )
        tripRelay(`relay auth ${res.status}`)
        await res.body?.cancel().catch(() => {})
        try {
          return await direct(target, init)
        } catch {
          return res
        }
      }
    }
    return res

  } catch (e) {
    const reason = e instanceof Error ? e.message : 'error'
    // The caller's own AbortSignal firing is not a relay fault.
    if (!/abort/i.test(reason) || !init.signal?.aborted) tripRelay(reason)
    console.warn(`[iptvEgress] relay unreachable (${reason}) — falling back to direct`)
    return await direct(target, init)
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
