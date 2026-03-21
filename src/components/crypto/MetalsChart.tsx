import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { MetalCandle } from '@/hooks/useMetalsHistory';
import { Skeleton } from '@/components/ui/skeleton';

interface MetalsChartProps {
  candles: MetalCandle[];
  isLoading: boolean;
  accentColor: string;
  range: string;
  onRangeChange: (range: string) => void;
}

const RANGES = [
  { key: '1d', label: '1D' },
  { key: '5d', label: '5D' },
  { key: '1mo', label: '1M' },
  { key: '3mo', label: '3M' },
  { key: '6mo', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: '5y', label: '5Y' },
];

function formatTime(ts: number, range: string) {
  const d = new Date(ts * 1000);
  if (range === '1d' || range === '5d') {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '1mo' || range === '3mo') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

export function MetalsChart({ candles, isLoading, accentColor, range, onRangeChange }: MetalsChartProps) {
  const data = useMemo(() => {
    return candles.map(c => ({
      time: c.time,
      label: formatTime(c.time, range),
      price: c.close,
    }));
  }, [candles, range]);

  const isUp = data.length >= 2 && data[data.length - 1].price >= data[0].price;
  const lineColor = isUp ? '#0ecb81' : '#f6465d';

  const [minPrice, maxPrice] = useMemo(() => {
    if (data.length === 0) return [0, 0];
    const prices = data.map(d => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const pad = (max - min) * 0.05 || 1;
    return [min - pad, max + pad];
  }, [data]);

  return (
    <div className="border-b border-[#1a1e2e]">
      {/* Range selector */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-2">
        <span className="text-[10px] text-[#848e9c] mr-2">📈 Price History</span>
        {RANGES.map(r => (
          <button
            key={r.key}
            onClick={() => onRangeChange(r.key)}
            className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
              range === r.key
                ? 'text-black'
                : 'text-[#848e9c] hover:text-white hover:bg-[#1a1e2e]'
            }`}
            style={range === r.key ? { backgroundColor: accentColor } : undefined}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-[200px] sm:h-[260px] px-2">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Skeleton className="h-[160px] w-full bg-[#1a1e2e] rounded-lg" />
          </div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[#848e9c] text-xs">
            No history available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id={`grad-${accentColor}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={lineColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: '#848e9c' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                domain={[minPrice, maxPrice]}
                tick={{ fontSize: 9, fill: '#848e9c' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: v < 10 ? 2 : 0 })}`}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0d1117',
                  border: '1px solid #1a1e2e',
                  borderRadius: '8px',
                  fontSize: '11px',
                  color: '#fff',
                }}
                formatter={(value: number) => [`$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Price']}
                labelStyle={{ color: '#848e9c', fontSize: '10px' }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={lineColor}
                strokeWidth={1.5}
                fill={`url(#grad-${accentColor})`}
                dot={false}
                activeDot={{ r: 3, fill: lineColor, stroke: '#0a0e17', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
