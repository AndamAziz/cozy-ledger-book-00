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
 * Resolves the playable source for a channel.
 * - no custom headers  -> direct URL (fastest, zero proxy hops)
 * - custom headers     -> proxy URL carrying the headers
 * - `forceProxy`       -> proxy fallback after a direct attempt failed
 */
export function resolveStreamSource(
  url: string,
  headers: StreamHeaders | null | undefined,
  proxyBase: string,
  forceProxy = false,
): string {
  const custom = needsProxy(headers);
  if (!custom && !forceProxy) return url;
  const suffix = custom ? `&h=${encodeStreamHeaders(headers as StreamHeaders)}` : '';
  return `${proxyBase}${encodeURIComponent(url)}${suffix}`;
}
