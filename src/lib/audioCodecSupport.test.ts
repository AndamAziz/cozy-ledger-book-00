import { describe, expect, it } from 'vitest';
import { audioCodecLabel, isDolbyOrDtsAudio, isMpegtsSilentAudio } from './audioCodecSupport';

describe('audioCodecSupport', () => {
  it('detects Dolby / DTS tracks', () => {
    expect(isDolbyOrDtsAudio('ac-3')).toBe(true);
    expect(isDolbyOrDtsAudio('AC3')).toBe(true);
    expect(isDolbyOrDtsAudio('E-AC-3')).toBe(true);
    expect(isDolbyOrDtsAudio('dts')).toBe(true);
    expect(isDolbyOrDtsAudio('mp4a.40.2')).toBe(false);
    expect(isDolbyOrDtsAudio(undefined)).toBe(false);
  });

  it('knows which tracks mpegts.js drops silently', () => {
    expect(isMpegtsSilentAudio('AC-3')).toBe(true);
    expect(isMpegtsSilentAudio('aac')).toBe(false);
    expect(isMpegtsSilentAudio('mp3')).toBe(false);
    expect(isMpegtsSilentAudio('')).toBe(false);
  });

  it('labels codecs for the viewer', () => {
    expect(audioCodecLabel('ec-3')).toContain('E-AC-3');
    expect(audioCodecLabel('ac-3')).toContain('AC-3');
    expect(audioCodecLabel('dts')).toBe('DTS');
  });
});
