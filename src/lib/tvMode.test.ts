import { describe, expect, it } from 'vitest';
import { hlsConfigFor, mpegtsConfigFor } from './tvMode';

describe('Smart TV playback tuning', () => {
  it('caps hls buffers and drops the back buffer on TV', () => {
    const tv = hlsConfigFor(true);
    expect(tv.maxBufferLength).toBeLessThanOrEqual(16);
    expect(tv.backBufferLength).toBe(0);
    expect(tv.lowLatencyMode).toBe(false);
    expect(tv.capLevelToPlayerSize).toBe(true);
  });

  it('keeps the low-latency desktop profile off TV', () => {
    const desktop = hlsConfigFor(false);
    expect(desktop.lowLatencyMode).toBe(false);
    expect(desktop.maxBufferLength).toBeGreaterThanOrEqual(60);
    expect(desktop.fragLoadingTimeOut).toBeGreaterThanOrEqual(45_000);
  });

  it('enables source-buffer cleanup for mpegts on TV only', () => {
    expect(mpegtsConfigFor(true).autoCleanupSourceBuffer).toBe(true);
    expect('autoCleanupSourceBuffer' in mpegtsConfigFor(false)).toBe(false);
  });
});
