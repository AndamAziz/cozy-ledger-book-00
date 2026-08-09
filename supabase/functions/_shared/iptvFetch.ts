import { egressFetch } from './iptvEgress.ts'
/**
 * Server-to-server relay fetch for IPTV providers.
 * Runs in Deno (no browser CORS / mixed-content limits) and returns a
 * human-readable reason when the upstream cannot be reached.
 */

export const IPTV_USER_AGENTS = [
  'IPTVSmartersPro/4.0.4 (Linux; Android 12) ExoPlayerLib/2.19.1',
  'VLC/3.0.20 LibVLC/3.0.20',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
]

/** UA for attempt N (0-based) — rotates through {@link IPTV_USER_AGENTS}. */
export function uaFor(attempt: number): string {
  return IPTV_USER_AGENTS[Math.abs(attempt) % IPTV_USER_AGENTS.length]
}

/**
 * True when a response is an HTML page rather than provider data. Cloudflare
 * ("Attention Required!") and panel error pages answer HTML — sometimes with
 * HTTP 200 — so the content type (and, when available, the body) must be
 * checked, not only the status code.
 */
export function isHtmlBlock(contentType: string | null | undefined, body?: string): boolean {
  if ((contentType ?? '').toLowerCase().includes('text/html')) return true
  const head = (body ?? '').slice(0, 400).trimStart().toLowerCase()
  return head.startsWith('<!doctype html') || head.startsWith('<html')
}


export interface RelayResult {
  ok: boolean
  status: number
  body: string
  contentType: string | null
  userAgent: string
  /** Detailed failure reason when ok === false and status === 0. */
  error?: string
}

/** Translate a thrown fetch error into something an admin can act on. */
export function describeFetchError(e: unknown): string {
  const err = e as Error & { cause?: { code?: string; message?: string } }
  const name = err?.name ?? ''
  const msg = err?.message ?? String(e)
  const code = err?.cause?.code ?? ''

  if (name === 'AbortError' || name === 'TimeoutError') {
    return 'Connection timed out — the provider did not answer in time'
  }
  if (/ECONNREFUSED/i.test(code + msg)) return 'Connection refused — wrong host or port'
  if (/ENOTFOUND|dns/i.test(code + msg)) return 'Host not found — check the domain name'
  if (/ECONNRESET/i.test(code + msg)) return 'Connection reset by the provider'
  if (/certificate|tls|ssl/i.test(msg)) return `TLS/certificate problem: ${msg}`
  if (/invalid url/i.test(msg)) return 'That is not a valid URL'
  return `${name || 'NetworkError'}: ${msg}${code ? ` (${code})` : ''}`
}

/**
 * Fetch a provider URL, retrying with alternative user agents when the
 * provider rejects the first handshake (many panels filter on UA).
 */
export async function relayFetch(
  url: string,
  {
    timeoutMs = 10_000,
    maxBytes = 2_000_000,
    relayTimeoutMs,
  }: { timeoutMs?: number; maxBytes?: number; relayTimeoutMs?: number } = {},
): Promise<RelayResult> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, status: 0, body: '', contentType: null, userAgent: '', error: 'That is not a valid URL' }
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return {
      ok: false,
      status: 0,
      body: '',
      contentType: null,
      userAgent: '',
      error: 'URL must start with http:// or https://',
    }
  }

  let last: RelayResult | null = null

  for (const ua of IPTV_USER_AGENTS) {
    try {
      const res = await egressFetch(parsed.toString(), {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': ua,
          Accept: '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: `${parsed.protocol}//${parsed.host}/`,
          Origin: `${parsed.protocol}//${parsed.host}`,
          'X-Requested-With': 'com.nathnetwork.xciptv',
        },
      }, { relayTimeoutMs: relayTimeoutMs ?? timeoutMs })


      const raw = await res.text()
      const body = raw.length > maxBytes ? raw.slice(0, maxBytes) : raw
      const contentType = res.headers.get('content-type')
      // A WAF block page can arrive with HTTP 200 and an HTML body: treat it as
      // a failure so the next User-Agent is tried.
      const blocked = isHtmlBlock(contentType, body)
      const result: RelayResult = {
        ok: res.ok && !blocked,
        status: res.status,
        body,
        contentType,
        userAgent: ua,
      }
      if (result.ok) return result
      last = {
        ...result,
        error: blocked
          ? 'Provider answered a block page (HTML) instead of data'
          : `Server responded with ${res.status} ${res.statusText}`.trim(),
      }

    } catch (e) {
      last = {
        ok: false,
        status: 0,
        body: '',
        contentType: null,
        userAgent: ua,
        error: describeFetchError(e),
      }
      // A timeout / refused connection will not improve with another UA.
      if (last.error?.startsWith('Connection refused') || last.error?.startsWith('Host not found')) break
    }
  }

  return last ?? { ok: false, status: 0, body: '', contentType: null, userAgent: '', error: 'Unknown error' }
}

/** Xtream panels answer errors as JSON: {"user_info":{"auth":0,...}} */
export function xtreamAuthError(body: string): string | null {
  try {
    const j = JSON.parse(body)
    if (j && typeof j === 'object' && 'user_info' in j) {
      const info = (j as { user_info: Record<string, unknown> }).user_info
      if (info?.auth === 0) return 'Invalid credentials — username or password rejected'
      const status = String(info?.status ?? '')
      if (/expired/i.test(status)) return 'Subscription expired on the provider'
      if (/banned|disabled/i.test(status)) return 'Account is banned or disabled by the provider'
      const active = Number(info?.active_cons ?? 0)
      const max = Number(info?.max_connections ?? 0)
      if (max > 0 && active >= max) return `Max connections reached (${active}/${max})`
    }
  } catch {
    // not JSON — nothing to report
  }
  return null
}
