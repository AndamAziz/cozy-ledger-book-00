import { beforeEach, describe, expect, it } from 'vitest';
import {
  DIRECT_FAIL_THRESHOLD,
  directConnectBudgetMs,
  isDirectParked,
  ladderRetryDelay,
  parkMsFor,
  readDirectState,
  recordDirectFailure,
  recordDirectSuccess,
} from './directRetryPolicy';

describe('directRetryPolicy', () => {
  beforeEach(() => localStorage.clear());

  it('does not park before the failure threshold', () => {
    recordDirectFailure('s1');
    expect(isDirectParked('s1')).toBe(false);
    expect(parkMsFor(1)).toBe(0);
  });

  it('parks with escalating windows once the threshold is crossed', () => {
    for (let i = 0; i < DIRECT_FAIL_THRESHOLD; i++) recordDirectFailure('s1');
    expect(isDirectParked('s1')).toBe(true);
    const first = parkMsFor(DIRECT_FAIL_THRESHOLD);
    const second = parkMsFor(DIRECT_FAIL_THRESHOLD + 1);
    const third = parkMsFor(DIRECT_FAIL_THRESHOLD + 2);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    // Capped: no window grows without bound.
    expect(parkMsFor(50)).toBe(third);
  });

  it('clears state on success and after the park expires', () => {
    for (let i = 0; i < DIRECT_FAIL_THRESHOLD; i++) recordDirectFailure('s1');
    recordDirectSuccess('s1');
    expect(readDirectState('s1').strikes).toBe(0);
    expect(isDirectParked('s1')).toBe(false);

    recordDirectFailure('s2', 1_000);
    recordDirectFailure('s2', 1_000);
    expect(isDirectParked('s2', 1_000)).toBe(true);
    expect(isDirectParked('s2', 1_000 + parkMsFor(DIRECT_FAIL_THRESHOLD) + 1)).toBe(false);
  });

  it('decays strikes after a long quiet period', () => {
    recordDirectFailure('s3', 1_000);
    expect(readDirectState('s3', 1_000 + 13 * 60 * 60 * 1000).strikes).toBe(0);
  });

  it('tightens the connect budget as strikes accumulate', () => {
    expect(directConnectBudgetMs(0)).toBeGreaterThan(directConnectBudgetMs(1));
    expect(directConnectBudgetMs(1)).toBeGreaterThan(directConnectBudgetMs(2));
    expect(directConnectBudgetMs(9)).toBe(directConnectBudgetMs(2));
    expect(directConnectBudgetMs(0)).toBeLessThanOrEqual(15_000);
  });

  it('backs off exponentially with jitter, always capped', () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      const d = ladderRetryDelay(attempt, 4_000, 20_000);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThanOrEqual(25_000);
    }
    const late = ladderRetryDelay(6, 4_000, 20_000);
    expect(late).toBeGreaterThanOrEqual(15_000);
  });
});
