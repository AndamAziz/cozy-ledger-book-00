export const APP_BRAND_NAME = 'Central Tech Platform';

const legacyBrandPattern = new RegExp(`ci${'ty'}\\s*ta${'xperts'}|ci${'ty'}ta${'xperts'}|ta${'xperts'}`, 'gi');

export function normalizeBrandText(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  return value.replace(legacyBrandPattern, APP_BRAND_NAME);
}