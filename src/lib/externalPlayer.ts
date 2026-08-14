/**
 * Escape hatch for streams the browser cannot decode.
 *
 * Some provider files use HEVC/H.265 video or Dolby (AC-3/E-AC-3) / DTS audio.
 * Chrome, Edge and Firefox have no decoder for those, so the picture or the
 * sound is simply missing and no amount of engine switching fixes it — the file
 * itself is fine. External players (VLC, MX Player, Infuse, the TV's own player)
 * bundle their own decoders, so handing them the same URL plays it perfectly.
 */

export type ExternalPlayerTarget = {
  id: string;
  label: string;
  href: string;
};

const isAndroid = () => /Android/i.test(navigator.userAgent);
const isApple = () => /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent);

/** Absolute URL — deep links cannot resolve app-relative paths. */
export function absoluteStreamUrl(src: string): string {
  try {
    return new URL(src, window.location.origin).toString();
  } catch {
    return src;
  }
}

/** Which player app the current device actually has a chance of opening. */
export function externalPlayerTargets(src: string): ExternalPlayerTarget[] {
  const url = absoluteStreamUrl(src);
  if (isAndroid()) {
    return [{
      id: 'mx',
      label: 'MX Player',
      href: `intent:${url}#Intent;type=video/*;action=android.intent.action.VIEW;end`,
    }];
  }
  if (isApple()) {
    return [{ id: 'infuse', label: 'Infuse', href: `infuse://x-callback-url/play?url=${encodeURIComponent(url)}` }];
  }
  return [{ id: 'vlc', label: 'VLC', href: `vlc://${url}` }];
}

/** The single deep link to surface, picked from the device itself. */
export function primaryExternalPlayer(src: string): ExternalPlayerTarget {
  return externalPlayerTargets(src)[0];
}

/**
 * Navigate straight into the player app. Called from a button (not a link) so
 * there is no context menu, no "copy link address" and nothing to share.
 */
export function openInExternalPlayer(src: string): void {
  const target = primaryExternalPlayer(src);
  try {
    window.location.href = target.href;
  } catch {
    /* scheme not registered — nothing else we can do from the browser */
  }
}
