/**
 * Per-channel HTTP headers extracted from an M3U playlist
 * (#EXTVLCOPT / #EXTHTTP / #KODIPROP / `url|Referer=` suffixes).
 *
 * Channels that declare any of these need a server-side proxy, because a
 * browser cannot set Referer / User-Agent / Origin on a media request.
 * Channels without them play directly — no proxy overhead at all.
 */
export interface StreamHeaders {
  referer?: string;
  userAgent?: string;
  origin?: string;
  cookie?: string;
  [key: string]: string | undefined;
}
/** True when the channel declared custom headers and therefore must be proxied. */
export function needsProxy(headers?: StreamHeaders | null): boolean {
  if (!headers) return false;
  return Object.values(headers).some((v) => typeof v === 'string' && v.trim().length > 0);
}
/** URL-safe base64 of a JSON header bag (kept short; skips empty values). */
export function encodeStreamHeaders(headers: StreamHeaders): string {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v === 'string' && v.trim()) clean[k] = v.trim();
  }
  const json = JSON.stringify(clean);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/**
 * Resolves the playable source for a channel across three tiers:
 * - tier 0 (direct)      -> raw URL, zero proxy hops
 * - tier 1 (supabase)    -> Supabase edge-function proxy (carries custom headers)
 * - tier 2 (vps relay)   -> our own relay.andam.uk, last-resort fallback for
 *                           channels a blocked/rate-limited Supabase egress IP
 *                           cannot reach but our VPS IP can.
 */
export function resolveStreamSource(
  url: string,
  headers: StreamHeaders | null | undefined,
  tier: 0 | 1 | 2,
  supabaseProxyBase: string,
  vpsRelayBase: string,
): string {
  if (tier === 0) return url;
  if (tier === 1) {
    const custom = needsProxy(headers);
    const suffix = custom ? `&h=${encodeStreamHeaders(headers as StreamHeaders)}` : '';
    return `${supabaseProxyBase}${encodeURIComponent(url)}${suffix}`;
  }
  return `${vpsRelayBase}${encodeURIComponent(url)}`;
}
