import { describe, expect, it } from 'vitest';
import {
  normalizeTikTokLiveUser,
  needsRedirectResolution,
  toSocialEmbed,
} from './socialEmbed';

describe('TikTok LIVE support', () => {
  const LIVE_EMBED = 'https://www.tiktok.com/embed/@aminheyasi?autoplay=1&playsinline=1';

  it('extracts username from bare /@user/live', () => {
    expect(normalizeTikTokLiveUser('https://www.tiktok.com/@aminheyasi/live')).toBe(
      'aminheyasi',
    );
  });

  it('extracts username with trailing slash', () => {
    expect(normalizeTikTokLiveUser('https://www.tiktok.com/@aminheyasi/live/')).toBe(
      'aminheyasi',
    );
  });

  it('extracts username with tracking query params', () => {
    const url =
      'https://www.tiktok.com/@aminheyasi/live?_r=1&enter_from_merge=pc_share&enter_method=pc_share&is_from_webapp=1&sender_device=pc';
    expect(normalizeTikTokLiveUser(url)).toBe('aminheyasi');
  });

  it('handles www/m/no-subdomain hosts', () => {
    expect(normalizeTikTokLiveUser('https://tiktok.com/@user_1.name/live')).toBe(
      'user_1.name',
    );
    expect(normalizeTikTokLiveUser('https://m.tiktok.com/@user-name/live')).toBe(
      'user-name',
    );
  });

  it('returns null for non-live TikTok URLs', () => {
    expect(
      normalizeTikTokLiveUser('https://www.tiktok.com/@user/video/7206187236755361029'),
    ).toBeNull();
    expect(normalizeTikTokLiveUser('https://www.tiktok.com/@user')).toBeNull();
    expect(normalizeTikTokLiveUser('https://www.tiktok.com/live')).toBeNull();
  });

  it('returns null for non-TikTok hosts', () => {
    expect(normalizeTikTokLiveUser('https://youtube.com/@user/live')).toBeNull();
  });

  it('toSocialEmbed builds official live embed URL', () => {
    const res = toSocialEmbed('https://www.tiktok.com/@aminheyasi/live');
    expect(res).toEqual({ platform: 'tiktok', embedUrl: LIVE_EMBED });
  });

  it('toSocialEmbed strips tracking params from live URL', () => {
    const res = toSocialEmbed(
      'https://www.tiktok.com/@aminheyasi/live?_r=1&enter_from_merge=pc_share&enter_method=pc_share&is_from_webapp=1&sender_device=pc',
    );
    expect(res?.embedUrl).toBe(LIVE_EMBED);
  });

  it('live URLs do not require server-side redirect resolution', () => {
    expect(
      needsRedirectResolution('https://www.tiktok.com/@aminheyasi/live?_r=1'),
    ).toBe(false);
  });

  it('regular TikTok video URL still uses player/v1 with autoplay enabled', () => {
    const res = toSocialEmbed(
      'https://www.tiktok.com/@pluschannel11/video/7206187236755361029?_r=1',
    );
    expect(res?.embedUrl).toMatch(
      /^https:\/\/www\.tiktok\.com\/player\/v1\/7206187236755361029\?/,
    );
    expect(res?.embedUrl).toContain('autoplay=1');
    expect(res?.embedUrl).toContain('playsinline=1');
  });
});

describe('Instagram embed support', () => {
  it('normalises reels to the official embed with best-effort autoplay params', () => {
    const res = toSocialEmbed('https://www.instagram.com/reel/DbEf01Yo3mK/');
    expect(res).toEqual({
      platform: 'instagram',
      embedUrl: 'https://www.instagram.com/reel/DbEf01Yo3mK/embed?autoplay=1&muted=1&playsinline=1',
    });
  });
});
