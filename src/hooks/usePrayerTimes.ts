import { useCallback, useEffect, useRef, useState } from 'react';
import { dateStrInTz, detectTimezone } from '@/lib/prayerTz';
import type { PrayerLocation, PrayerTimesData } from '@/lib/prayer';

// Re-export constants/types so existing importers keep working. These come from
// a pure module (no hooks/components) so this hook file stays a clean Fast
// Refresh boundary — see src/lib/prayer.ts for the rationale.
export { CALC_METHODS, PRAYER_ORDER } from '@/lib/prayer';
export type { PrayerKey, PrayerLocation, PrayerTimesData } from '@/lib/prayer';

const LOCATION_CACHE_KEY = 'prayer:location:v2';

function loadCachedLocation(): PrayerLocation | null {
  try {
    const raw = localStorage.getItem(LOCATION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
      return { ...parsed, source: 'cache' as const };
    }
  } catch { /* noop */ }
  return null;
}

function saveCachedLocation(loc: PrayerLocation) {
  try {
    localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(loc));
  } catch { /* noop */ }
}

export function usePrayerTimes(method: number, timezone?: string) {
  const [location, setLocation] = useState<PrayerLocation | null>(() => loadCachedLocation());
  const [data, setData] = useState<PrayerTimesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tz = timezone || detectTimezone();

  // Monotonic request id: only the latest in-flight request is allowed to
  // commit its result. This prevents a slow earlier response (e.g. after a
  // rapid method switch) from overwriting newer data with stale times.
  const reqIdRef = useRef(0);

  const fetchByCoords = useCallback(async (loc: PrayerLocation, m: number, zone: string) => {
    const myReqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      // Pin both the request date and the returned timings to the chosen zone so
      // the schedule is correct even when the device clock is in another zone.
      // `cache: 'no-store'` guarantees a fresh calculation for the selected method
      // (no browser/intermediate cache can serve a different method's result).
      const res = await fetch(
        `https://api.aladhan.com/v1/timings/${dateStrInTz(zone)}?latitude=${loc.latitude}&longitude=${loc.longitude}&method=${m}&timezonestring=${encodeURIComponent(zone)}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('network');
      const json = await res.json();
      // A newer request started after this one — discard this (stale) result.
      if (myReqId !== reqIdRef.current) return;
      const t = json.data.timings;
      const clean = (v: string) => v.split(' ')[0];
      setData({
        timings: {
          Fajr: clean(t.Fajr),
          Sunrise: clean(t.Sunrise),
          Dhuhr: clean(t.Dhuhr),
          Asr: clean(t.Asr),
          Maghrib: clean(t.Maghrib),
          Isha: clean(t.Isha),
        },
        dateReadable: json.data.date.readable,
        hijri: `${json.data.date.hijri.day} ${json.data.date.hijri.month.en} ${json.data.date.hijri.year}`,
        method: m,
      });
    } catch {
      if (myReqId === reqIdRef.current) setError('fetch');
    } finally {
      if (myReqId === reqIdRef.current) setLoading(false);
    }
  }, []);

  const requestGps = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setPermissionDenied(true);
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: PrayerLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          source: 'gps',
        };
        saveCachedLocation(loc);
        setPermissionDenied(false);
        setLocation(loc);
      },
      () => {
        setPermissionDenied(true);
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 600000 }
    );
  }, []);

  const setManualCity = useCallback(async (city: string, country: string, _m: number) => {
    setLoading(true);
    setError(null);
    try {
      // Geocode the city to real coordinates (Aladhan's city meta is unreliable
      // for Qibla/distance). Open-Meteo geocoding is free and key-less.
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=en&format=json`
      );
      if (!geoRes.ok) throw new Error('network');
      const geo = await geoRes.json();
      const results: Array<{ latitude: number; longitude: number; name: string; country?: string }> = geo.results || [];
      if (results.length === 0) throw new Error('notfound');
      // Prefer a result whose country matches the user's input, else first.
      const wanted = country.trim().toLowerCase();
      const match =
        results.find((r) => (r.country || '').toLowerCase().includes(wanted)) || results[0];
      const loc: PrayerLocation = {
        latitude: match.latitude,
        longitude: match.longitude,
        label: `${match.name}${match.country ? ', ' + match.country : ''}`,
        source: 'city',
      };
      saveCachedLocation(loc);
      setPermissionDenied(false);
      setLocation(loc);
    } catch {
      setError('city');
      setLoading(false);
    }
  }, []);

  // Auto-request GPS on first mount if no cached location.
  useEffect(() => {
    if (!location) requestGps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch timings whenever location, method, or timezone changes.
  useEffect(() => {
    if (location) fetchByCoords(location, method, tz);
  }, [location, method, tz, fetchByCoords]);

  // Refresh at midnight (new day -> new times).
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 30, 0);
    const ms = midnight.getTime() - now.getTime();
    const timer = setTimeout(() => {
      if (location) fetchByCoords(location, method, tz);
    }, ms);
    return () => clearTimeout(timer);
  }, [location, method, tz, fetchByCoords]);

  return {
    location,
    data,
    loading,
    permissionDenied,
    error,
    requestGps,
    setManualCity,
  };
}
