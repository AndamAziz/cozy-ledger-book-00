/**
 * Smart TV remote-control support.
 *
 * Living-room browsers (Tizen, webOS, Android TV, Fire TV, Vidaa, Roku web,
 * Chromecast) deliver remote presses as keyboard events — but the payloads are
 * inconsistent: some send `event.key` names, older platforms only send numeric
 * `keyCode`s. This module normalises them into a small action vocabulary and
 * provides pure geometric focus-movement helpers so the whole platform can be
 * driven with nothing but a D-pad.
 */

export type RemoteAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'ok'
  | 'back'
  | 'channelUp'
  | 'channelDown'
  | 'playPause'
  | 'play'
  | 'pause'
  | 'stop'
  | 'rewind'
  | 'forward'
  | 'mute'
  | 'info';

/** Numeric keyCodes used by TV platforms (Tizen / webOS / Android TV / HbbTV). */
const CODE_MAP: Record<number, RemoteAction> = {
  8: 'back', // Backspace — Android TV / Fire TV back
  13: 'ok',
  27: 'back',
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
  166: 'back', // BrowserBack
  179: 'playPause',
  412: 'rewind',
  413: 'stop',
  415: 'play',
  417: 'forward',
  419: 'info', // ColorF0Red on some panels
  427: 'channelUp',
  428: 'channelDown',
  447: 'mute',
  448: 'info',
  457: 'info', // Tizen INFO
  461: 'back', // webOS / LG back
  10009: 'back', // Tizen return
  10182: 'back', // Tizen exit
  10252: 'playPause', // Tizen MediaPlayPause
};

const KEY_MAP: Record<string, RemoteAction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'ok',
  ' ': 'ok',
  Space: 'ok',
  Select: 'ok',
  Escape: 'back',
  Backspace: 'back',
  BrowserBack: 'back',
  GoBack: 'back',
  XF86Back: 'back',
  ChannelUp: 'channelUp',
  ChannelDown: 'channelDown',
  PageUp: 'channelUp',
  PageDown: 'channelDown',
  MediaTrackNext: 'channelUp',
  MediaTrackPrevious: 'channelDown',
  MediaPlayPause: 'playPause',
  MediaPlay: 'play',
  MediaPause: 'pause',
  MediaStop: 'stop',
  MediaRewind: 'rewind',
  MediaFastForward: 'forward',
  AudioVolumeMute: 'mute',
  VolumeMute: 'mute',
  Info: 'info',
  ContextMenu: 'info',
};

/** Map a keyboard/remote event onto a remote action, or null when unhandled. */
export function remoteAction(e: Pick<KeyboardEvent, 'key' | 'keyCode'>): RemoteAction | null {
  const byKey = e.key ? KEY_MAP[e.key] : undefined;
  if (byKey) return byKey;
  const code = typeof e.keyCode === 'number' ? CODE_MAP[e.keyCode] : undefined;
  return code ?? null;
}

/** Heuristic: is this browser running on a TV / set-top box? */
export function isTvDevice(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /smart-?tv|smarttv|tizen|web0s|webos|netcast|hbbtv|viera|aquos|bravia|philipstv|vidaa|whaletv|roku|googletv|android\s?tv|crkey|aftb|aftm|aftt|firetv|dtv|large screen/i.test(
    ua,
  );
}

/** Elements a remote can land on. */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="option"]',
  '[role="tab"]',
  '[tabindex]:not([tabindex="-1"])',
  'video[controls]',
].join(',');

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const cx = (r: Rect) => r.left + r.width / 2;
const cy = (r: Rect) => r.top + r.height / 2;

/**
 * Score a candidate rect for a directional move. Lower is better; `null` means
 * the candidate is not in that direction at all.
 *
 * Primary distance is along the travel axis, with a heavy penalty for
 * cross-axis drift so the focus walks in visually straight lines (grids,
 * channel lists) instead of jumping across the screen.
 */
export function directionScore(from: Rect, to: Rect, dir: 'up' | 'down' | 'left' | 'right'): number | null {
  const horizontal = dir === 'left' || dir === 'right';
  const forward = horizontal
    ? dir === 'right'
      ? to.left - from.left
      : from.left - to.left
    : dir === 'down'
      ? to.top - from.top
      : from.top - to.top;

  // Must make real progress along the axis (4px tolerance for sub-pixel layout).
  if (forward <= 4) return null;

  const drift = horizontal ? Math.abs(cy(to) - cy(from)) : Math.abs(cx(to) - cx(from));
  const overlap = horizontal
    ? Math.min(from.bottom, to.bottom) - Math.max(from.top, to.top)
    : Math.min(from.right, to.right) - Math.max(from.left, to.left);

  // Aligned rows/columns win outright; otherwise drift costs 3x.
  return forward + drift * (overlap > 0 ? 0.3 : 3);
}

/** Pick the best element to focus next, or null when the edge is reached. */
export function pickNextFocus<T>(
  from: Rect,
  candidates: { el: T; rect: Rect }[],
  dir: 'up' | 'down' | 'left' | 'right',
): T | null {
  let best: T | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const score = directionScore(from, c.rect, dir);
    if (score !== null && score < bestScore) {
      bestScore = score;
      best = c.el;
    }
  }
  return best;
}

/** Custom DOM events players listen to, so remote keys work in any view. */
export const TV_EVENT = {
  channelUp: 'tv:channel-up',
  channelDown: 'tv:channel-down',
  playPause: 'tv:play-pause',
  stop: 'tv:stop',
  rewind: 'tv:rewind',
  forward: 'tv:forward',
  mute: 'tv:mute',
  back: 'tv:back',
} as const;
