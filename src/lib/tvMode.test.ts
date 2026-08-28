import { describe, expect, it } from 'vitest';
import { hlsConfigFor, mpegtsConfigFor } from './tvMode';

describe('Smart TV playback tuning', () => {
  it('caps hls buffers and drops the back buffer on TV', () => {
    const tv = hlsConfigFor(true);
    expect(tv.maxBufferLength).toBeLessThanOrEqual(10);
    expect(tv.backBufferLength).toBe(0);
    expect(tv.lowLatencyMode).toBe(false);
    expect(tv.capLevelToPlayerSize).toBe(true);
  });

  it('starts closer to the live edge off TV without low-latency mode', () => {
    const desktop = hlsConfigFor(false);
    expect(desktop.lowLatencyMode).toBe(false);
    expect(desktop.maxBufferLength).toBe(20);
    expect(desktop.liveSyncDurationCount).toBe(2);
  });

  it('enables source-buffer cleanup for mpegts on TV only', () => {
    expect(mpegtsConfigFor(true).autoCleanupSourceBuffer).toBe(true);
    expect('autoCleanupSourceBuffer' in mpegtsConfigFor(false)).toBe(false);
  });
});
