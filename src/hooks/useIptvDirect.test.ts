import { describe, expect, it, beforeEach, vi } from 'vitest';

/**
 * Direct-play resolution: media must be fetched straight from the provider so
 * the Edge Function never streams bytes. These tests lock in the two behaviours
 * that keep playback smooth AND safe:
 *  - an http (mixed-content) target is never offered as direct
 *  - after a direct failure the source is parked so the proxy is used at once
 */
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 't' } } }),
      onAuthStateChange: vi.fn(),
    },
  },
}));

describe('resolveDirectUrl', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('returns the provider URL when the function reports a direct https target', async () => {
    const mod = await import('./useIptvPlaylist');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ direct: true, url: 'https://p.example.com/live/1/2/9.m3u8' }),
      }),
    );
    await expect(mod.resolveDirectUrl('9', 'live')).resolves.toBe('https://p.example.com/live/1/2/9.m3u8');
  });

  it('refuses a non-direct (http) target so the proxy path is used', async () => {
    const mod = await import('./useIptvPlaylist');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ direct: false, url: 'http://p.example.com/live/1/2/9.ts' }),
      }),
    );
    await expect(mod.resolveDirectUrl('9', 'live')).resolves.toBeNull();
  });

  it('tolerates one direct failure but parks after the threshold', async () => {
    const mod = await import('./useIptvPlaylist');
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ direct: true, url: 'https://p.example.com/live/1/2/9.m3u8' }),
    });
    vi.stubGlobal('fetch', spy);
    await mod.resolveDirectUrl('9', 'live');
    mod.invalidateDirectUrl('9');
    spy.mockClear();
    // One strike is not enough — the fast path is still attempted.
    await expect(mod.resolveDirectUrl('10', 'live')).resolves.toBe(
      'https://p.example.com/live/1/2/9.m3u8',
    );
    expect(spy).toHaveBeenCalled();

    mod.invalidateDirectUrl('10');
    spy.mockClear();
    await expect(mod.resolveDirectUrl('11', 'live')).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();

    // A successful direct playback clears the history entirely.
    mod.markDirectSuccess();
    await expect(mod.resolveDirectUrl('12', 'live')).resolves.toBe(
      'https://p.example.com/live/1/2/9.m3u8',
    );
  });
});
