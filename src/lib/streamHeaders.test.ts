import { describe, expect, it } from 'vitest';
import { encodeStreamHeaders, needsProxy, resolveStreamSource } from './streamHeaders';

const PROXY = 'https://x.functions/iptv-m3u-proxy?url=';

describe('streamHeaders', () => {
  it('treats channels without headers as direct', () => {
    expect(needsProxy(null)).toBe(false);
    expect(needsProxy({})).toBe(false);
    expect(needsProxy({ referer: '   ' })).toBe(false);
    expect(resolveStreamSource('http://a/live.m3u8', null, PROXY)).toBe('http://a/live.m3u8');
  });

  it('routes channels with custom headers through the proxy', () => {
    const src = resolveStreamSource('http://a/live.m3u8', { referer: 'https://ref.tv/' }, PROXY);
    expect(src.startsWith(PROXY)).toBe(true);
    expect(src).toContain('&h=');
  });

  it('proxies without headers when a direct attempt failed', () => {
    const src = resolveStreamSource('http://a/live.m3u8', null, PROXY, true);
    expect(src).toBe(`${PROXY}${encodeURIComponent('http://a/live.m3u8')}`);
  });

  it('encodes headers url-safely and drops blanks', () => {
    const enc = encodeStreamHeaders({ referer: 'https://ref.tv/', userAgent: '', origin: ' ' });
    expect(enc).not.toMatch(/[+/=]/);
    const json = atob(enc.replace(/-/g, '+').replace(/_/g, '/'));
    expect(JSON.parse(json)).toEqual({ referer: 'https://ref.tv/' });
  });
});
