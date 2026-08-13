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

export type LiveFormats = {
  /** Normalised list, empty when the panel did not tell us. */
  formats: string[]
  /** Panel serves transport streams but no HLS manifests. */
  tsOnly: boolean
  /** Panel advertises HLS. */
  hls: boolean
}

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
 * Live container order for a panel.
 *
 * When the panel advertises its formats we trust them. When the list is missing
 * or empty (many panels omit `allowed_output_formats` entirely) we do NOT commit
 * to a single strategy: a minimal two-candidate probe is used instead, `ts`
 * first because every Xtream panel serves transport streams while HLS is
 * optional.
 */
export function liveFormatOrder(fmt: LiveFormats | null, rawFirst = false): string[] {
  const known = fmt && fmt.formats.length > 0
  if (!known) return ['ts', 'm3u8']
  if (fmt!.tsOnly) return ['ts']
  const hasTs = fmt!.formats.some((f) => f === 'ts' || f === 'mpegts')
  if (fmt!.hls && !hasTs) return ['m3u8']
  return rawFirst ? ['ts', 'm3u8'] : ['m3u8', 'ts']
}

export type RefusalScope =
  /** Only this container is impossible on this host/route — keep trying others. */
  | 'format'
  /** The whole host/route is refusing — block every container below it. */
  | 'route'

/**
 * How far a provider refusal should reach.
 *
 * 407/458 normally means "all viewing slots in use", but a panel with no HLS
 * answers a `.m3u8` request with exactly those statuses. When another container
 * is still untried that verdict is a FORMAT refusal, never a slot limit.
 * Genuine throttling (429/509) and every other failure stay host-wide.
 */
export function refusalScope(args: {
  status: number
  kind: string
  format: string
  otherFormatsUntried: boolean
}): RefusalScope {
  const { status, kind, format, otherFormatsUntried } = args
  if (status !== 407 && status !== 458) return 'route'
  if (kind !== 'live') return 'route'
  if (format !== 'm3u8' && format !== 'm3u') return 'route'
  return otherFormatsUntried ? 'format' : 'route'
}
