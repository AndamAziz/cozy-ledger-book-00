import { describe, it, expect } from 'vitest';
import { remoteAction, isTvDevice, directionScore, pickNextFocus, type Rect } from './tvRemote';

const k = (key: string, keyCode = 0) => ({ key, keyCode }) as KeyboardEvent;
const r = (left: number, top: number, w = 100, h = 40): Rect => ({
  left, top, width: w, height: h, right: left + w, bottom: top + h,
});

describe('remoteAction', () => {
  it('maps standard D-pad keys', () => {
    expect(remoteAction(k('ArrowUp'))).toBe('up');
    expect(remoteAction(k('ArrowDown'))).toBe('down');
    expect(remoteAction(k('Enter'))).toBe('ok');
  });

  it('maps Tizen / webOS numeric back codes', () => {
    expect(remoteAction(k('', 10009))).toBe('back');
    expect(remoteAction(k('', 461))).toBe('back');
  });

  it('maps channel and media keys from both key names and codes', () => {
    expect(remoteAction(k('ChannelUp'))).toBe('channelUp');
    expect(remoteAction(k('', 427))).toBe('channelUp');
    expect(remoteAction(k('', 428))).toBe('channelDown');
    expect(remoteAction(k('MediaPlayPause'))).toBe('playPause');
    expect(remoteAction(k('', 415))).toBe('play');
    expect(remoteAction(k('', 447))).toBe('mute');
  });

  it('ignores unknown keys', () => {
    expect(remoteAction(k('q', 81))).toBeNull();
  });
});

describe('isTvDevice', () => {
  it('detects TV user agents', () => {
    expect(isTvDevice('Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0)')).toBe(true);
    expect(isTvDevice('Mozilla/5.0 (Web0S; Linux/SmartTV)')).toBe(true);
    expect(isTvDevice('Mozilla/5.0 (Linux; Android 9; AFTB Build) CrKey')).toBe(true);
    expect(isTvDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe(false);
  });
});

describe('directionScore', () => {
  it('rejects candidates behind the travel direction', () => {
    expect(directionScore(r(0, 100), r(0, 0), 'down')).toBeNull();
    expect(directionScore(r(100, 0), r(0, 0), 'right')).toBeNull();
  });

  it('prefers aligned neighbours over drifting ones', () => {
    const aligned = directionScore(r(0, 0), r(0, 60), 'down')!;
    const drifted = directionScore(r(0, 0), r(600, 60), 'down')!;
    expect(aligned).toBeLessThan(drifted);
  });
});

describe('pickNextFocus', () => {
  const grid = [
    { el: 'a', rect: r(0, 0) },
    { el: 'b', rect: r(120, 0) },
    { el: 'c', rect: r(0, 60) },
    { el: 'd', rect: r(120, 60) },
  ];

  it('walks the grid in straight lines', () => {
    expect(pickNextFocus(r(0, 0), grid.slice(1), 'right')).toBe('b');
    expect(pickNextFocus(r(0, 0), grid.slice(1), 'down')).toBe('c');
    expect(pickNextFocus(r(120, 0), [grid[3]], 'down')).toBe('d');
  });

  it('returns null at the edge', () => {
    expect(pickNextFocus(r(120, 60), grid.slice(0, 3), 'down')).toBeNull();
  });
});
