/**
 * Cross-browser playback helpers.
 *
 * Safari (iOS/iPadOS/macOS) and most Smart TV browsers (Tizen, webOS, Android
 * TV WebView) decode HLS natively and often *only* natively — hardware HEVC and
 * AC-3 audio are unavailable through MediaSource on those platforms. hls.js is
 * the right engine everywhere else (Chrome, Edge, Firefox, Opera, Samsung
 * Internet, Android WebView).
 */

/** True when the media element can play HLS manifests without hls.js. */
export function nativeHlsSupported(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const v = document.createElement('video');
    const can =
      v.canPlayType('application/vnd.apple.mpegurl') ||
      v.canPlayType('application/x-mpegURL');
    return can === 'probably' || can === 'maybe';
  } catch {
    return false;
  }
}

/** iOS/iPadOS, where only the video element itself can go fullscreen. */
export function isIosLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return (
    /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1)
  );
}

type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => void;
  msRequestFullscreen?: () => void;
};
type FsVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };
type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
  msExitFullscreen?: () => void;
};

export function fullscreenElement(): Element | null {
  if (typeof document === 'undefined') return null;
  const d = document as FsDoc;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

/** Enter/exit fullscreen with iOS + legacy WebKit/Edge fallbacks. */
export function toggleFullscreen(
  shell: HTMLElement | null,
  video: HTMLVideoElement | null,
): void {
  const d = document as FsDoc;
  if (fullscreenElement()) {
    (d.exitFullscreen?.bind(d) ?? d.webkitExitFullscreen ?? d.msExitFullscreen)?.();
    return;
  }
  const el = shell as FsElement | null;
  const v = video as FsVideo | null;
  // iPhone cannot fullscreen arbitrary elements — only the video itself.
  if (isIosLike() && v?.webkitEnterFullscreen) {
    v.webkitEnterFullscreen();
    return;
  }
  if (el?.requestFullscreen) {
    el.requestFullscreen().catch(() => undefined);
    return;
  }
  el?.webkitRequestFullscreen?.() ?? el?.msRequestFullscreen?.() ?? v?.webkitEnterFullscreen?.();
}

/** Subscribe to fullscreen changes across vendor prefixes. */
export function onFullscreenChange(handler: () => void): () => void {
  document.addEventListener('fullscreenchange', handler);
  document.addEventListener('webkitfullscreenchange', handler);
  return () => {
    document.removeEventListener('fullscreenchange', handler);
    document.removeEventListener('webkitfullscreenchange', handler);
  };
}

/**
 * Autoplay policies (Chrome, Safari, Firefox) reject unmuted playback started
 * without a gesture. That is not a stream failure: retry muted so the picture
 * appears, then let the user unmute.
 */
export async function playWithAutoplayFallback(
  video: HTMLVideoElement,
  onMuted?: () => void,
): Promise<void> {
  try {
    await video.play();
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'NotAllowedError' && !video.muted) {
      video.muted = true;
      onMuted?.();
      await video.play();
      return;
    }
    throw err;
  }
}
