const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatNumber(num: number): string {
  return num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatCurrency(num: number): string {
  return `£${formatNumber(num)}`;
}

/**
 * Format a day and monthKey into professional date format: "1-Jan-2026"
 * @param day - Day of the month (1-31)
 * @param monthKey - Month key in format "YYYY-MM" (e.g., "2026-01")
 * @returns Formatted date string like "1-Jan-2026"
 */
export function formatDate(day: number, monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const monthIndex = parseInt(month, 10) - 1;
  const monthAbbr = MONTH_ABBR[monthIndex] || month;
  return `${day}-${monthAbbr}-${year}`;
}

/**
 * Format current date to professional format: "23-Jan-2026"
 * @returns Formatted current date string
 */
export function formatCurrentDate(): string {
  const today = new Date();
  const day = today.getDate();
  const monthAbbr = MONTH_ABBR[today.getMonth()];
  const year = today.getFullYear();
  return `${day}-${monthAbbr}-${year}`;
}
