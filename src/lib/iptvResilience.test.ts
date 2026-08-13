import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * The cooldown/backoff and error-classification helpers live in the edge
 * function shared folder (Deno), but they are plain TypeScript with no Deno
 * APIs, so they are unit-tested here with the rest of the suite.
 */
import {
  backoffMs,
  clearCooldown,
  cooldownLeft,
  isRateLimited,
  markRateLimited,
  retryAfterMs,
} from '../../supabase/functions/_shared/iptvCooldown';
import { classifyStatus, classifyTransport } from '../../supabase/functions/_shared/iptvErrors';

describe('iptv cooldown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('flags throttling statuses', () => {
    expect(isRateLimited(429)).toBe(true);
    expect(isRateLimited(509)).toBe(true);
    expect(isRateLimited(403)).toBe(false);
  });

  it('honours Retry-After in seconds and clamps it to the window', () => {
    expect(retryAfterMs(new Headers({ 'retry-after': '45' }))).toBe(45_000);
    expect(retryAfterMs(new Headers({ 'retry-after': '5' }))).toBe(30_000);
    expect(retryAfterMs(new Headers({ 'retry-after': '9999' }))).toBe(120_000);
    expect(retryAfterMs(new Headers())).toBeNull();
    expect(retryAfterMs({ 'Retry-After': '60' })).toBe(60_000);
  });

  it('parks a host for the cooldown window and frees it afterwards', () => {
    const url = 'http://panel.example.com:8080/live/1.m3u8';
    markRateLimited(url, { 'retry-after': '45' });
    expect(cooldownLeft(url)).toBeGreaterThan(40_000);
    // Another URL on the same host is parked too.
    expect(cooldownLeft('http://panel.example.com:8080/other.ts')).toBeGreaterThan(0);
    // A different provider is untouched.
    expect(cooldownLeft('http://other.example.net/live.m3u8')).toBe(0);

    vi.advanceTimersByTime(46_000);
    expect(cooldownLeft(url)).toBe(0);
  });

  it('clears a park after a success', () => {
    const url = 'http://panel2.example.com/live.m3u8';
    markRateLimited(url, { 'retry-after': '60' });
    expect(cooldownLeft(url)).toBeGreaterThan(0);
    clearCooldown(url);
    expect(cooldownLeft(url)).toBe(0);
  });

  it('backs off exponentially with jitter and a cap', () => {
    for (let i = 0; i < 6; i++) {
      const ms = backoffMs(i);
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(10_000);
    }
    expect(backoffMs(0)).toBeLessThan(backoffMs(4));
  });
});

describe('iptv error classification', () => {
  it('maps provider statuses to actionable messages', () => {
    expect(classifyStatus(401).code).toBe('AUTH_FAILED');
    expect(classifyStatus(402).code).toBe('ACCOUNT_EXPIRED');
    expect(classifyStatus(403).code).toBe('WAF_BLOCK');
    expect(classifyStatus(404).code).toBe('CHANNEL_OFFLINE');
    expect(classifyStatus(429).code).toBe('RATE_LIMITED');
    expect(classifyStatus(459).code).toBe('GEO_BLOCKED');
    expect(classifyStatus(500).code).toBe('PROVIDER_DOWN');
  });

  it('prefers body evidence over the bare status', () => {
    expect(classifyStatus(403, 'Account expired').code).toBe('ACCOUNT_EXPIRED');
    expect(classifyStatus(403, 'MAX CONNECTIONS reached').code).toBe('MAX_CONNECTIONS');
    expect(classifyStatus(200, 'ip-limit-reach').code).toBe('MAX_CONNECTIONS');
    expect(classifyStatus(200, 'country-not-allow').code).toBe('GEO_BLOCKED');
  });

  it('never tells the user to retry an auth/subscription failure', () => {
    expect(classifyStatus(401).retryable).toBe(false);
    expect(classifyStatus(402).retryable).toBe(false);
    expect(classifyStatus(500).retryable).toBe(true);
  });

  it('classifies transport failures', () => {
    expect(classifyTransport('Signal timed out').code).toBe('TIMEOUT');
    expect(classifyTransport('Connection refused').code).toBe('PROVIDER_DOWN');
    expect(classifyTransport('something odd').code).toBe('UNKNOWN');
  });
});
