/**
 * Calculate Simple Moving Average from close prices
 */
export function calculateMA(
  data: { time: number; close: number }[],
  period: number
): { time: number; value: number }[] {
  const result: { time: number; value: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

export const MA_PERIODS = [
  { period: 7, label: 'MA7', color: '#f0b90b' },
  { period: 25, label: 'MA25', color: '#e040fb' },
] as const;
