import { describe, it, expect } from 'vitest';
import { canSeekTo, isPrematureEnd, PREMATURE_END_MARGIN } from './vodSeek';

function ranges(list: [number, number][]) {
  return {
    length: list.length,
    start: (i: number) => list[i][0],
    end: (i: number) => list[i][1],
  };
}

describe('canSeekTo', () => {
  it('accepts a time inside a seekable range', () => {
    expect(canSeekTo(ranges([[0, 2660]]), 600)).toBe(true);
  });
  it('rejects a time outside every range', () => {
    expect(canSeekTo(ranges([[0, 120]]), 600)).toBe(false);
  });
  it('rejects when nothing is seekable', () => {
    expect(canSeekTo(ranges([]), 600)).toBe(false);
    expect(canSeekTo(null, 600)).toBe(false);
  });
  it('rejects non-positive / invalid times', () => {
    expect(canSeekTo(ranges([[0, 100]]), 0)).toBe(false);
    expect(canSeekTo(ranges([[0, 100]]), Number.NaN)).toBe(false);
  });
});

describe('isPrematureEnd', () => {
  it('flags an end far before the length', () => {
    expect(isPrematureEnd(12, 2658)).toBe(true);
  });
  it('accepts a genuine end near the length', () => {
    expect(isPrematureEnd(2658 - PREMATURE_END_MARGIN + 1, 2658)).toBe(false);
  });
  it('ignores unknown durations', () => {
    expect(isPrematureEnd(10, 0)).toBe(false);
    expect(isPrematureEnd(10, Number.NaN)).toBe(false);
  });
});
