import { Currency } from '@/types/finance';

export const CURRENCIES: Currency[] = ['GBP', 'USD', 'IQD', 'EUR'];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  GBP: '£',
  USD: '$',
  IQD: 'د.ع',
  EUR: '€',
};

export const CURRENCY_LABELS: Record<Currency, string> = {
  GBP: 'GBP £',
  USD: 'USD $',
  IQD: 'IQD د.ع',
  EUR: 'EUR €',
};

export function emptyTotals(): Record<Currency, number> {
  return { GBP: 0, USD: 0, IQD: 0, EUR: 0 };
}

/** Format a numeric value with the given currency symbol. */
export function formatCurrencyBy(value: number | undefined | null, currency: Currency): string {
  const num = typeof value === 'number' && !isNaN(value) ? value : 0;
  const formatted = num.toLocaleString('en-GB', {
    minimumFractionDigits: currency === 'IQD' ? 0 : 2,
    maximumFractionDigits: currency === 'IQD' ? 0 : 2,
  });
  if (currency === 'IQD') return `${formatted} ${CURRENCY_SYMBOLS.IQD}`;
  return `${CURRENCY_SYMBOLS[currency]}${formatted}`;
}

/** Return only the currencies that carry a non-zero total, preserving canonical order. */
export function nonZeroCurrencies(totals: Record<Currency, number>): Currency[] {
  return CURRENCIES.filter((c) => Math.abs(totals[c]) > 0.0001);
}

/** Build display lines for a per-currency totals map. Always shows GBP if all are zero. */
export function totalsToLines(totals: Record<Currency, number>): string[] {
  const active = nonZeroCurrencies(totals);
  const list = active.length ? active : (['GBP'] as Currency[]);
  return list.map((c) => formatCurrencyBy(totals[c], c));
}
