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
 */
export function hlsConfigFor(tv = isTvMode()) {
  return tv
    ? {
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 8,
        maxMaxBufferLength: 12,
        maxBufferSize: 12 * 1000 * 1000,
        backBufferLength: 0,
        liveSyncDurationCount: 3,
        fragLoadingMaxRetry: 2,
        capLevelToPlayerSize: true,
      }
    : {
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 20,
        backBufferLength: 30,
        // Measured on this panel: a 10 s segment is 2.2-3.1 MB and takes 6-8 s
        // over browser -> edge -> relay -> provider. hls.js defaults
        // liveSyncDurationCount to 3, so a channel change had to land three of
        // them (~20 s) before the first frame. Two halves that and still keeps
        // about one segment of slack against a late fetch.
        liveSyncDurationCount: 2,
        startFragPrefetch: true,
      };
}

/**
 * mpegts.js config: smaller stash + no back buffer on TV.
 *
 * autoCleanupSourceBuffer matters just as much off TV: a continuous live TS
 * feed left running for many minutes keeps appending to the SourceBuffer with
 * nothing trimming the back of it. Once the browser's MSE quota is hit,
 * mpegts.js is forced to tear down and recreate the MediaSource -- visible in
 * devtools as a MediaSource onSourceEnded/onSourceClose/onSourceOpen cycle --
 * which is exactly what showed up to the viewer as the picture pausing for a
 * moment and resuming on its own every so often. Desktop RAM being larger
 * than a TV's just means it takes longer to hit the ceiling, not that it
 * never does, so both paths now trim the backward buffer the same way.
 */
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
    : {
        enableWorker: true,
        liveBufferLatencyChasing: true,
        lazyLoad: false,
        autoCleanupSourceBuffer: true,
        autoCleanupMaxBackwardDuration: 30,
        autoCleanupMinBackwardDuration: 15,
      };
}
