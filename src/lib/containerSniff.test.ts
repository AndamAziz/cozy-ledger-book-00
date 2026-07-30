import { describe, expect, it } from 'vitest';
import {
  containerFromBytes,
  containerFromExt,
  containerFromMime,
  engineChain,
  isProgressiveContainer,
} from './containerSniff';

const bytes = (...b: number[]) => new Uint8Array(b);
const ascii = (s: string, pad = 0) =>
  new Uint8Array([...Array(pad).fill(0), ...s.split('').map((c) => c.charCodeAt(0))]);

describe('containerFromExt', () => {
  it('maps known extensions', () => {
    expect(containerFromExt('m3u8')).toBe('hls');
    expect(containerFromExt('.ts')).toBe('mpegts');
    expect(containerFromExt('MKV')).toBe('matroska');
    expect(containerFromExt('mp4')).toBe('mp4');
    expect(containerFromExt(undefined)).toBe('unknown');
  });
});

describe('containerFromBytes', () => {
  it('detects HLS playlists', () => {
    expect(containerFromBytes(ascii('#EXTM3U\n#EXT-X'))).toBe('hls');
  });
  it('detects MP4 ftyp boxes', () => {
    expect(containerFromBytes(ascii('ftypisom', 4))).toBe('mp4');
  });
  it('detects Matroska/MKV', () => {
    expect(containerFromBytes(bytes(0x1a, 0x45, 0xdf, 0xa3, 0x01))).toBe('matroska');
  });
  it('detects MPEG-TS sync bytes', () => {
    const ts = new Uint8Array(200);
    ts[0] = 0x47;
    ts[188] = 0x47;
    expect(containerFromBytes(ts)).toBe('mpegts');
  });
  it('returns unknown for junk', () => {
    expect(containerFromBytes(bytes(1, 2, 3, 4))).toBe('unknown');
  });
});

describe('containerFromMime', () => {
  it('maps content types', () => {
    expect(containerFromMime('application/vnd.apple.mpegurl')).toBe('hls');
    expect(containerFromMime('video/mp2t')).toBe('mpegts');
    expect(containerFromMime('video/x-matroska')).toBe('matroska');
    expect(containerFromMime('video/mp4')).toBe('mp4');
    expect(containerFromMime('text/plain')).toBe('unknown');
  });
});

describe('engineChain', () => {
  it('never offers mpegts.js for progressive files', () => {
    expect(engineChain('mp4', { nativeHls: false })).toEqual(['native']);
    expect(engineChain('matroska', { nativeHls: false })).toEqual(['native']);
    expect(isProgressiveContainer('matroska')).toBe(true);
  });
  it('prefers native HLS on Safari', () => {
    expect(engineChain('hls', { nativeHls: true })[0]).toBe('native');
    expect(engineChain('hls', { nativeHls: false })[0]).toBe('hls');
  });
  it('uses mpegts.js first for transport streams', () => {
    expect(engineChain('mpegts', { nativeHls: false })[0]).toBe('mpegts');
    expect(engineChain('flv', { nativeHls: false })[0]).toBe('mpegts');
  });
});
