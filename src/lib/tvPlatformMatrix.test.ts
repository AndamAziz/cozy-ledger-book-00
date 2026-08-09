import { describe, it, expect } from 'vitest';
import { remoteAction, isTvDevice, type RemoteAction } from './tvRemote';

/**
 * Automated Smart TV platform matrix.
 *
 * Each living-room platform delivers remote presses differently: Tizen and
 * webOS fire numeric `keyCode`s with an empty `key`, Android TV / Fire TV mix
 * DPAD codes with real key names. This matrix locks in D-pad, OK and CH+/CH-
 * detection for every platform we ship on, so a regression in the key maps
 * fails the test suite instead of the living room.
 */

interface Platform {
  name: string;
  ua: string;
  /** [key, keyCode] pairs as the platform actually emits them. */
  keys: Partial<Record<RemoteAction, [string, number][]>>;
}

const PLATFORMS: Platform[] = [
  {
    name: 'Tizen (Samsung)',
    ua: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 Version/6.0 TV Safari/537.36',
    keys: {
      up: [['', 38]],
      down: [['', 40]],
      left: [['', 37]],
      right: [['', 39]],
      ok: [['', 13]],
      channelUp: [['', 427]],
      channelDown: [['', 428]],
      back: [['', 10009]],
      playPause: [['', 10252]],
      mute: [['', 447]],
    },
  },
  {
    name: 'webOS (LG)',
    ua: 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/79 Safari/537.36',
    keys: {
      up: [['', 38]],
      down: [['', 40]],
      left: [['', 37]],
      right: [['', 39]],
      ok: [['Enter', 13]],
      // webOS maps CH+/CH- onto PageUp/PageDown (33/34) as well as 427/428.
      channelUp: [
        ['', 33],
        ['PageUp', 33],
        ['', 427],
      ],
      channelDown: [
        ['', 34],
        ['PageDown', 34],
        ['', 428],
      ],
      back: [['', 461]],
    },
  },
  {
    name: 'Android TV / Fire TV',
    ua: 'Mozilla/5.0 (Linux; Android 12; AFTB Build/STT) AppleWebKit/537.36 Chrome/120 Safari/537.36 CrKey',
    keys: {
      up: [['ArrowUp', 38]],
      down: [['ArrowDown', 40]],
      left: [['ArrowLeft', 37]],
      right: [['ArrowRight', 39]],
      // DPAD_CENTER surfaces as 23 on Fire TV, Enter or Space elsewhere.
      ok: [
        ['', 23],
        ['Enter', 13],
        ['', 32],
      ],
      channelUp: [
        ['ChannelUp', 0],
        ['MediaTrackNext', 0],
      ],
      channelDown: [
        ['ChannelDown', 0],
        ['MediaTrackPrevious', 0],
      ],
      back: [
        ['', 8],
        ['BrowserBack', 0],
      ],
    },
  },
];

describe.each(PLATFORMS)('$name remote', (platform) => {
  it('is detected as a TV device', () => {
    expect(isTvDevice(platform.ua)).toBe(true);
  });

  const entries = Object.entries(platform.keys) as [RemoteAction, [string, number][]][];

  it.each(entries)('resolves %s from every emitted variant', (action, variants) => {
    for (const [key, keyCode] of variants) {
      expect(remoteAction({ key, keyCode } as KeyboardEvent)).toBe(action);
    }
  });

  it('covers the four D-pad directions, OK and both channel keys', () => {
    const covered = new Set(entries.map(([action]) => action));
    for (const required of ['up', 'down', 'left', 'right', 'ok', 'channelUp', 'channelDown'] as RemoteAction[]) {
      expect(covered.has(required)).toBe(true);
    }
  });
});

describe('remote map hygiene', () => {
  it('never treats plain typing keys as remote actions', () => {
    for (const key of ['a', 'z', '1', 'Tab', 'Shift', 'F5']) {
      expect(remoteAction({ key, keyCode: key.charCodeAt(0) } as KeyboardEvent)).toBeNull();
    }
  });

  it('prefers the key name when both key and code are present', () => {
    // Android sends key='ArrowUp' with a legacy code for OK on some panels.
    expect(remoteAction({ key: 'ArrowUp', keyCode: 13 } as KeyboardEvent)).toBe('up');
  });
});
