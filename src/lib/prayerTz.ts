// Time-zone helpers for Prayer Times. Prayer timings returned by the Aladhan API
// are local to the requested coordinates; the device clock used for the
// countdown may live in a different zone (e.g. travelling, VPN, or a manually
// entered city). These helpers let the UI pin a specific zone with an
// automatic-detection fallback.

export const PRAYER_TZ_KEY = 'prayer:timezone:v1';

/** Sentinel meaning "use the device/browser detected zone". */
export const AUTO_TZ = 'auto';

/** Detect the browser/device IANA time zone, falling back to UTC. */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Resolve a stored preference ('auto' or an IANA id) to a concrete IANA zone. */
export function resolveTimezone(stored: string): string {
  return !stored || stored === AUTO_TZ ? detectTimezone() : stored;
}

/** Read the stored preference ('auto' by default). */
export function getStoredPrayerTz(): string {
  try {
    return localStorage.getItem(PRAYER_TZ_KEY) || AUTO_TZ;
  } catch {
    return AUTO_TZ;
  }
}

export function setStoredPrayerTz(value: string): void {
  try {
    localStorage.setItem(PRAYER_TZ_KEY, value);
  } catch {
    /* noop */
  }
}

/** Full IANA zone list when supported, otherwise a curated fallback. */
export function listTimezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  try {
    if (typeof intl.supportedValuesOf === 'function') {
      const list = intl.supportedValuesOf('timeZone');
      if (Array.isArray(list) && list.length) return list;
    }
  } catch {
    /* noop */
  }
  return [
    'UTC',
    'Europe/London',
    'Europe/Istanbul',
    'Europe/Berlin',
    'Europe/Paris',
    'Asia/Baghdad',
    'Asia/Tehran',
    'Asia/Riyadh',
    'Asia/Dubai',
    'Asia/Karachi',
    'Asia/Istanbul',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
  ];
}

/** Minutes-since-midnight (including the seconds fraction) for `date` in `tz`. */
export function nowMinutesInTz(tz: string, date: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
    let h = get('hour');
    if (h === 24) h = 0; // some engines emit "24" at midnight
    return h * 60 + get('minute') + get('second') / 60;
  } catch {
    return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  }
}

/** Today's date as DD-MM-YYYY in the given zone (Aladhan's expected format). */
export function dateStrInTz(tz: string, date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('day')}-${get('month')}-${get('year')}`;
  } catch {
    return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
  }
}

/** Short, human label for a zone, e.g. "Europe/London → London (GMT+1)". */
export function tzShortLabel(tz: string, date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(date);
    const abbr = parts.find((p) => p.type === 'timeZoneName')?.value;
    const city = tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
    return abbr ? `${city} (${abbr})` : city;
  } catch {
    return tz;
  }
}
