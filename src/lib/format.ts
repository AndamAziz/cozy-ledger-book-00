export function formatNumber(num: number): string {
  return num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatCurrency(num: number): string {
  return `£${formatNumber(num)}`;
}
