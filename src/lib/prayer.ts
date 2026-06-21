// Pure constants & types for the Prayer Times feature.
//
// These intentionally live OUTSIDE the hook/component files. Mixing non-hook,
// non-component exports into a hook module (usePrayerTimes) breaks React Fast
// Refresh boundaries: Vite can no longer track the hook's signature, so on hot
// reload it preserves stale fiber state instead of remounting — which surfaces
// as "Should have a queue. This is likely a bug in React." Keeping this module
// component/hook-free makes every importer HMR-safe.

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
