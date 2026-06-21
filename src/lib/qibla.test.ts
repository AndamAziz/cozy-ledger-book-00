import { describe, it, expect } from 'vitest';
import {
  qiblaBearing,
  qiblaDistanceKm,
  compassPoint,
  magneticToTrue,
  angleDifference,
  relativeQiblaAngle,
  isAlignedToQibla,
  KAABA_LAT,
  KAABA_LNG,
} from './qibla';

describe('qiblaBearing (great-circle initial bearing to the Kaaba)', () => {
  it('returns a value normalised to 0–360 for any location', () => {
    for (const [lat, lng] of [[51.5, -0.12], [-33.86, 151.2], [40.7, -74], [35.6, 139.7]]) {
      const b = qiblaBearing(lat, lng);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });

  it('matches known reference bearings (within 0.1°)', () => {
    expect(qiblaBearing(51.5074, -0.1278)).toBeCloseTo(118.99, 1); // London
    expect(qiblaBearing(53.6458, -3.0103)).toBeCloseTo(117.77, 1); // Southport, UK
    expect(qiblaBearing(40.7128, -74.006)).toBeCloseTo(58.48, 1); // New York
    expect(qiblaBearing(36.19, 44.01)).toBeCloseTo(195.0, 1); // Erbil
  });

  it('is undefined-direction-safe at the Kaaba itself but stays finite', () => {
    const b = qiblaBearing(KAABA_LAT, KAABA_LNG);
    expect(Number.isFinite(b)).toBe(true);
  });
});

describe('qiblaDistanceKm', () => {
  it('is ~0 at the Kaaba', () => {
    expect(qiblaDistanceKm(KAABA_LAT, KAABA_LNG)).toBeLessThan(1);
  });
  it('matches a known great-circle distance (London ≈ 4800 km)', () => {
    expect(qiblaDistanceKm(51.5074, -0.1278)).toBeGreaterThan(4700);
    expect(qiblaDistanceKm(51.5074, -0.1278)).toBeLessThan(4900);
  });
});

describe('compassPoint', () => {
  it('maps bearings to 16-point labels', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(90)).toBe('E');
    expect(compassPoint(180)).toBe('S');
    expect(compassPoint(270)).toBe('W');
    expect(compassPoint(118.99)).toBe('ESE');
    expect(compassPoint(359)).toBe('N'); // wraps back to North
  });
});

describe('magneticToTrue (declination correction)', () => {
  it('adds positive (east) declination', () => {
    expect(magneticToTrue(100, 5)).toBe(105);
  });
  it('subtracts negative (west) declination', () => {
    expect(magneticToTrue(100, -5)).toBe(95);
  });
  it('wraps past 360', () => {
    expect(magneticToTrue(358, 5)).toBe(3);
  });
  it('wraps below 0', () => {
    expect(magneticToTrue(2, -5)).toBe(357);
  });
  it('is a no-op for zero declination', () => {
    expect(magneticToTrue(123.4, 0)).toBeCloseTo(123.4, 5);
  });
});

describe('angleDifference (shortest signed delta)', () => {
  it('is positive for a small clockwise move', () => {
    expect(angleDifference(0, 10)).toBe(10);
  });
  it('is negative for a small counter-clockwise move', () => {
    expect(angleDifference(10, 0)).toBe(-10);
  });
  it('takes the short way around the wrap point', () => {
    expect(angleDifference(350, 10)).toBe(20);
    expect(angleDifference(10, 350)).toBe(-20);
  });
  it('stays within [-180, 180)', () => {
    expect(Math.abs(angleDifference(0, 180))).toBe(180);
    expect(angleDifference(0, 181)).toBe(-179);
  });
});

describe('relativeQiblaAngle (arrow rotation sign)', () => {
  it('points straight ahead when the phone faces the Qibla', () => {
    expect(relativeQiblaAngle(118, 118)).toBe(0);
  });
  it('DECREASES when the phone turns clockwise (heading increases)', () => {
    const a = relativeQiblaAngle(100, 0);
    const b = relativeQiblaAngle(100, 30);
    expect(a).toBe(100);
    expect(b).toBe(70); // turned right 30° → needle swings left 30°
    expect(b).toBeLessThan(a);
  });
  it('INCREASES when the phone turns counter-clockwise (heading decreases)', () => {
    const a = relativeQiblaAngle(100, 30);
    const b = relativeQiblaAngle(100, 0);
    expect(b).toBeGreaterThan(a);
  });
  it('wraps correctly across North', () => {
    expect(relativeQiblaAngle(10, 350)).toBe(20);
    expect(relativeQiblaAngle(350, 10)).toBe(340);
  });
  it('is always normalised to 0–360', () => {
    for (let h = 0; h < 360; h += 37) {
      const r = relativeQiblaAngle(117.77, h);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(360);
    }
  });
});

describe('isAlignedToQibla', () => {
  it('is true within tolerance on both sides of straight-ahead', () => {
    expect(isAlignedToQibla(0)).toBe(true);
    expect(isAlignedToQibla(5)).toBe(true);
    expect(isAlignedToQibla(357)).toBe(true);
  });
  it('is false outside tolerance', () => {
    expect(isAlignedToQibla(10)).toBe(false);
    expect(isAlignedToQibla(180)).toBe(false);
  });
  it('respects a custom tolerance', () => {
    expect(isAlignedToQibla(15, 20)).toBe(true);
    expect(isAlignedToQibla(15, 10)).toBe(false);
  });
});
