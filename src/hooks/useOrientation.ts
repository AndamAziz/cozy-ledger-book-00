import { useEffect, useState } from 'react';

export type Orientation = 'portrait' | 'landscape';

/**
 * Track the current device/window orientation. Prefers
 * `window.matchMedia('(orientation: landscape)')`; falls back to comparing
 * window width/height on resize for older browsers that don't support the
 * media-query change event.
 */
export function useOrientation(): Orientation {
  const getOrientation = (): Orientation => {
    if (typeof window === 'undefined') return 'portrait';
    if (typeof window.matchMedia === 'function') {
      return window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
    }
    return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
  };

  const [orientation, setOrientation] = useState<Orientation>(getOrientation);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const update = () => setOrientation(getOrientation());

    let mql: MediaQueryList | null = null;
    let mqlHandler: ((e: MediaQueryListEvent) => void) | null = null;

    if (typeof window.matchMedia === 'function') {
      mql = window.matchMedia('(orientation: landscape)');
      mqlHandler = () => update();
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', mqlHandler);
      } else if (typeof (mql as MediaQueryList).addListener === 'function') {
        // Safari < 14
        (mql as MediaQueryList).addListener(mqlHandler);
      }
    }

    // Resize fallback (also catches rotation on older browsers).
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      if (mql && mqlHandler) {
        if (typeof mql.removeEventListener === 'function') {
          mql.removeEventListener('change', mqlHandler);
        } else if (typeof (mql as MediaQueryList).removeListener === 'function') {
          (mql as MediaQueryList).removeListener(mqlHandler);
        }
      }
    };
  }, []);

  return orientation;
}
