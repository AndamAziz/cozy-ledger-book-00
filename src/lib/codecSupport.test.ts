import { describe, expect, it, vi, afterEach } from 'vitest';
import { isHevcCodec, canPlayHevc, isUnsupportedHevc } from './codecSupport';

const setMse = (supported: boolean) => {
  (globalThis as any).MediaSource = { isTypeSupported: () => supported };
};

afterEach(() => {
  delete (globalThis as any).MediaSource;
  vi.restoreAllMocks();
});

describe('isHevcCodec', () => {
  it('detects HEVC variants', () => {
    for (const c of [
      'hvc1.1.1.L120.B0',
      'hev1.2.4.L120.B0',
      'video/mp4;codecs="hvc1.1.6.L93.B0"',
      'h265',
      'H.265',
      'HEVC',
    ]) expect(isHevcCodec(c)).toBe(true);
  });

  it('ignores H.264 and audio codecs', () => {
    for (const c of ['avc1.4d4028', 'video/mp4;codecs="avc1.64001f,mp4a.40.2"', 'h264', 'mp4a.40.2', '', null])
      expect(isHevcCodec(c)).toBe(false);
  });
});

describe('canPlayHevc / isUnsupportedHevc', () => {
  it('flags HEVC as unsupported when MSE rejects it', () => {
    setMse(false);
    vi.spyOn(document, 'createElement').mockReturnValue({ canPlayType: () => '' } as any);
    expect(canPlayHevc('hvc1.1.1.L120.B0')).toBe(false);
    expect(isUnsupportedHevc('hvc1.1.1.L120.B0')).toBe(true);
  });

  it('allows HEVC when MSE supports it', () => {
    setMse(true);
    expect(isUnsupportedHevc('hvc1.1.1.L120.B0')).toBe(false);
  });

  it('allows HEVC on Safari-style native support', () => {
    setMse(false);
    vi.spyOn(document, 'createElement').mockReturnValue({ canPlayType: () => 'probably' } as any);
    expect(isUnsupportedHevc('hvc1.1.1.L120.B0')).toBe(false);
  });

  it('never blocks H.264 regardless of MSE answer', () => {
    setMse(false);
    expect(isUnsupportedHevc('avc1.4d4028')).toBe(false);
    expect(isUnsupportedHevc(undefined)).toBe(false);
  });
});
