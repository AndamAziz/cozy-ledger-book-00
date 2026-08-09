/**
 * Rate-limit / WAF resilience for provider traffic.
 *
 * Professional players never hammer a panel that just answered 429 — that is
 * how an egress IP earns a permanent ban. When a host rate-limits us we park it
 * for a cooldown window (honouring `Retry-After` when present) and skip every
 * attempt against it until the window ends. Retries use jittered exponential
 * backoff so many isolates never re-dial in lockstep.
 */

const MIN_COOLDOWN_MS = 30_000
const MAX_COOLDOWN_MS = 120_000

/** host -> epoch ms until which the host must not be contacted. */
const cooldownUntil = new Map<string, number>()

export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** True when a provider status means "you are being rate limited / throttled". */
export function isRateLimited(status: number): boolean {
  return status === 429 || status === 503 || status === 509
}

export type HeaderLike = Headers | Record<string, string> | null | undefined

const headerValue = (headers: HeaderLike, name: string): string | undefined => {
  if (!headers) return undefined
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  const hit = Object.entries(headers).find(([k]) => k.toLowerCase() === name)
  return hit?.[1]
}

/** Parse `Retry-After` (seconds or HTTP date) into ms, clamped to the window. */
export function retryAfterMs(headers: HeaderLike): number | null {
  const raw = headerValue(headers, 'retry-after')?.trim()
  if (!raw) return null
  const secs = Number(raw)
  let ms: number
  if (Number.isFinite(secs)) ms = secs * 1000
  else {
    const at = Date.parse(raw)
    if (!Number.isFinite(at)) return null
    ms = at - Date.now()
  }
  if (!Number.isFinite(ms) || ms <= 0) return null
  return Math.min(Math.max(ms, MIN_COOLDOWN_MS), MAX_COOLDOWN_MS)
}

/** Park a host after a rate-limit answer. Returns the cooldown length in ms. */
export function markRateLimited(url: string, headers?: HeaderLike): number {
  const host = hostOf(url)
  const ms = retryAfterMs(headers) ?? MIN_COOLDOWN_MS + Math.floor(Math.random() * 30_000)
  const until = Date.now() + ms
  const current = cooldownUntil.get(host) ?? 0
  cooldownUntil.set(host, Math.max(current, until))
  if (cooldownUntil.size > 200) cooldownUntil.delete(cooldownUntil.keys().next().value as string)
  console.warn(`[iptvCooldown] ${host} parked for ${Math.round(ms / 1000)}s (rate limited)`)
  return ms
}

/** Remaining cooldown for a host, 0 when it is free to contact. */
export function cooldownLeft(url: string): number {
  const until = cooldownUntil.get(hostOf(url)) ?? 0
  const left = until - Date.now()
  return left > 0 ? left : 0
}

export const isCoolingDown = (url: string) => cooldownLeft(url) > 0

/** A successful answer clears the park. */
export function clearCooldown(url: string) {
  cooldownUntil.delete(hostOf(url))
}

/** Jittered exponential backoff: 500ms, 1s, 2s, 4s… capped at 8s (±25%). */
export function backoffMs(attempt: number, base = 500, cap = 8_000): number {
  const raw = Math.min(cap, base * 2 ** Math.max(0, attempt))
  const jitter = raw * 0.25
  return Math.round(raw - jitter + Math.random() * jitter * 2)
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
