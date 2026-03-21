import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { MetalCandle } from '@/hooks/useMetalsHistory';
import { Skeleton } from '@/components/ui/skeleton';

interface MetalsChartProps {
  candles: MetalCandle[];
  isLoading: boolean;
  accentColor: string;
  range: string;
  onRangeChange: (range: string) => void;
  currentPrice?: number;
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
  if (range === '1d') {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '5d') {
    return d.toLocaleDateString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  if (range === '1mo' || range === '3mo') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-[#0d1117] border border-[#1a1e2e] rounded-lg px-3 py-2 shadow-xl">
      <p className="text-[10px] text-[#848e9c] mb-1">{label}</p>
      <p className="text-sm font-bold text-white tabular-nums">
        ${d?.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
      {d?.high !== d?.low && (
        <div className="flex gap-3 mt-1 text-[10px]">
          <span className="text-[#0ecb81]">H: ${d?.high?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          <span className="text-[#f6465d]">L: ${d?.low?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      )}
    </div>
  );
}

export function MetalsChart({ candles, isLoading, accentColor, range, onRangeChange, currentPrice }: MetalsChartProps) {
  const data = useMemo(() => {
    return candles.map(c => ({
      time: c.time,
      label: formatTime(c.time, range),
      price: c.close,
      high: c.high,
      low: c.low,
    }));
  }, [candles, range]);

  const isUp = data.length >= 2 && data[data.length - 1].price >= data[0].price;
  const lineColor = isUp ? '#0ecb81' : '#f6465d';

  const [minPrice, maxPrice] = useMemo(() => {
    if (data.length === 0) return [0, 0];
    const prices = data.map(d => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const pad = (max - min) * 0.08 || 1;
    return [min - pad, max + pad];
  }, [data]);

  const priceChange = data.length >= 2 ? data[data.length - 1].price - data[0].price : 0;
  const pctChange = data.length >= 2 && data[0].price > 0 ? (priceChange / data[0].price) * 100 : 0;

  return (
    <div className="border-b border-[#1a1e2e]">
      {/* Range selector + stats */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-1">
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => onRangeChange(r.key)}
              className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all active:scale-95 ${
                range === r.key
                  ? 'text-black shadow-sm'
                  : 'text-[#848e9c] hover:text-white hover:bg-[#1a1e2e]'
              }`}
              style={range === r.key ? { backgroundColor: accentColor } : undefined}
            >
              {r.label}
            </button>
          ))}
        </div>
        {data.length >= 2 && (
          <div className="flex items-center gap-2 text-[10px]">
            <span className={`font-bold ${isUp ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
              {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{priceChange.toFixed(2)} ({isUp ? '+' : ''}{pctChange.toFixed(2)}%)
            </span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="h-[220px] sm:h-[280px] px-1">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-[#848e9c] border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] text-[#848e9c]">Loading chart...</span>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[#848e9c] text-xs">
            No history available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id={`metalGrad-${range}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: '#555' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                domain={[minPrice, maxPrice]}
                tick={{ fontSize: 9, fill: '#555' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(v < 10 ? 2 : 0)}`}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              {/* Current price reference line */}
              {currentPrice && currentPrice > 0 && (
                <ReferenceLine
                  y={currentPrice}
                  stroke={accentColor}
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{
                    value: `$${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    position: 'right',
                    fill: accentColor,
                    fontSize: 10,
                    fontWeight: 'bold',
                  }}
                />
              )}
              <Area
                type="monotone"
                dataKey="price"
                stroke={lineColor}
                strokeWidth={2}
                fill={`url(#metalGrad-${range})`}
                dot={false}
                activeDot={{ r: 4, fill: lineColor, stroke: '#0a0e17', strokeWidth: 2 }}
                animationDuration={500}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
