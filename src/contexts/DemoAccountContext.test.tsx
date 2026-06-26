import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  DemoAccountProvider,
  useDemoAccount,
  DEMO_STARTING_BALANCE,
  DEMO_MAX_BALANCE,
} from './DemoAccountContext';

// Keep the context isolated from the backend, i18n and toasts so the test
// exercises ONLY the balance math / clamping logic.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    // No authenticated user => userId stays null, so DB writes are skipped.
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    from: vi.fn(),
  },
}));

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en' }),
}));

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

const renderDemoAccount = () =>
  renderHook(() => useDemoAccount(), { wrapper: DemoAccountProvider });

describe('DemoAccountContext balance clamping', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts at the demo starting balance', () => {
    const { result } = renderDemoAccount();
    expect(result.current.balance).toBe(DEMO_STARTING_BALANCE);
  });

  it('never exceeds DEMO_MAX_BALANCE after a single huge profit', () => {
    const { result } = renderDemoAccount();
    act(() => result.current.applyPnl(1e40));
    expect(result.current.balance).toBe(DEMO_MAX_BALANCE);
    expect(Number.isFinite(result.current.balance)).toBe(true);
  });

  it('stays clamped after repeated leveraged-profit applyPnl calls', () => {
    const { result } = renderDemoAccount();
    // Simulate the runaway 100x-leverage feedback loop: many large wins.
    act(() => {
      for (let i = 0; i < 500; i++) {
        result.current.applyPnl(DEMO_MAX_BALANCE);
      }
    });
    expect(result.current.balance).toBeLessThanOrEqual(DEMO_MAX_BALANCE);
    expect(result.current.balance).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.current.balance)).toBe(true);
  });

  it('never goes below zero after a huge loss', () => {
    const { result } = renderDemoAccount();
    act(() => result.current.applyPnl(-1e40));
    expect(result.current.balance).toBe(0);
  });

  it('handles non-finite deltas without corrupting the balance', () => {
    const { result } = renderDemoAccount();
    act(() => result.current.applyPnl(Number.POSITIVE_INFINITY));
    // Infinity is treated as corruption and reset to the safe starting value.
    expect(result.current.balance).toBe(DEMO_STARTING_BALANCE);
    expect(Number.isFinite(result.current.balance)).toBe(true);
  });

  it('still applies normal small P&L within range', () => {
    const { result } = renderDemoAccount();
    act(() => result.current.applyPnl(123.45));
    expect(result.current.balance).toBe(DEMO_STARTING_BALANCE + 123.45);
    act(() => result.current.applyPnl(-23.45));
    expect(result.current.balance).toBeCloseTo(DEMO_STARTING_BALANCE + 100, 2);
  });

  it('resets to the starting balance on renew', () => {
    const { result } = renderDemoAccount();
    act(() => result.current.applyPnl(1e40));
    expect(result.current.balance).toBe(DEMO_MAX_BALANCE);
    act(() => result.current.renew());
    expect(result.current.balance).toBe(DEMO_STARTING_BALANCE);
  });
});
