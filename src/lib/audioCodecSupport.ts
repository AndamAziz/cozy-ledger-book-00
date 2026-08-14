/**
 * Audio codec support for the Live TV / VOD player.
 *
 * Movies and episodes from Xtream panels very often carry Dolby audio
 * (AC-3 / E-AC-3) or DTS instead of AAC. Two things then happen:
 *
 *  - mpegts.js only demuxes AAC and MP3, so a `.ts` file with an AC-3 track
 *    plays picture with **no sound at all** (no error is raised).
 *  - Chromium on desktop/Android has no AC-3/DTS decoder either, so the same
 *    file played natively (MKV/MP4) is silent too — while Safari, Smart TVs and
 *    many Android TV WebViews *can* decode it.
 *
 * So the codec is classified here and the player uses it to hop to the native
 * media element (which may have a platform decoder) instead of staying silent.
 */

/** AC-3 / E-AC-3 / DTS / TrueHD — none of these are handled by mpegts.js. */
export function isDolbyOrDtsAudio(codec?: string | null): boolean {
  const c = (codec ?? '').toLowerCase();
  if (!c) return false;
  return /(^|[^a-z0-9])(ac-?3|eac-?3|ec-?3|e-ac-?3|dts|dtshd|truehd|mlp)([^a-z0-9]|$)/.test(c);
}

/** True when mpegts.js will silently drop the audio track for this codec. */
export function isMpegtsSilentAudio(codec?: string | null): boolean {
  const c = (codec ?? '').toLowerCase();
  if (!c) return false;
  if (/aac|mp3|mpeg-?1 ?audio|mp4a/.test(c)) return false;
  return isDolbyOrDtsAudio(c);
}

/** Can the media element decode this audio codec on this platform? */
export function canPlayAudioCodec(codec?: string | null): boolean {
  const c = (codec ?? '').toLowerCase();
  if (!c) return true;
  if (typeof document === 'undefined') return false;
  const probe = document.createElement('video');
  const candidates = /eac-?3|ec-?3|e-ac-?3/.test(c)
    ? ['audio/mp4;codecs="ec-3"', 'video/mp4;codecs="avc1.42E01E,ec-3"']
    : /ac-?3/.test(c)
      ? ['audio/mp4;codecs="ac-3"', 'video/mp4;codecs="avc1.42E01E,ac-3"']
      : /dts/.test(c)
        ? ['audio/mp4;codecs="dtsc"']
        : [];
  if (!candidates.length) return true;
  return candidates.some((m) => {
    try {
      return probe.canPlayType(m) !== '';
    } catch {
      return false;
    }
  });
}

/** Short human label for a silent-audio warning chip. */
export function audioCodecLabel(codec?: string | null): string {
  const c = (codec ?? '').toLowerCase();
  if (/eac-?3|ec-?3|e-ac-?3/.test(c)) return 'Dolby Digital Plus (E-AC-3)';
  if (/ac-?3/.test(c)) return 'Dolby Digital (AC-3)';
  if (/truehd|mlp/.test(c)) return 'Dolby TrueHD';
  if (/dts/.test(c)) return 'DTS';
  return codec || 'this audio track';
}
