/**
 * Live playback diagnostics store.
 *
 * The player picks a container candidate (`.ts` / `.m3u8`), commits to an engine
 * (mpegts.js / hls.js / native) and streams either direct or through the proxy.
 * None of that was visible, so a failure looked identical whatever the cause.
 * The player publishes each decision here and the diagnostics panel renders it.
 */

export type LiveDiag = {
  channelId: string;
  channelName: string;
  /** Container the request asked the proxy for. */
  format: 'ts' | 'm3u8' | 'file';
  /** Engine the ladder committed to for this attempt. */
  engine: 'mpegts' | 'hls' | 'native';
  /** Whole engine ladder for this channel, in order. */
  ladder: string[];
  /** Which leg carries the media bytes. */
  route: 'direct' | 'proxy';
  /** Content-Type the provider/proxy really answered with (probed on demand). */
  contentType?: string | null;
  /** `allowed_output_formats` reported by the panel. */
  formats: string[];
  tsOnly: boolean;
  /** Ladder position + whole-ladder retry counter. */
  stage: number;
  attempt: number;
  src: string;
  at: number;
};

let current: LiveDiag | null = null;
const listeners = new Set<(d: LiveDiag | null) => void>();

export function publishLiveDiag(patch: Partial<LiveDiag> & Pick<LiveDiag, 'channelId'>) {
  current = { ...(current ?? ({} as LiveDiag)), ...patch, at: Date.now() } as LiveDiag;
  for (const l of listeners) l(current);
}

export function clearLiveDiag() {
  current = null;
  for (const l of listeners) l(null);
}

export function getLiveDiag(): LiveDiag | null {
  return current;
}

export function subscribeLiveDiag(fn: (d: LiveDiag | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Ask the committed source what it really serves. A 2-byte ranged request is
 * enough to read `Content-Type` (and our own `X-Iptv-*` headers) without
 * disturbing playback.
 */
export async function probeContentType(src: string, timeoutMs = 8000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(src, { headers: { Range: 'bytes=0-1' }, signal: ctrl.signal });
    const upstream = res.headers.get('x-iptv-upstream-type');
    const ct = res.headers.get('content-type');
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
    return upstream || ct || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const DEBUG_KEY = 'livetv:diag-debug';

/**
 * The diagnostics panel is a support tool, not a viewer feature: it only renders
 * when explicitly requested with `?debug=1` (sticky until `?debug=0`).
 */
export function isLiveDiagDebug(): boolean {
  try {
    const param = new URLSearchParams(window.location.search).get('debug');
    if (param === '1') {
      localStorage.setItem(DEBUG_KEY, '1');
      return true;
    }
    if (param === '0') {
      localStorage.removeItem(DEBUG_KEY);
      return false;
    }
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}
