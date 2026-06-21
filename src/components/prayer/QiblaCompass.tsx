import { useEffect, useRef, useState } from 'react';
import { Compass, Navigation, Smartphone } from 'lucide-react';
import { compassPoint } from '@/lib/qibla';

interface QiblaCompassProps {
  bearing: number; // degrees from true North to Qibla
  distanceKm: number;
  dir: 'rtl' | 'ltr';
  i18n: {
    qiblaTitle: string;
    qiblaDesc: string;
    bearingFromNorth: (deg: number, point: string) => string;
    enableCompass: string;
    compassActive: string;
    compassNotSupported: string;
    pointPhone: string;
    distance: (km: string) => string;
    aligned: string;
  };
}

type OrientationEvt = DeviceOrientationEvent & { webkitCompassHeading?: number };

export function QiblaCompass({ bearing, distanceKm, dir, i18n }: QiblaCompassProps) {
  const [heading, setHeading] = useState<number | null>(null);
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const headingRef = useRef<number | null>(null);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'DeviceOrientationEvent' in window);
  }, []);

  const handleOrientation = (e: OrientationEvt) => {
    let h: number | null = null;
    if (typeof e.webkitCompassHeading === 'number') {
      // iOS: already compass heading (clockwise from North)
      h = e.webkitCompassHeading;
    } else if (typeof e.alpha === 'number') {
      // Most Android browsers: alpha is counter-clockwise from North
      h = 360 - e.alpha;
    }
    if (h !== null) {
      headingRef.current = h;
      setHeading(h);
    }
  };

  const enableCompass = async () => {
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    try {
      if (DOE && typeof DOE.requestPermission === 'function') {
        const res = await DOE.requestPermission();
        if (res !== 'granted') return;
      }
    } catch { /* ignore */ }
    window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
    window.addEventListener('deviceorientation', handleOrientation as EventListener, true);
    setEnabled(true);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
      window.removeEventListener('deviceorientation', handleOrientation as EventListener, true);
    };
  }, []);

  // When compass is live: rotate the whole dial by -heading so North marker
  // tracks real North, and the Qibla needle sits at `bearing` on the dial.
  const live = enabled && heading !== null;
  const dialRotation = live ? -(heading as number) : 0;
  // Relative angle of Qibla from where the phone currently points.
  const relative = live ? ((bearing - (heading as number) + 360) % 360) : bearing;
  const aligned = live && (relative < 8 || relative > 352);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-secondary/40 via-secondary/20 to-transparent backdrop-blur-xl border border-white/10 p-4 sm:p-6 shadow-xl">
      <div className="flex items-center gap-2 mb-1">
        <Compass className="h-5 w-5 text-gold" />
        <h2 className="text-base sm:text-lg font-bold text-foreground">{i18n.qiblaTitle}</h2>
      </div>
      <p className="text-xs sm:text-sm text-muted-foreground mb-4">{i18n.qiblaDesc}</p>

      <div className="flex flex-col items-center">
        <div className="relative w-56 h-56 sm:w-64 sm:h-64">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-4 border-primary/30 bg-gradient-to-br from-secondary/60 to-background/80 shadow-inner" />

          {/* Rotating dial (cardinal markers) */}
          <div
            className="absolute inset-0 transition-transform duration-200 ease-out"
            style={{ transform: `rotate(${dialRotation}deg)` }}
          >
            {[
              { l: 'N', a: 0, c: 'text-red-400' },
              { l: 'E', a: 90, c: 'text-muted-foreground' },
              { l: 'S', a: 180, c: 'text-muted-foreground' },
              { l: 'W', a: 270, c: 'text-muted-foreground' },
            ].map((m) => (
              <div
                key={m.l}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ transform: `rotate(${m.a}deg) translateY(-104px) rotate(${-m.a}deg)` }}
              >
                <span className={`text-sm font-bold ${m.c}`}>{m.l}</span>
              </div>
            ))}

            {/* Tick marks */}
            {Array.from({ length: 24 }).map((_, i) => (
              <div
                key={i}
                className="absolute left-1/2 top-1/2 origin-bottom"
                style={{
                  height: '50%',
                  transform: `translate(-50%, -100%) rotate(${i * 15}deg)`,
                }}
              >
                <div className={`mx-auto w-px ${i % 6 === 0 ? 'h-3 bg-foreground/40' : 'h-2 bg-foreground/20'}`} />
              </div>
            ))}

            {/* Qibla needle — fixed at `bearing` on the dial */}
            <div
              className="absolute left-1/2 top-1/2 origin-bottom"
              style={{ height: '46%', transform: `translate(-50%, -100%) rotate(${bearing}deg)` }}
            >
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 -mb-1 rounded-full bg-gradient-to-br from-gold to-amber-500 flex items-center justify-center shadow-lg shadow-gold/40 ring-2 ring-background">
                  <span className="text-base leading-none">🕋</span>
                </div>
                <div className="w-1.5 flex-1 bg-gradient-to-b from-gold to-gold/30 rounded-full" />
              </div>
            </div>
          </div>

          {/* Center hub */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-gold ring-4 ring-background z-10" />

          {/* Phone pointer (top, fixed) when live */}
          {live && (
            <div className="absolute left-1/2 -top-1 -translate-x-1/2 z-10">
              <Navigation className={`h-5 w-5 ${aligned ? 'text-primary' : 'text-foreground/70'}`} />
            </div>
          )}
        </div>

        <div className="mt-5 text-center">
          <p className="text-2xl font-extrabold text-gold tabular-nums">
            {i18n.bearingFromNorth(Math.round(bearing), compassPoint(bearing))}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{i18n.distance(Math.round(distanceKm).toLocaleString())}</p>

          {aligned && (
            <p className="mt-2 text-sm font-bold text-primary">✓ {i18n.aligned}</p>
          )}
        </div>

        {/* Compass control / fallback note */}
        <div className="mt-4 w-full">
          {!supported ? (
            <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5" /> {i18n.compassNotSupported}
            </p>
          ) : !enabled ? (
            <button
              onClick={enableCompass}
              className="w-full rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground font-bold py-2.5 px-4 flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-md shadow-primary/30"
            >
              <Compass className="h-4 w-4" /> {i18n.enableCompass}
            </button>
          ) : (
            <p className="text-center text-xs text-primary flex items-center justify-center gap-1.5 font-medium">
              <Compass className="h-3.5 w-3.5" /> {live ? i18n.pointPhone : i18n.compassActive}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
