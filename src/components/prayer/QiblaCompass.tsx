import { useCallback, useEffect, useRef, useState } from 'react';
import { Compass, Navigation, Smartphone, RefreshCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  compassPoint,
  magneticToTrue,
  angleDifference,
  relativeQiblaAngle,
  isAlignedToQibla,
} from '@/lib/qibla';

type Quality = 'good' | 'low' | 'unstable';

interface QiblaCompassProps {
  bearing: number; // degrees from TRUE North to Qibla (0–360)
  distanceKm: number;
  declination: number; // magnetic declination (deg, +E) at the user's location
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
    // accuracy / calibration
    accuracyLabel: string;
    accuracyGood: string;
    accuracyLow: string;
    accuracyUnstable: string;
    calibrationTip: string;
  };
}

type OrientationEvt = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

/** Derive a heading-quality grade from iOS accuracy and/or sample jitter. */
function computeQuality(iosAccuracy: number | null, jitter: number): Quality {
  if (iosAccuracy !== null) {
    // Apple: negative = unreliable; the value is the +/- error in degrees.
    if (iosAccuracy < 0 || iosAccuracy > 35) return 'unstable';
    if (iosAccuracy > 15) return 'low';
    return 'good';
  }
  if (jitter > 12) return 'unstable';
  if (jitter > 5) return 'low';
  return 'good';
}

export function QiblaCompass({ bearing, distanceKm, declination, dir, i18n }: QiblaCompassProps) {
  const [heading, setHeading] = useState<number | null>(null); // smoothed TRUE-north heading
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [noReadings, setNoReadings] = useState(false);
  const [quality, setQuality] = useState<Quality>('good');

  const smoothedRef = useRef<number | null>(null);
  const gotReadingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const samplesRef = useRef<number[]>([]); // recent raw headings for jitter estimation

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'DeviceOrientationEvent' in window);
  }, []);

  const handleOrientation = useCallback(
    (e: OrientationEvt) => {
      let trueHeading: number | null = null;
      let iosAccuracy: number | null = null;

      if (typeof e.webkitCompassHeading === 'number' && isFinite(e.webkitCompassHeading)) {
        // iOS Safari: already a TRUE-north compass heading (Apple applies declination).
        trueHeading = e.webkitCompassHeading;
        if (typeof e.webkitCompassAccuracy === 'number') iosAccuracy = e.webkitCompassAccuracy;
      } else if (typeof e.alpha === 'number' && isFinite(e.alpha)) {
        // Android/Chrome: alpha is counter-clockwise from MAGNETIC north.
        const magneticHeading = (360 - e.alpha) % 360;
        // Convert magnetic → true north using the local declination.
        trueHeading = magneticToTrue(magneticHeading, declination);
        // A non-absolute event means the heading isn't Earth-frame referenced.
        if (e.absolute === false) iosAccuracy = null;
      }

      if (trueHeading === null) return;

      gotReadingRef.current = true;
      if (noReadings) setNoReadings(false);

      // Maintain a short window of raw headings to estimate jitter (instability).
      const samples = samplesRef.current;
      samples.push(trueHeading);
      if (samples.length > 12) samples.shift();
      let jitter = 0;
      if (samples.length >= 4) {
        let sum = 0;
        for (let i = 1; i < samples.length; i++) {
          sum += Math.abs(angleDifference(samples[i - 1], samples[i]));
        }
        jitter = sum / (samples.length - 1);
      }
      setQuality(computeQuality(iosAccuracy, jitter));

      // Low-pass filter (exponential moving average) with wrap-around handling.
      const prev = smoothedRef.current;
      let next: number;
      if (prev === null) {
        next = trueHeading;
      } else {
        const ALPHA = 0.15; // smaller = smoother / slower
        next = (prev + ALPHA * angleDifference(prev, trueHeading) + 360) % 360;
      }
      smoothedRef.current = next;
      setHeading(next);
    },
    [declination, noReadings]
  );

  const enableCompass = useCallback(async () => {
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    // iOS 13+ requires an explicit permission request triggered by a user gesture.
    try {
      if (DOE && typeof DOE.requestPermission === 'function') {
        const res = await DOE.requestPermission();
        if (res !== 'granted') {
          setNoReadings(true);
          setEnabled(true);
          return;
        }
      }
    } catch {
      setNoReadings(true);
      setEnabled(true);
      return;
    }

    // Prefer the absolute (true Earth-frame) event when available, fall back to relative.
    const eventName =
      'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(eventName, handleOrientation as EventListener, true);
    setEnabled(true);

    // If no sensor data arrives shortly, fall back to the static bearing display.
    timeoutRef.current = setTimeout(() => {
      if (!gotReadingRef.current) setNoReadings(true);
    }, 2500);
  }, [handleOrientation]);

  useEffect(() => {
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
      window.removeEventListener('deviceorientation', handleOrientation as EventListener, true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [handleOrientation]);

  const live = enabled && !noReadings && heading !== null;
  // Rotate the dial so its North marker tracks real (true) North.
  const dialRotation = live ? -(heading as number) : 0;
  // Relative angle of Qibla from where the phone currently points.
  const relative = live ? relativeQiblaAngle(bearing, heading as number) : bearing;
  const aligned = live && isAlignedToQibla(relative);
  const showCalibration = live && quality !== 'good';

  const qualityMeta =
    quality === 'good'
      ? { label: i18n.accuracyGood, dot: 'bg-primary', text: 'text-primary', Icon: CheckCircle2 }
      : quality === 'low'
        ? { label: i18n.accuracyLow, dot: 'bg-gold', text: 'text-gold', Icon: AlertTriangle }
        : { label: i18n.accuracyUnstable, dot: 'bg-destructive', text: 'text-destructive', Icon: AlertTriangle };

  return (
    <div className="rounded-2xl bg-gradient-to-br from-secondary/40 via-secondary/20 to-transparent backdrop-blur-xl border border-white/10 p-4 sm:p-6 shadow-xl">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-gold" />
          <h2 className="text-base sm:text-lg font-bold text-foreground">{i18n.qiblaTitle}</h2>
        </div>
        {/* Heading quality status indicator */}
        {live && (
          <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${qualityMeta.text}`}>
            <span className={`w-2 h-2 rounded-full ${qualityMeta.dot} ${quality === 'unstable' ? 'animate-pulse' : ''}`} />
            {qualityMeta.label}
          </span>
        )}
      </div>
      <p className="text-xs sm:text-sm text-muted-foreground mb-4">{i18n.qiblaDesc}</p>

      <div className="flex flex-col items-center">
        <div className="relative w-56 h-56 sm:w-64 sm:h-64">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-4 border-primary/30 bg-gradient-to-br from-secondary/60 to-background/80 shadow-inner" />

          {/* Rotating dial (cardinal markers) */}
          <div
            className="absolute inset-0 transition-transform duration-150 ease-out"
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

        {/* On-screen calibration tip when heading quality is low/unstable */}
        {showCalibration && (
          <div className="mt-4 w-full rounded-xl bg-gold/10 border border-gold/30 px-3 py-2.5 flex items-start gap-2">
            <RefreshCcw className="h-4 w-4 text-gold mt-0.5 flex-shrink-0 animate-pulse" />
            <p className="text-xs text-foreground/90 leading-snug">{i18n.calibrationTip}</p>
          </div>
        )}

        {/* Compass control / fallback note */}
        <div className="mt-4 w-full">
          {!supported || noReadings ? (
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
