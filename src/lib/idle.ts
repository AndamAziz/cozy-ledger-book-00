/**
 * Tiny scheduler helpers used to keep background work (health probes, catalogue
 * indexing) off the critical rendering path.
 *
 * `onIdle` prefers `requestIdleCallback` and degrades to a macrotask, so a
 * burst of background probes can never delay a tap, scroll or paint.
 */

type IdleHandle = { cancel: () => void };

type IdleApi = {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function onIdle(fn: () => void, timeout = 500): IdleHandle {
  if (typeof window === 'undefined') {
    fn();
    return { cancel: () => undefined };
  }
  const api = window as unknown as IdleApi;
  if (typeof api.requestIdleCallback === 'function') {
    const id = api.requestIdleCallback(() => fn(), { timeout });
    return { cancel: () => api.cancelIdleCallback?.(id) };
  }
  const id = window.setTimeout(fn, 1);
  return { cancel: () => window.clearTimeout(id) };
}

/** Resolves on the next idle slot — `await idle()` inside async loops. */
export function idle(timeout = 500): Promise<void> {
  return new Promise((resolve) => {
    onIdle(resolve, timeout);
  });
}

/** True when the tab is hidden, i.e. background work should pause entirely. */
export function tabHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}
