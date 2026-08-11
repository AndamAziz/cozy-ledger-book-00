/**
 * Smart TV mode: detection + memory-lean playback tuning.
 *
 * Living-room browsers (Tizen, webOS, Android TV, Fire TV) run on ~1-1.5GB RAM
 * with weak GPUs. Two things kill them: compositor-heavy CSS (backdrop blur,
 * infinite animations, huge shadows) and streaming engines that buffer tens of
 * megabytes. `initTvMode()` flips a `data-tv` attribute on <html>/<body> that
 * `index.css` uses to strip the expensive effects, and the config helpers below
 * shrink the HLS / mpegts buffers so long sessions don't OOM.
 */

import { isTvDevice } from './tvRemote';

/** Mark the document as TV-driven. Safe to call repeatedly. */
export function markTvMode(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-tv', 'true');
  document.body?.setAttribute('data-tv', 'true');
}

/** Detect a TV/set-top browser as early as possible (before first paint). */
export function initTvMode(ua?: string): boolean {
  if (typeof document === 'undefined') return false;
  const tv = isTvDevice(ua ?? navigator.userAgent) || lowMemoryDevice();
  if (tv) markTvMode();
  return tv;
}

/** True once TV mode is active (UA sniff or a D-pad key was pressed). */
export function isTvMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.hasAttribute('data-tv') || !!document.body?.hasAttribute('data-tv');
}

/** Very constrained hardware — treat like a TV for effect-stripping purposes. */
export function lowMemoryDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ram = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof ram === 'number' && ram > 0 && ram <= 1;
}

/**
 * hls.js config. On TVs we cap the forward buffer and disable back-buffer
 * retention so the SourceBuffer stays small (a 20s+90s buffer on a 1080p feed
 * is ~60MB of decoded data — enough to crash Tizen).
 *
 * Segments travel provider → relay → edge → browser, which realistically takes
 * 15-30s for a 10s segment. `lowLatencyMode` (edge-hugging) plus hls.js' default
 * 20s fragment timeout therefore produced hard stalls on perfectly healthy
 * streams, so live playback runs with a generous fragment timeout and a real
 * cushion instead of playing at the live edge.
 */
export function hlsConfigFor(tv = isTvMode()) {
  const patience = {
    lowLatencyMode: false,
    fragLoadingTimeOut: 60_000,
    manifestLoadingTimeOut: 30_000,
    levelLoadingTimeOut: 30_000,
    fragLoadingMaxRetryTimeout: 8_000,
  };
  return tv
    ? {
        enableWorker: true,
        ...patience,
        maxBufferLength: 16,
        maxMaxBufferLength: 24,
        maxBufferSize: 16 * 1000 * 1000,
        backBufferLength: 0,
        liveSyncDurationCount: 4,
        fragLoadingMaxRetry: 4,
        capLevelToPlayerSize: true,
      }
    : {
        enableWorker: true,
        ...patience,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        backBufferLength: 30,
        liveSyncDurationCount: 4,
        fragLoadingMaxRetry: 6,
        capLevelToPlayerSize: false,
      };
}


/** mpegts.js config: smaller stash + no back buffer on TV. */
export function mpegtsConfigFor(tv = isTvMode()) {
  return tv
    ? {
        enableWorker: true,
        liveBufferLatencyChasing: true,
        lazyLoad: false,
        enableStashBuffer: false,
        autoCleanupSourceBuffer: true,
        autoCleanupMaxBackwardDuration: 8,
        autoCleanupMinBackwardDuration: 4,
      }
    : { enableWorker: true, liveBufferLatencyChasing: true, lazyLoad: false };
}
