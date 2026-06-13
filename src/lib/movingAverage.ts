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

/**
 * Calculate Exponential Moving Average from close prices
 */
export function calculateEMA(
  data: { time: number; close: number }[],
  period: number
): { time: number; value: number }[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const result: { time: number; value: number }[] = [];

  // Seed with SMA of first `period` values
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i].close;
  let ema = sum / period;
  result.push({ time: data[period - 1].time, value: ema });

  for (let i = period; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k);
    result.push({ time: data[i].time, value: ema });
  }
  return result;
}

export type MAType = 'MA' | 'EMA';

export interface MAConfig {
  period: number;
  label: string;
  color: string;
}

export const MA_PERIODS: MAConfig[] = [
  { period: 9, label: '9', color: '#f0b90b' },
  { period: 21, label: '21', color: '#e040fb' },
  { period: 50, label: '50', color: '#3b82f6' },
];
