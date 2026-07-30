/**
 * Codec capability checks for browser (MSE) playback.
 *
 * Chrome/Edge/Firefox on desktop reject HEVC/H.265 inside MediaSource: the
 * failure happens at `addSourceBuffer`, before any engine-specific logic, so
 * every engine (native / mpegts.js / hls.js) fails identically. Detecting it up
 * front lets the player show an honest message instead of cycling engines and
 * spinning forever.
 */

/** True when a codec string / mime type describes HEVC (H.265). */
export function isHevcCodec(codec?: string | null): boolean {
  if (!codec) return false;
  return /(^|[^a-z0-9])(hvc1|hev1|hevc|h\.?265|x265)([^a-z0-9]|$)/i.test(codec);
}

/** Extract a usable `video/mp4;codecs="…"` mime type from a codec hint. */
function toMimeCandidates(codec?: string | null): string[] {
  const raw = (codec ?? '').trim();
  // Already a full mime type (`video/mp4;codecs="hvc1.1.1.L120.B0"`).
  if (/^\w+\/\w+/.test(raw)) return [raw];
  const cleaned = raw.replace(/^video\//i, '');
  const candidates = cleaned && /^(hvc1|hev1)\./i.test(cleaned) ? [cleaned] : [];
  return [...candidates, 'hvc1.1.6.L93.B0', 'hev1.1.6.L93.B0'].map(
    (c) => (/^\w+\/\w+/.test(c) ? c : `video/mp4;codecs="${c}"`),
  );
}

/** Can this browser decode HEVC through MediaSource / the media element? */
export function canPlayHevc(codec?: string | null): boolean {
  const candidates = toMimeCandidates(codec);
  const ms = (globalThis as { MediaSource?: { isTypeSupported?: (t: string) => boolean } }).MediaSource;
  if (ms?.isTypeSupported) {
    if (candidates.some((c) => {
      try {
        return ms.isTypeSupported!(c);
      } catch {
        return false;
      }
    })) return true;
  }
  // Safari / iOS decode HEVC in the element even when MSE says otherwise.
  try {
    const video = document.createElement('video');
    return candidates.some((c) => {
      const type = c.replace(/^video\/mp4/, 'video/mp4');
      return video.canPlayType(type) === 'probably' || video.canPlayType(type) === 'maybe';
    });
  } catch {
    return false;
  }
}

/**
 * Single decision point used by the player: is this stream HEVC *and*
 * undecodable here? Non-HEVC codecs always return false, so H.264 channels keep
 * the full existing engine chain untouched.
 */
export function isUnsupportedHevc(codec?: string | null): boolean {
  return isHevcCodec(codec) && !canPlayHevc(codec);
}
