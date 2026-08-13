/**
 * Human error messages of the quality IPTV Smarters / VLC give.
 *
 * Every provider failure is mapped to a single actionable sentence plus a
 * machine `code`, so the UI can show something better than "HTTP 403".
 */

export type StreamErrorCode =
  | 'AUTH_FAILED'
  | 'ACCOUNT_EXPIRED'
  | 'MAX_CONNECTIONS'
  | 'RATE_LIMITED'
  | 'GEO_BLOCKED'
  | 'WAF_BLOCK'
  | 'CHANNEL_OFFLINE'
  | 'PROVIDER_DOWN'
  | 'TIMEOUT'
  | 'UNKNOWN'

export interface StreamError {
  code: StreamErrorCode
  message: string
  /** Retrying the same request may succeed later. */
  retryable: boolean
}

const M: Record<StreamErrorCode, string> = {
  AUTH_FAILED: 'Your IPTV account details were rejected by the provider. Ask your provider to check the login.',
  ACCOUNT_EXPIRED: 'Your IPTV subscription has expired. Renew it with your provider to keep watching.',
  MAX_CONNECTIONS: 'All viewing slots on your IPTV account are in use. Close another device and try again.',
  RATE_LIMITED: 'Your IPTV provider is limiting requests right now. Retrying automatically in a moment.',
  GEO_BLOCKED: 'Your IPTV provider is blocking this connection by region. Trying an alternative route.',
  WAF_BLOCK: 'Your IPTV provider answered with a block page instead of the stream. Please try again shortly.',
  CHANNEL_OFFLINE: 'This channel is offline on your provider right now. Try another channel.',
  PROVIDER_DOWN: 'Your IPTV provider is unreachable at the moment. Please try again in a few minutes.',
  TIMEOUT: 'The stream did not start in time. Your provider or connection is too slow right now.',
  UNKNOWN: 'The stream could not be started. Please try again.',
}

export const streamError = (code: StreamErrorCode, extra?: string): StreamError => ({
  code,
  message: extra ? `${M[code]} (${extra})` : M[code],
  retryable: code !== 'AUTH_FAILED' && code !== 'ACCOUNT_EXPIRED',
})

/** Map an upstream HTTP status (+ optional body) to a classified error. */
export function classifyStatus(status: number, body?: string): StreamError {
  const text = (body ?? '').toLowerCase()
  if (/expired/.test(text)) return streamError('ACCOUNT_EXPIRED')
  if (/ip[-_\s]?limit[-_\s]?(reach|reached)|max.{0,16}connection|too many connections|slot/.test(text)) {
    return streamError('MAX_CONNECTIONS')
  }
  if (/country[-\s]?not[-\s]?allow|geo[-\s]?block/.test(text)) return streamError('GEO_BLOCKED')

  if (status === 401) return streamError('AUTH_FAILED')
  if (status === 402) return streamError('ACCOUNT_EXPIRED')
  if (status === 403) return streamError('WAF_BLOCK', 'HTTP 403')
  if (status === 404 || status === 410) return streamError('CHANNEL_OFFLINE', `HTTP ${status}`)
  if (status === 458 || status === 407) return streamError('MAX_CONNECTIONS', `HTTP ${status}`)
  if (status === 429 || status === 509) return streamError('RATE_LIMITED', `HTTP ${status}`)
  if (status === 451 || status === 456 || status === 459) return streamError('GEO_BLOCKED', `HTTP ${status}`)
  if (status === 408 || status === 504) return streamError('TIMEOUT', `HTTP ${status}`)
  if (status >= 500) return streamError('PROVIDER_DOWN', `HTTP ${status}`)
  return streamError('UNKNOWN', `HTTP ${status}`)
}

/** Map a transport-level failure string to a classified error. */
export function classifyTransport(message: string): StreamError {
  const m = message.toLowerCase()
  if (/timed? ?out|deadline|abort/.test(m)) return streamError('TIMEOUT', message.slice(0, 80))
  if (/refused|host not found|dns|unreachable|tls|certificate/.test(m)) {
    return streamError('PROVIDER_DOWN', message.slice(0, 80))
  }
  return streamError('UNKNOWN', message.slice(0, 80))
}
