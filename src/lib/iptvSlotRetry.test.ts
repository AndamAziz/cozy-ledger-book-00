import { describe, expect, it } from 'vitest';
import { firstAvailableEpisode, isSlotLimitPayload, slotRetryDelay } from './iptvSlotRetry';

describe('iptvSlotRetry', () => {
  it('detects slot limit payloads', () => {
    expect(isSlotLimitPayload({ code: 'SLOT_LIMIT' })).toBe(true);
    expect(isSlotLimitPayload({ error: 'All viewing slots are in use right now.' })).toBe(true);
    expect(isSlotLimitPayload({ error: 'Stream unavailable (404)' })).toBe(false);
    expect(isSlotLimitPayload(null)).toBe(false);
  });

  it('backs off and caps the delay', () => {
    expect(slotRetryDelay(0)).toBe(2000);
    expect(slotRetryDelay(1)).toBe(4000);
    expect(slotRetryDelay(9)).toBe(12000);
  });

  it('picks the first non-exhausted episode', () => {
    const eps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(firstAvailableEpisode(eps, ['a'])?.id).toBe('b');
    expect(firstAvailableEpisode(eps, ['a', 'b', 'c'])).toBeNull();
  });
});
