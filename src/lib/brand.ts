export const APP_BRAND_NAME = 'Central Tech Platform';

const OLD_BRAND_PATTERN = /city\s*taxperts|citytaxperts|taxperts/gi;

export function normalizeBrandText(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  return value.replace(OLD_BRAND_PATTERN, APP_BRAND_NAME);
}