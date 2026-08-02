import { describe, it, expect } from 'vitest';
import { logoCandidates } from '@/lib/logoFallback';
describe('logoCandidates', () => {
  it('adds alt extensions', () => {
    const c = logoCandidates('https://x.com/a/logo.png');
    expect(c[0]).toBe('https://x.com/a/logo.png');
    expect(c).toContain('https://x.com/a/logo.jpg');
    expect(c).toContain('https://x.com/a/logo.webp');
  });
  it('keeps query strings', () => {
    expect(logoCandidates('https://x.com/l.jpg?v=2')).toContain('https://x.com/l.png?v=2');
  });
  it('upgrades http', () => {
    expect(logoCandidates('http://x.com/l.png')).toContain('https://x.com/l.png');
  });
  it('empty for missing', () => expect(logoCandidates(null)).toEqual([]));
  it('no ext untouched', () => expect(logoCandidates('https://x.com/l')).toEqual(['https://x.com/l']));
});
