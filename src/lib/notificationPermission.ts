/**
 * Notification permission must be requested from a user gesture.
 *
 * Firefox throws ("may only be requested from inside a short running
 * user-generated event handler") and Safari silently denies when the request is
 * made on page load. This helper defers the prompt to the first real user
 * interaction, which every browser accepts.
 */
let armed = false;

export function requestNotificationPermissionOnGesture(): () => void {
  if (typeof window === 'undefined' || !('Notification' in window)) return () => {};
  try {
    if (Notification.permission !== 'default') return () => {};
  } catch {
    return () => {};
  }
  if (armed) return () => {};
  armed = true;

  const ask = () => {
    cleanup();
    try {
      const res = Notification.requestPermission();
      // Safari <16 returns undefined and takes a callback instead.
      (res as Promise<NotificationPermission> | undefined)?.catch?.(() => {});
    } catch {
      /* ignore */
    }
  };
  const cleanup = () => {
    armed = false;
    window.removeEventListener('pointerdown', ask);
    window.removeEventListener('keydown', ask);
    window.removeEventListener('touchend', ask);
  };

  window.addEventListener('pointerdown', ask, { once: true });
  window.addEventListener('keydown', ask, { once: true });
  window.addEventListener('touchend', ask, { once: true });
  return cleanup;
}
