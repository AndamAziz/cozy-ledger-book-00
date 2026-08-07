import { describe, it, expect, vi, afterEach } from 'vitest';
import { nativeHlsSupported, playWithAutoplayFallback } from './playback';

afterEach(() => vi.restoreAllMocks());

describe('nativeHlsSupported', () => {
  it('is true when the media element reports HLS support (Safari / iOS / Smart TV)', () => {
    vi.spyOn(document, 'createElement').mockReturnValue({
      canPlayType: () => 'probably',
    } as unknown as HTMLElement);
    expect(nativeHlsSupported()).toBe(true);
  });

  it('is false in Chrome / Firefox, where hls.js must be used', () => {
    vi.spyOn(document, 'createElement').mockReturnValue({
      canPlayType: () => '',
    } as unknown as HTMLElement);
    expect(nativeHlsSupported()).toBe(false);
  });
});

describe('playWithAutoplayFallback', () => {
  it('retries muted when autoplay is blocked instead of reporting a stream error', async () => {
    let calls = 0;
    const video = {
      muted: false,
      play: () => {
        calls += 1;
        if (calls === 1) return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
        return Promise.resolve();
      },
    } as unknown as HTMLVideoElement;

    const onMuted = vi.fn();
    await playWithAutoplayFallback(video, onMuted);
    expect(calls).toBe(2);
    expect(video.muted).toBe(true);
    expect(onMuted).toHaveBeenCalled();
  });

  it('propagates real playback failures', async () => {
    const video = {
      muted: false,
      play: () => Promise.reject(Object.assign(new Error('dead'), { name: 'NotSupportedError' })),
    } as unknown as HTMLVideoElement;
    await expect(playWithAutoplayFallback(video)).rejects.toThrow('dead');
  });
});
