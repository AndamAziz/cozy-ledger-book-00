/**
 * Pure format/refusal rules shared by the edge functions and the unit tests.
 *
 * Deliberately free of Deno APIs and network imports so the vitest suite can
 * exercise the exact code the stream function runs.
 */

export type LiveFormats = {
  /** Normalised list, empty when the panel did not tell us. */
  formats: string[]
  /** Panel serves transport streams but no HLS manifests. */
  tsOnly: boolean
  /** Panel advertises HLS. */
  hls: boolean
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
export function liveFormatOrder(fmt: LiveFormats | null, _rawFirst = false): string[] {
  const known = fmt && fmt.formats.length > 0
  if (!known) return ['m3u8', 'ts']
  if (fmt!.tsOnly) return ['ts']
  const hasTs = fmt!.formats.some((f) => f === 'ts' || f === 'mpegts')
  if (fmt!.hls && !hasTs) return ['m3u8']
  // HLS FIRST. Verified against this panel: a proxied segment returns
  // 200 / 3.5 MB through the relay, so the old 403 note is obsolete.
  // On a max_connections=1 account a continuous `.ts` connection never
  // frees the slot after a reconnect, while a 10 s segment releases it
  // immediately. This also matches liveEngineOrder() client-side, which
  // already leads with hls.js -- the two MUST ask for the same container.
  return ['m3u8', 'ts']
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
  // A 458/407 on ANY live container may just be a busy slot for that one
  // transport. Blocking the whole host on a `.ts` refusal meant the m3u8
  // candidate was never attempted; scope it to the format while another
  // container is still untried. Extension-less candidates stay host-wide.
  if (format === 'raw') return 'route'
  return otherFormatsUntried ? 'format' : 'route'
}
