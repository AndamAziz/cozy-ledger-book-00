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

/** Deep links to players that ship their own HEVC / Dolby decoders. */
export function externalPlayerTargets(src: string): ExternalPlayerTarget[] {
  const url = absoluteStreamUrl(src);
  const targets: ExternalPlayerTarget[] = [];
  if (isAndroid()) {
    targets.push({
      id: 'mx',
      label: 'MX Player',
      href: `intent:${url}#Intent;type=video/*;action=android.intent.action.VIEW;end`,
    });
  }
  if (isApple()) {
    targets.push({ id: 'infuse', label: 'Infuse', href: `infuse://x-callback-url/play?url=${encodeURIComponent(url)}` });
  }
  targets.push({ id: 'vlc', label: 'VLC', href: isApple() ? `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(url)}` : `vlc://${url}` });
  return targets;
}

/** Copy the stream URL so it can be pasted into any player. */
export async function copyStreamUrl(src: string): Promise<boolean> {
  const url = absoluteStreamUrl(src);
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
