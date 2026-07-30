/**
 * Container detection for the Live TV player.
 *
 * mpegts.js only demuxes MPEG-TS and FLV. Feeding it an MP4/MKV VOD file makes
 * it throw "TransmuxingController: Non MPEG-TS/FLV, Unsupported media type!"
 * and then crash on internal state that was already torn down. So the container
 * is decided *before* an engine is picked, from the file extension plus a small
 * byte-range sniff of the real payload.
 */

export type Container = 'hls' | 'mpegts' | 'flv' | 'mp4' | 'matroska' | 'unknown';

/** Engines that can actually decode a given container in a browser. */
export type Engine = 'hls' | 'mpegts' | 'native';

/** Container guess from a file extension hint (Xtream `container_extension`). */
export function containerFromExt(ext?: string | null): Container {
  const e = (ext ?? '').toLowerCase().replace(/^\./, '');
  if (e === 'm3u8' || e === 'm3u') return 'hls';
  if (e === 'ts' || e === 'mpegts' || e === 'mpg' || e === 'mpeg' || e === 'm2ts') return 'mpegts';
  if (e === 'flv') return 'flv';
  if (e === 'mp4' || e === 'm4v' || e === 'mov' || e === 'webm') return 'mp4';
  if (e === 'mkv' || e === 'matroska') return 'matroska';
  return 'unknown';
}

/** Container guess from the first bytes of the stream (magic numbers). */
export function containerFromBytes(bytes: Uint8Array): Container {
  if (!bytes || bytes.length < 4) return 'unknown';
  const text = String.fromCharCode(...bytes.slice(0, 16));
  if (text.startsWith('#EXTM3U')) return 'hls';
  if (text.startsWith('FLV')) return 'flv';
  // ISO-BMFF: 4-byte size then 'ftyp' / 'styp' / 'moov'.
  const box = String.fromCharCode(...bytes.slice(4, 8));
  if (box === 'ftyp' || box === 'styp' || box === 'moov') return 'mp4';
  // Matroska / WebM EBML header.
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'matroska';
  // MPEG-TS: 0x47 sync byte every 188 bytes.
  if (bytes[0] === 0x47 && (bytes.length < 189 || bytes[188] === 0x47)) return 'mpegts';
  return 'unknown';
}

/** Container guess from a Content-Type response header. */
export function containerFromMime(mime?: string | null): Container {
  const m = (mime ?? '').toLowerCase();
  if (!m) return 'unknown';
  if (m.includes('mpegurl')) return 'hls';
  if (m.includes('mp2t')) return 'mpegts';
  if (m.includes('x-flv')) return 'flv';
  if (m.includes('matroska') || m.includes('webm')) return 'matroska';
  if (m.includes('mp4') || m.includes('quicktime')) return 'mp4';
  return 'unknown';
}

/**
 * Engine chain for a container, best first. `native` handles progressive files
 * (MP4/MKV in browsers that decode them); `mpegts` is only ever offered for
 * MPEG-TS/FLV, which is the whole point of this module.
 */
export function engineChain(container: Container, opts: { nativeHls: boolean }): Engine[] {
  switch (container) {
    case 'hls':
      return opts.nativeHls ? ['native', 'hls'] : ['hls', 'native'];
    case 'mpegts':
    case 'flv':
      return ['mpegts', 'hls', 'native'];
    case 'mp4':
    case 'matroska':
      // Progressive files: only the media element can play these. hls.js and
      // mpegts.js both reject them outright.
      return ['native'];
    default:
      return opts.nativeHls ? ['hls', 'native', 'mpegts'] : ['hls', 'mpegts', 'native'];
  }
}

/** True when the container can never be decoded by mpegts.js. */
export function isProgressiveContainer(c: Container): boolean {
  return c === 'mp4' || c === 'matroska';
}

/**
 * Sniff the real container by asking the proxy for the first KB. Falls back to
 * the extension hint when the range request fails (offline, CORS, timeout).
 */
export async function probeContainer(
  url: string,
  extHint?: string | null,
  timeoutMs = 6000,
): Promise<Container> {
  const fromExt = containerFromExt(extHint);
  // A declared HLS/TS extension is reliable; skip the round-trip.
  if (fromExt === 'hls') return fromExt;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-1023' }, signal: ctrl.signal });
    if (!res.ok && res.status !== 206) return fromExt;
    const byMime = containerFromMime(res.headers.get('content-type'));
    const buf = new Uint8Array(await res.arrayBuffer());
    const byBytes = containerFromBytes(buf);
    if (byBytes !== 'unknown') return byBytes;
    if (byMime !== 'unknown') return byMime;
    return fromExt;
  } catch {
    return fromExt;
  } finally {
    clearTimeout(timer);
  }
}
