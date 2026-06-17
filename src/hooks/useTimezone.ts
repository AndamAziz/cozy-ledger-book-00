import { useEffect, useState, useCallback } from 'react';

export type TzId = 'Europe/London' | 'Asia/Baghdad' | 'America/New_York' | 'UTC';

export interface TzOption {
  id: TzId;
  flag: string;
  /** Short label e.g. "London" */
  city: string;
  /** Hint shown next to the city, e.g. "BST/GMT" */
  hint: string;
}

export const TZ_OPTIONS: TzOption[] = [
  { id: 'Europe/London', flag: '🇬🇧', city: 'London', hint: 'BST/GMT' },
  { id: 'Asia/Baghdad', flag: '🇹🇯', city: 'Baghdad', hint: 'UTC+3' },
  { id: 'America/New_York', flag: '🇺🇸', city: 'New York', hint: 'EST/EDT' },
  { id: 'UTC', flag: '🌍', city: 'UTC', hint: 'UTC' },
];

const TZ_KEY = 'app_timezone';
const TZ_EVENT = 'app-timezone-change';
const DEFAULT_TZ: TzId = 'Europe/London';

export function getStoredTimezone(): TzId {
  try {
    const raw = localStorage.getItem(TZ_KEY) as TzId | null;
    if (raw && TZ_OPTIONS.some((o) => o.id === raw)) return raw;
  } catch { /* ignore */ }
  return DEFAULT_TZ;
}

/** Read + set the user's preferred timezone (persisted in localStorage, synced across hook instances). */
export function useTimezone() {
  const [tz, setTzState] = useState<TzId>(getStoredTimezone);

  useEffect(() => {
    const sync = () => setTzState(getStoredTimezone());
    window.addEventListener(TZ_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(TZ_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setTz = useCallback((next: TzId) => {
    try { localStorage.setItem(TZ_KEY, next); } catch { /* ignore */ }
    setTzState(next);
    window.dispatchEvent(new Event(TZ_EVENT));
  }, []);

  return { tz, setTz, options: TZ_OPTIONS };
}

/** Timezone abbreviation for a given date in a given zone, e.g. "BST", "EDT", "UTC". */
export function tzAbbr(date: Date, tz: TzId): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(date);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value;
    return name || tz;
  } catch {
    return tz;
  }
}

/** Format an ISO date string in the selected timezone, e.g. "Mon, Jun 16, 20:00 BST". */
export function formatInTimezone(iso: string | Date, tz: TzId, locale = 'en-GB'): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  const formatted = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${formatted} ${tzAbbr(d, tz)}`;
}

/** Format only the time-of-day in the selected timezone, e.g. "20:00 BST". */
export function formatTimeInTimezone(iso: string | Date, tz: TzId, locale = 'en-GB'): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  const formatted = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${formatted} ${tzAbbr(d, tz)}`;
}

/** Format only the day label in the selected timezone, e.g. "Monday, Jun 16". */
export function formatDayInTimezone(iso: string | Date, tz: TzId, locale = 'en-GB'): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(d);
}
