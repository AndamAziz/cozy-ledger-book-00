import { describe, it, vi, expect } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 't' } } }), onAuthStateChange: vi.fn() } } }));
describe('dbg', () => { it('x', async () => {
  const mod = await import('/dev-server/src/hooks/useIptvPlaylist.ts');
  const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ direct: true, url: 'https://a/b.m3u8' }) });
  vi.stubGlobal('fetch', spy);
  const r = await mod.resolveDirectUrl('9', 'live');
  console.log('RESULT', r, 'calls', spy.mock.calls.length, typeof AbortSignal.timeout);
  expect(1).toBe(1);
}); });
