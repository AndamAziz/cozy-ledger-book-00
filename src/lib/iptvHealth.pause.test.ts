import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  getChannelStatus,
  isChannelProbingPaused,
  requestChannelStatus,
  setChannelProbingPaused,
} from './iptvHealth';
import { acquirePlayerMount, isPlayerMounted, releasePlayerMount, subscribePlayerMount } from './playerMount';

afterEach(() => setChannelProbingPaused(false));

describe('channel probing pause', () => {
  it('drops probe requests while paused', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    setChannelProbingPaused(true);
    expect(isChannelProbingPaused()).toBe(true);
    requestChannelStatus('live:1', 'https://example.com/1.ts');
    expect(getChannelStatus('live:1')).toBe('unknown');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('player mount notifications', () => {
  it('reports mount and unmount transitions', () => {
    const seen: boolean[] = [];
    const off = subscribePlayerMount((m) => seen.push(m));
    const token = acquirePlayerMount(() => undefined);
    expect(isPlayerMounted()).toBe(true);
    releasePlayerMount(token);
    expect(seen).toEqual([true, false]);
    expect(isPlayerMounted()).toBe(false);
    off();
  });
});
