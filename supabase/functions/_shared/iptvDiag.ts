/**
 * Diagnostics helpers for IPTV upstream calls.
 *
 * Goal: never log a bare "502". Every upstream attempt records
 *  - the exact URL (credentials/tokens redacted)
 *  - the HTTP status + selected response headers + a body snippet
 *  - a classified error kind so timeouts, DNS/connection failures, HTTP error
 *    statuses and parse errors can be told apart in the logs.
 */

import { egressFetch } from './iptvEgress.ts'

export type UpstreamErrorKind =
  | 'timeout'
  | 'dns'
  | 'connection'
  | 'tls'
  | 'http_error'
  | 'parse_error'
  | 'aborted'
  | 'unknown'

export interface UpstreamDiag {
  ok: boolean
  kind?: UpstreamErrorKind
  url: string
  status: number
  statusText?: string
  durationMs: number
  attempt: number
  headers?: Record<string, string>
  bodySnippet?: string
  message?: string
}

const SENSITIVE_PARAMS = ['password', 'pass', 'username', 'user', 'token', 'apikey', 'api_key', 'sig']

/** Same URL, but with credentials / tokens replaced by `***`. */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw)
    for (const key of [...u.searchParams.keys()]) {
      if (SENSITIVE_PARAMS.includes(key.toLowerCase())) u.searchParams.set(key, '***')
    }
    if (u.username || u.password) {
      u.username = u.username ? '***' : ''
      u.password = u.password ? '***' : ''
    }
    // Xtream also embeds credentials as path segments: /live/<user>/<pass>/1.ts
    u.pathname = u.pathname.replace(
      /^\/(live|movie|series)\/[^/]+\/[^/]+\//,
      (_m, k) => `/${k}/***/***/`,
    )
    return u.toString()
  } catch {
    return '[unparseable url]'
  }
}

/** Turn a thrown fetch error into a stable, actionable category. */
export function classifyError(e: unknown): { kind: UpstreamErrorKind; message: string } {
  const err = e as Error & { cause?: { code?: string; message?: string } }
  const name = err?.name ?? ''
  const msg = err?.message ?? String(e)
  const code = err?.cause?.code ?? ''
  const all = `${code} ${msg}`

  if (name === 'TimeoutError' || /timed? ?out/i.test(all)) return { kind: 'timeout', message: msg }
  if (name === 'AbortError') return { kind: 'aborted', message: msg }
  if (/ENOTFOUND|EAI_AGAIN|dns error|failed to lookup/i.test(all)) return { kind: 'dns', message: msg }
  if (/certificate|tls|ssl|handshake/i.test(all)) return { kind: 'tls', message: msg }
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|connection (closed|refused|reset)|error sending request/i.test(all)) {
    return { kind: 'connection', message: msg }
  }
  if (/JSON|Unexpected token/i.test(all)) return { kind: 'parse_error', message: msg }
  return { kind: 'unknown', message: `${name || 'Error'}: ${msg}` }
}

const INTERESTING_HEADERS = [
  'content-type',
  'content-length',
  'server',
  'cf-ray',
  'cf-mitigated',
  'retry-after',
  'x-final-url',
  'location',
]

function pickHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {}
  for (const h of INTERESTING_HEADERS) {
    const v = res.headers.get(h)
    if (v) out[h] = v
  }
  return out
}

export function logDiag(tag: string, diag: UpstreamDiag) {
  const line = { tag, ...diag }
  if (diag.ok) console.log(`[iptv-upstream] ${JSON.stringify(line)}`)
  else console.error(`[iptv-upstream] ${JSON.stringify(line)}`)
}

/**
 * Fetch an upstream URL with an explicit timeout wrapper. The try/catch wraps
 * the *fetch itself* (not only parsing), so connection/DNS/timeout failures are
 * captured and classified rather than bubbling as a generic 502.
 */
export async function diagFetch(
  tag: string,
  url: string,
  {
    timeoutMs = 15_000,
    attempt = 1,
    headers = {},
    snippet = true,
  }: { timeoutMs?: number; attempt?: number; headers?: Record<string, string>; snippet?: boolean } = {},
): Promise<{ res: Response | null; diag: UpstreamDiag }> {
  const safeUrl = redactUrl(url)
  const started = performance.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(new DOMException('Upstream timeout', 'TimeoutError')), timeoutMs)

  try {
    const res = await egressFetch(url, { headers, signal: ctrl.signal })
    const durationMs = Math.round(performance.now() - started)

    if (!res.ok) {
      let bodySnippet: string | undefined
      if (snippet) {
        try {
          bodySnippet = (await res.text()).slice(0, 500)
        } catch {
          bodySnippet = '[body unreadable]'
        }
      } else {
        await res.body?.cancel().catch(() => {})
      }
      const diag: UpstreamDiag = {
        ok: false,
        kind: 'http_error',
        url: safeUrl,
        status: res.status,
        statusText: res.statusText,
        durationMs,
        attempt,
        headers: pickHeaders(res),
        bodySnippet,
        message: `Upstream responded ${res.status} ${res.statusText}`.trim(),
      }
      logDiag(tag, diag)
      return { res: null, diag }
    }

    const diag: UpstreamDiag = {
      ok: true,
      url: safeUrl,
      status: res.status,
      statusText: res.statusText,
      durationMs,
      attempt,
      headers: pickHeaders(res),
    }
    logDiag(tag, diag)
    return { res, diag }
  } catch (e) {
    const { kind, message } = classifyError(e)
    const diag: UpstreamDiag = {
      ok: false,
      kind,
      url: safeUrl,
      status: 0,
      durationMs: Math.round(performance.now() - started),
      attempt,
      message: kind === 'timeout' ? `Upstream timed out after ${timeoutMs} ms` : message,
    }
    logDiag(tag, diag)
    return { res: null, diag }
  } finally {
    clearTimeout(timer)
  }
}
