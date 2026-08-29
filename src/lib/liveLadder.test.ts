import { describe, expect, it } from 'vitest';
import { candidateFormatFor, liveEngineOrder } from './liveLadder';
import { liveFormatOrder, refusalScope } from '../../supabase/functions/_shared/iptvFormatRules';

describe('live engine ladder', () => {
  it('leads with mpegts on a ts-only panel', () => {
    const order = liveEngineOrder({ tsOnly: true, nativeHls: false, hlsSupported: true });
    expect(order[0]).toBe('mpegts');
    expect(order).toContain('native');
  });

  it('keeps a usable engine when the resolved content-type is MPEG-TS', () => {
    const order = liveEngineOrder({
      tsOnly: false,
      nativeHls: true,
      hlsSupported: true,
      contentType: 'video/mp2t',
    });
    expect(order).toContain('mpegts');
  });

  it('leads with the HLS engines for a normal panel', () => {
    expect(
      liveEngineOrder({ tsOnly: false, nativeHls: true, hlsSupported: true })[0],
    ).toBe('native');
    expect(
      liveEngineOrder({ tsOnly: false, nativeHls: false, hlsSupported: true })[0],
    ).toBe('hls');
  });

  it('keeps native HLS first for an HLS-only panel on Safari-style browsers', () => {
    expect(
      liveEngineOrder({ tsOnly: false, nativeHls: true, hlsSupported: true, hlsOnly: true })[0],
    ).toBe('native');
    expect(
      liveEngineOrder({ tsOnly: false, nativeHls: false, hlsSupported: true, hlsOnly: true })[0],
    ).toBe('hls');
  });

  it('falls back to native HLS when MSE (mpegts.js/hls.js) is unavailable', () => {
    const order = liveEngineOrder({ tsOnly: false, nativeHls: true, hlsSupported: false });
    expect(order[0]).toBe('native');
  });

  it('drops hls.js when MSE is unavailable and never returns an empty ladder', () => {
    const order = liveEngineOrder({ tsOnly: true, nativeHls: false, hlsSupported: false });
    expect(order).not.toContain('hls');
    expect(order.length).toBeGreaterThan(0);
  });

  it('maps the engine to the container the proxy is asked for', () => {
    expect(candidateFormatFor('mpegts', 'live')).toBe('ts');
    expect(candidateFormatFor('hls', 'live')).toBe('m3u8');
    expect(candidateFormatFor('native', 'vod')).toBe('file');
  });
});

describe('candidate order heuristics', () => {
  it('uses only ts for a ts-only panel', () => {
    expect(liveFormatOrder({ formats: ['ts'], tsOnly: true, hls: false })).toEqual(['ts']);
  });

  it('uses only m3u8 when the panel advertises HLS and no ts', () => {
    expect(liveFormatOrder({ formats: ['m3u8', 'rtmp'], tsOnly: false, hls: true })).toEqual(['m3u8']);
  });

  it('probes a minimal m3u8-then-ts set when the panel advertises nothing', () => {
    expect(liveFormatOrder(null)).toEqual(['m3u8', 'ts']);
    expect(liveFormatOrder({ formats: [], tsOnly: false, hls: false })).toEqual(['m3u8', 'ts']);
  });

  it('prefers segmented HLS for both-format panels', () => {
    const both = { formats: ['m3u8', 'ts'], tsOnly: false, hls: true };
    expect(liveFormatOrder(both)).toEqual(['m3u8', 'ts']);
    expect(liveFormatOrder(both, true)).toEqual(['m3u8', 'ts']);
  });
});

/**
 * End-to-end ladder simulation: a panel that refuses `.m3u8` with 407 must still
 * reach playback on `.ts`, while a genuine 429/509 has to stop the whole host.
 */
function runLadder(
  candidates: string[],
  respond: (url: string) => number,
  kind = 'live',
) {
  const blocked = new Set<string>();
  const host = 'panel.example.com';
  const fmtOf = (u: string) => /\.([a-z0-9]+)$/.exec(u)?.[1] ?? 'raw';
  const trace: string[] = [];
  let slotLimited = false;
  let played: string | null = null;

  for (const url of candidates) {
    const fmt = fmtOf(url);
    if (blocked.has(`${host}`) || blocked.has(`${host}|${fmt}`)) continue;
    const status = respond(url);
    trace.push(`${fmt}:${status}`);
    if (status === 200) {
      played = url;
      break;
    }
    if (status === 407 || status === 458) {
      const otherUntried = candidates.some(
        (c) => fmtOf(c) !== fmt && !blocked.has(`${host}|${fmtOf(c)}`),
      );
      const scope = refusalScope({ status, kind, format: fmt, otherFormatsUntried: otherUntried });
      if (scope === 'format') blocked.add(`${host}|${fmt}`);
      else {
        slotLimited = true;
        blocked.add(host);
      }
      continue;
    }
    if (status === 429 || status === 509) {
      blocked.add(host);
      break;
    }
  }
  return { played, trace, slotLimited, blocked: [...blocked] };
}

describe('407 on .m3u8 regression', () => {
  it('still succeeds with the ts candidate and reports no slot limit', () => {
    const candidates = [
      'http://panel.example.com/live/u/p/1.m3u8',
      'http://panel.example.com/live/u/p/1.ts',
    ];
    const out = runLadder(candidates, (u) => (u.endsWith('.m3u8') ? 407 : 200));
    expect(out.played).toContain('.ts');
    expect(out.slotLimited).toBe(false);
    expect(out.trace).toEqual(['m3u8:407', 'ts:200']);
    expect(out.blocked).toEqual(['panel.example.com|m3u8']);
    // Same panel, ts-first order (the shipped default): plays on attempt #1.
    const tsFirst = runLadder([candidates[1], candidates[0]], (u) => (u.endsWith('.m3u8') ? 407 : 200));
    expect(tsFirst.trace).toEqual(['ts:200']);
  });

  it('reports a real slot limit when the last remaining format is refused too', () => {
    const candidates = [
      'http://panel.example.com/live/u/p/1.m3u8',
      'http://panel.example.com/live/u/p/1.ts',
    ];
    const out = runLadder(candidates, () => 458);
    expect(out.played).toBeNull();
    expect(out.slotLimited).toBe(true);
    expect(out.blocked).toContain('panel.example.com');
  });

  it('keeps 429/509 host-wide so a throttled panel is not hammered', () => {
    for (const status of [429, 509]) {
      const out = runLadder(
        ['http://panel.example.com/live/u/p/1.m3u8', 'http://panel.example.com/live/u/p/1.ts'],
        () => status,
      );
      expect(out.played).toBeNull();
      expect(out.blocked).toEqual(['panel.example.com']);
      expect(out.trace).toEqual([`m3u8:${status}`]);
    }
  });

  it('never treats a VOD 407 as a format refusal', () => {
    expect(
      refusalScope({ status: 407, kind: 'vod', format: 'm3u8', otherFormatsUntried: true }),
    ).toBe('route');
  });
});
