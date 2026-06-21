import { useCallback, useEffect, useState } from 'react';
import { dateStrInTz, detectTimezone } from '@/lib/prayerTz';

// Aladhan calculation methods. 3 = Muslim World League (default for Kurdistan/Iraq).
export const CALC_METHODS = [
  { id: 3, key: 'mwl' },
  { id: 4, key: 'ummAlQura' },
  { id: 2, key: 'isna' },
  { id: 5, key: 'egypt' },
  { id: 1, key: 'karachi' },
] as const;

export type PrayerKey = 'Fajr' | 'Sunrise' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';
export const PRAYER_ORDER: PrayerKey[] = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

export interface PrayerLocation {
  latitude: number;
  longitude: number;
  label?: string;
  source: 'gps' | 'city' | 'cache';
}

export interface PrayerTimesData {
  timings: Record<PrayerKey, string>; // "HH:MM" 24h
  dateReadable: string;
  hijri: string;
  method: number;
}

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

export function usePrayerTimes(method: number) {
  const [location, setLocation] = useState<PrayerLocation | null>(() => loadCachedLocation());
  const [data, setData] = useState<PrayerTimesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchByCoords = useCallback(async (loc: PrayerLocation, m: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `https://api.aladhan.com/v1/timings/${todayStr()}?latitude=${loc.latitude}&longitude=${loc.longitude}&method=${m}`
      );
      if (!res.ok) throw new Error('network');
      const json = await res.json();
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
      setError('fetch');
    } finally {
      setLoading(false);
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

  // Fetch timings whenever location or method changes.
  useEffect(() => {
    if (location) fetchByCoords(location, method);
  }, [location, method, fetchByCoords]);

  // Refresh at midnight (new day -> new times).
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 30, 0);
    const ms = midnight.getTime() - now.getTime();
    const timer = setTimeout(() => {
      if (location) fetchByCoords(location, method);
    }, ms);
    return () => clearTimeout(timer);
  }, [location, method, fetchByCoords]);

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
