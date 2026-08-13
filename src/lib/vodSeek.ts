/**
 * Seek helpers for VOD (movies / episodes).
 *
 * Some Xtream providers (and the relay in front of them) serve progressive files
 * without honouring HTTP Range. The media element then advertises a full length
 * it cannot actually seek inside: a restored resume position makes the browser
 * jump straight to the end of the file and fire `ended` after a few seconds.
 * These pure helpers let the player detect both situations.
 */

/** Ignore an end that lands this far (seconds) before the real length. */
export const PREMATURE_END_MARGIN = 45;

export interface TimeRangeLike {
  length: number;
  start(index: number): number;
  end(index: number): number;
}

/** True when `time` sits inside one of the element's seekable ranges. */
export function canSeekTo(ranges: TimeRangeLike | null | undefined, time: number): boolean {
  if (!ranges || !Number.isFinite(time) || time <= 0) return false;
  for (let i = 0; i < ranges.length; i += 1) {
    if (time >= ranges.start(i) && time <= ranges.end(i)) return true;
  }
  return false;
}

/**
 * True when playback reported "ended" long before the media length — i.e. the
 * stream dropped or a Range-less seek collapsed the timeline.
 */
export function isPrematureEnd(playedTo: number, duration: number): boolean {
  if (!Number.isFinite(duration) || duration <= 0) return false;
  if (!Number.isFinite(playedTo) || playedTo < 0) return true;
  return playedTo < duration - PREMATURE_END_MARGIN;
}
