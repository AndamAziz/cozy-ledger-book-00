/**
 * Optional egress relay for IPTV stream traffic.
 *
 * Some providers geo-restrict playback ("country-not-allow", HTTP 459). Edge
 * functions run in a fixed cloud region, so when that region is blocked EVERY
 * channel fails even though the Xtream API handshake succeeds. Setting the
 * `IPTV_EGRESS_PROXY_URL` secret to a small HTTP relay hosted in an allowed
 * country makes all upstream stream requests exit from that country instead.
 *
 * Supported formats:
 *   https://relay.example.com/?url={url}   ← {url} placeholder (encoded)
 *   https://relay.example.com/?url=        ← encoded target appended
 */

let cachedTemplate: string | null | undefined

function template(): string | null {
  if (cachedTemplate === undefined) {
    const raw = (Deno.env.get('IPTV_EGRESS_PROXY_URL') ?? '').trim()
    cachedTemplate = raw || null
  }
  return cachedTemplate ?? null
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
  return t.includes('{url}') ? t.replace('{url}', encoded) : `${t}${encoded}`
}

/** Provider geo-block signature (Xtream panels answer 459 / "country-not-allow"). */
export function isGeoBlocked(status: number, body?: string): boolean {
  if (status === 459 || status === 451) return true
  return !!body && /country[-\s]?not[-\s]?allow|geo[-\s]?block/i.test(body)
}

export const GEO_BLOCK_MESSAGE =
  'The provider blocks streaming from this server\u2019s country. Ask your IPTV provider to allow it, or set an egress relay.'
