import { describe, it, expect } from 'vitest';
import { parseSocialUrl, isShortLink, normalizeUrl } from './socialEmbed';

describe('normalizeUrl', () => {
  it('adds https scheme when missing', () => {
    expect(normalizeUrl('youtu.be/abc')).toBe('https://youtu.be/abc');
  });
  it('keeps existing scheme', () => {
    expect(normalizeUrl('http://x.com')).toBe('http://x.com');
  });
});

describe('isShortLink', () => {
  it('detects tiktok/facebook short domains', () => {
    expect(isShortLink('https://vm.tiktok.com/ZM123/')).toBe(true);
    expect(isShortLink('vt.tiktok.com/ZM123')).toBe(true);
    expect(isShortLink('https://fb.watch/abc123/')).toBe(true);
  });
  it('does not flag full links', () => {
    expect(isShortLink('https://www.youtube.com/watch?v=x')).toBe(false);
    expect(isShortLink('https://youtu.be/x')).toBe(false);
  });
});

describe('parseSocialUrl - YouTube', () => {
  it('watch?v=', () => {
    expect(parseSocialUrl('https://youtube.com/watch?v=dQw4w9WgXcQ').embedUrl)
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });
  it('youtu.be short', () => {
    expect(parseSocialUrl('https://youtu.be/dQw4w9WgXcQ').embedUrl)
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });
  it('live', () => {
    expect(parseSocialUrl('https://www.youtube.com/live/abc123').videoId).toBe('abc123');
  });
  it('shorts', () => {
    expect(parseSocialUrl('https://www.youtube.com/shorts/abc123').embedUrl)
      .toBe('https://www.youtube.com/embed/abc123');
  });
});

describe('parseSocialUrl - TikTok', () => {
  it('full @user/video/ID', () => {
    const r = parseSocialUrl('https://www.tiktok.com/@user/video/7123456789012345678');
    expect(r.platform).toBe('tiktok');
    expect(r.embedUrl).toBe('https://www.tiktok.com/embed/v2/7123456789012345678');
  });
});

describe('parseSocialUrl - Facebook', () => {
  it('watch/?v=ID', () => {
    const r = parseSocialUrl('https://www.facebook.com/watch/?v=1234567890');
    expect(r.platform).toBe('facebook');
    expect(r.embedUrl).toContain('plugins/video.php');
    expect(r.embedUrl).toContain(encodeURIComponent('v=1234567890'));
  });
  it('user/videos/ID', () => {
    const r = parseSocialUrl('https://www.facebook.com/someuser/videos/1234567890/');
    expect(r.platform).toBe('facebook');
    expect(r.embedUrl).toContain('plugins/video.php');
  });
});

describe('parseSocialUrl - Instagram', () => {
  it('reel with igsh tracking param', () => {
    const r = parseSocialUrl('https://www.instagram.com/reel/Cabc123/?igsh=xyz==');
    expect(r.platform).toBe('instagram');
    expect(r.embedUrl).toBe('https://www.instagram.com/reel/Cabc123/embed');
  });
  it('post', () => {
    expect(parseSocialUrl('https://instagram.com/p/Cxyz/').embedUrl)
      .toBe('https://www.instagram.com/p/Cxyz/embed');
  });
  it('tv', () => {
    expect(parseSocialUrl('https://instagram.com/tv/Ctv1/').platform).toBe('instagram');
  });
});

describe('parseSocialUrl - unknown', () => {
  it('returns null embedUrl for unsupported', () => {
    const r = parseSocialUrl('https://example.com/video/123');
    expect(r.platform).toBe('unknown');
    expect(r.embedUrl).toBeNull();
  });
  it('handles garbage input', () => {
    expect(parseSocialUrl('not a url').platform).toBe('unknown');
  });
});
