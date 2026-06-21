// Qibla direction utilities — great-circle (initial) bearing to the Kaaba.

// Kaaba coordinates (Masjid al-Haram, Mecca)
export const KAABA_LAT = 21.4225;
export const KAABA_LNG = 39.8262;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/**
 * Calculate the great-circle initial bearing (forward azimuth) from a given
 * location to the Kaaba, measured in degrees clockwise from true North (0–360).
 *
 * Uses the standard spherical forward-azimuth formula:
 *   θ = atan2( sinΔλ·cosφ2 , cosφ1·sinφ2 − sinφ1·cosφ2·cosΔλ )
 */
export function qiblaBearing(lat: number, lng: number): number {
  const φ1 = toRad(lat);
  const φ2 = toRad(KAABA_LAT);
  const Δλ = toRad(KAABA_LNG - lng);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360; // normalize to 0–360
}

/** Great-circle distance (km) to the Kaaba — used for an informational label. */
export function qiblaDistanceKm(lat: number, lng: number): number {
  const R = 6371; // mean Earth radius in km
  const φ1 = toRad(lat);
  const φ2 = toRad(KAABA_LAT);
  const Δφ = toRad(KAABA_LAT - lat);
  const Δλ = toRad(KAABA_LNG - lng);

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** 16-point compass label for a bearing in degrees. */
export function compassPoint(bearing: number): string {
  const points = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
  ];
  const idx = Math.round(bearing / 22.5) % 16;
  return points[idx];
}
