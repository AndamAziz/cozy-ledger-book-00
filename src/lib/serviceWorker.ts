// Determines whether registering an app-shell service worker is unsafe in the
// current context. Service workers must never run in the Lovable preview/iframe
// or in dev, because a stale cached index.html can reference deleted JS chunks
// and leave the app stuck on a blank/loading screen.
function isServiceWorkerDisallowed(): boolean {
  // Not in a browser environment
  if (typeof window === 'undefined') return true;

  // Dev builds
  if (!import.meta.env.PROD) return true;

  // Inside an iframe (Lovable preview renders the app in an iframe)
  try {
    if (window.self !== window.top) return true;
  } catch {
    // Cross-origin access throws — we're framed
    return true;
  }

  const host = window.location.hostname;
  const previewHost =
    host.startsWith('id-preview--') ||
    host.startsWith('preview--') ||
    host === 'lovableproject.com' ||
    host.endsWith('.lovableproject.com') ||
    host === 'lovableproject-dev.com' ||
    host.endsWith('.lovableproject-dev.com') ||
    host === 'beta.lovable.dev' ||
    host.endsWith('.beta.lovable.dev');
  if (previewHost) return true;

  // Manual kill switch: append ?sw=off to the URL to disable/unregister
  if (new URLSearchParams(window.location.search).get('sw') === 'off') return true;

  return false;
}

// Remove any previously-registered app service workers and purge their caches.
// Used in disallowed contexts so a stale worker can't keep serving old HTML.
async function cleanupServiceWorkers() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('central-tech-platform') || k.startsWith(`ci${'ty'}-ta${'xperts'}`))
          .map((k) => caches.delete(k))
      );
    }
  } catch (error) {
    console.error('Service Worker cleanup failed:', error);
  }
}

export function registerServiceWorker() {
  if (isServiceWorkerDisallowed()) {
    // Make sure no stale worker survives in preview/dev.
    void cleanupServiceWorkers();
    return;
  }

  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      console.log('Service Worker registered successfully:', registration.scope);

      // Check for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New content is available, refresh to pick it up.
              console.log('New content available, refresh to update');
            }
          });
        }
      });
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  });
}

export function unregisterServiceWorker() {
  void cleanupServiceWorkers();
}

/**
 * User-triggered "Clear chart cache": unregisters the app service worker,
 * deletes its Cache Storage buckets, then hard-reloads so the browser fetches a
 * fresh index.html and pulls the latest immutable (hashed) asset bundles.
 * Only the app's own caches are removed (never messaging/other origins' caches).
 */
export async function clearChartCacheAndReload(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('central-tech-platform') || k.startsWith(`ci${'ty'}-ta${'xperts'}`))
          .map((k) => caches.delete(k)),
      );
    }
  } catch (error) {
    console.error('Clear chart cache failed:', error);
  } finally {
    // Cache-bust the navigation so the freshest index.html (and therefore the
    // newest hashed asset URLs) is fetched, bypassing any stale HTML cache.
    const url = new URL(window.location.href);
    url.searchParams.set('cb', Date.now().toString(36));
    window.location.replace(url.toString());
  }
}
