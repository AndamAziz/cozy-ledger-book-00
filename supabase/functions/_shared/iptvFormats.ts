import { xtreamApiBases } from './iptvConfig.ts'
import { egressFetch } from './iptvEgress.ts'
import { IPTV_USER_AGENTS } from './iptvFetch.ts'

/**
 * `allowed_output_formats` discovery.
 *
 * Xtream panels advertise the live containers they actually serve in the
 * `user_info.allowed_output_formats` array of the `player_api.php` response
 * (e.g. `["m3u8","ts","rtmp"]`). Providers that only expose `ts` answer any
 * `.m3u8` request with a refusal status (407/458 on some panels), which used to
 * look like "all viewing slots in use" and blocked the working `.ts` candidate.
 *
 * Probing the formats once per account (10 min cache) lets the stream function
 * skip impossible candidates entirely instead of learning from a false error.
 */

import { type LiveFormats } from './iptvFormatRules.ts'
export * from './iptvFormatRules.ts'

const UNKNOWN: LiveFormats = { formats: [], tsOnly: false, hls: false }

const cache = new Map<string, { at: number; value: LiveFormats }>()
const TTL_MS = 10 * 60 * 1000

function shape(list: unknown): LiveFormats {
  const formats = Array.isArray(list)
    ? list
        .map((f) => String(f ?? '').trim().toLowerCase())
        .filter((f) => /^[a-z0-9]+$/.test(f))
    : []
  if (!formats.length) return UNKNOWN
  const hls = formats.includes('m3u8') || formats.includes('m3u') || formats.includes('hls')
  const ts = formats.includes('ts') || formats.includes('mpegts')
  return { formats, tsOnly: ts && !hls, hls }
}

/**
 * Drop the cached formats for one source (or every source) so a format change
 * at the provider is picked up immediately instead of after the 10 min TTL.
 */
export function invalidateLiveFormats(source?: string): number {
  if (!source) {
    const n = cache.size
    cache.clear()
    return n
  }
  return cache.delete(source) ? 1 : 0
}

/** Age of the cached entry in ms, or null when nothing is cached. */
export function liveFormatsAge(source: string): number | null {
  const hit = cache.get(source)
  return hit ? Date.now() - hit.at : null
}

/** Cached `allowed_output_formats` for an Xtream source link. */
export async function liveFormats(
  source: string,
  timeoutMs = 6_000,
  opts: { force?: boolean } = {},
): Promise<LiveFormats> {
  const key = source
  const hit = cache.get(key)
  if (!opts.force && hit && Date.now() - hit.at < TTL_MS) return hit.value

  let value = UNKNOWN
  for (const base of xtreamApiBases(source)) {
    try {
      const res = await egressFetch(
        base,
        { headers: { Accept: 'application/json', 'User-Agent': IPTV_USER_AGENTS[0] }, signal: AbortSignal.timeout(timeoutMs) },
      )
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined)
        continue
      }
      const body = await res.json().catch(() => null)
      const shaped = shape(body?.user_info?.allowed_output_formats)
      if (shaped.formats.length) {
        value = shaped
        break
      }
    } catch {
      // try the next origin
    }
  }
  cache.set(key, { at: Date.now(), value })
  if (cache.size > 200) cache.delete(cache.keys().next().value as string)
  return value
}

/** Container of a built candidate URL — used for format-scoped blocking. */
export function candidateFormat(url: string): string {
  const m = /\.([a-z0-9]{2,6})(\?|#|$)/i.exec(url)
  return (m?.[1] ?? 'raw').toLowerCase()
}


/**
 * Live connection usage for an Xtream account (`active_cons` / `max_connections`).
 *
 * A PPV / premium channel the subscription does not include is refused with the
 * same 407/458 status a full account gets. Reading the real slot usage tells the
 * two apart: slots free + refusal = entitlement problem, not a slot problem.
 */
export async function liveConnectionUsage(
  source: string,
  timeoutMs = 5_000,
): Promise<{ active: number; max: number } | null> {
  for (const base of xtreamApiBases(source)) {
    try {
      const res = await egressFetch(base, {
        headers: { Accept: 'application/json', 'User-Agent': IPTV_USER_AGENTS[0] },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined)
        continue
      }
      const body = await res.json().catch(() => null)
      const info = body?.user_info
      const active = Number(info?.active_cons)
      const max = Number(info?.max_connections)
      if (Number.isFinite(active) && Number.isFinite(max) && max > 0) return { active, max }
    } catch {
      // try the next origin
    }
  }
  return null
}
