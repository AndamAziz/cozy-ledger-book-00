import { describe, it, expect } from 'vitest';
import { padActions, shouldFire, FIRST_REPEAT_MS, REPEAT_MS, BUTTON_MAP } from './gamepad';
import { remoteAction } from './tvRemote';

const pad = (pressed: number[], axes: number[] = [0, 0]) => ({
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
  axes,
});

describe('padActions', () => {
  it('maps the Xbox D-pad and primary buttons', () => {
    expect(padActions(pad([12]))).toContain('up');
    expect(padActions(pad([13]))).toContain('down');
    expect(padActions(pad([14]))).toContain('left');
    expect(padActions(pad([15]))).toContain('right');
    expect(padActions(pad([0]))).toContain('ok');
    expect(padActions(pad([1]))).toContain('back');
  });

  it('maps shoulder buttons to channel zapping', () => {
    expect(padActions(pad([5]))).toContain('channelUp');
    expect(padActions(pad([4]))).toContain('channelDown');
  });

  it('reads the left analogue stick past the deadzone only', () => {
    expect(padActions(pad([], [0.3, 0.3]))).toEqual([]);
    expect(padActions(pad([], [-1, 0]))).toContain('left');
    expect(padActions(pad([], [0, 1]))).toContain('down');
  });

  it('covers every action needed to switch channels', () => {
    const actions = new Set(Object.values(BUTTON_MAP));
    for (const a of ['up', 'down', 'left', 'right', 'ok', 'channelUp', 'channelDown'] as const) {
      expect(actions.has(a)).toBe(true);
    }
  });
});

describe('shouldFire', () => {
  it('fires immediately on a fresh press', () => {
    expect(shouldFire(1000, undefined)).toBe(true);
  });

  it('waits out the first-repeat delay while held', () => {
    const state = { since: 1000, last: 1000 };
    expect(shouldFire(1000 + REPEAT_MS, state)).toBe(false);
    expect(shouldFire(1000 + FIRST_REPEAT_MS, state)).toBe(true);
  });

  it('repeats quickly once the key is long-held', () => {
    const state = { since: 1000, last: 1000 + FIRST_REPEAT_MS };
    expect(shouldFire(1000 + FIRST_REPEAT_MS + REPEAT_MS, state)).toBe(true);
  });
});

describe('console keycodes', () => {
  it('maps Windows/Xbox gamepad virtual keys and names', () => {
    expect(remoteAction({ key: '', keyCode: 195 } as KeyboardEvent)).toBe('ok');
    expect(remoteAction({ key: '', keyCode: 203 } as KeyboardEvent)).toBe('up');
    expect(remoteAction({ key: '', keyCode: 199 } as KeyboardEvent)).toBe('channelUp');
    expect(remoteAction({ key: 'GamepadA', keyCode: 0 } as KeyboardEvent)).toBe('ok');
    expect(remoteAction({ key: 'GamepadDpadDown', keyCode: 0 } as KeyboardEvent)).toBe('down');
  });

  it('still maps plain Enter, Space and keyCode 23', () => {
    expect(remoteAction({ key: 'Enter', keyCode: 13 } as KeyboardEvent)).toBe('ok');
    expect(remoteAction({ key: ' ', keyCode: 32 } as KeyboardEvent)).toBe('ok');
    expect(remoteAction({ key: '', keyCode: 23 } as KeyboardEvent)).toBe('ok');
  });
});
