import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, CandlestickSeries, LineSeries, AreaSeries, Time } from 'lightweight-charts';
import { OHLCCandle, TIMEFRAMES, getDisplaySymbol, getSymbolFromPair } from '@/lib/krakenApi';
import { Skeleton } from '@/components/ui/skeleton';

interface CryptoChartProps {
  pair: string;
  candles: OHLCCandle[];
  isLoading: boolean;
  currentPrice: number;
  interval: number;
  onIntervalChange: (interval: number) => void;
}

export function CryptoChart({ pair, candles, isLoading, currentPrice, interval, onIntervalChange }: CryptoChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceLineRef = useRef<any>(null);
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');

  const symbol = getDisplaySymbol(getSymbolFromPair(pair));

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    const rect = container.getBoundingClientRect();
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0e17' },
        textColor: '#848e9c',
        fontSize: 12,
      },
      grid: {
        vertLines: { color: '#1a1e2e' },
        horzLines: { color: '#1a1e2e' },
      },
      crosshair: {
        vertLine: { color: '#4a5568', width: 1, style: 2 },
        horzLine: { color: '#4a5568', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: '#1a1e2e',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#1a1e2e',
        timeVisible: true,
        secondsVisible: false,
      },
      width: rect.width || 600,
      height: rect.height || 400,
    });

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(container);

    chartRef.current = chart;

    if (chartType === 'candlestick') {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: '#0ecb81',
        downColor: '#f6465d',
        borderUpColor: '#0ecb81',
        borderDownColor: '#f6465d',
        wickUpColor: '#0ecb81',
        wickDownColor: '#f6465d',
      });
      seriesRef.current = series;
    } else {
      const series = chart.addSeries(LineSeries, {
        color: '#2962ff',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      });
      seriesRef.current = series;
    }

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [chartType, pair]);

  // Update data
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;

    if (chartType === 'candlestick') {
      seriesRef.current.setData(candles.map(c => ({
        time: c.time as Time,
        open: c.open, high: c.high, low: c.low, close: c.close,
      })));
    } else {
      seriesRef.current.setData(candles.map(c => ({
        time: c.time as Time,
        value: c.close,
      })));
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles, chartType]);

  // Update price line separately
  useEffect(() => {
    if (!seriesRef.current || currentPrice <= 0) return;

    // Remove old price line
    if (priceLineRef.current) {
      try { seriesRef.current.removePriceLine(priceLineRef.current); } catch {}
    }

    priceLineRef.current = seriesRef.current.createPriceLine({
      price: currentPrice,
      color: '#f0b90b',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: `${symbol} $${currentPrice.toLocaleString()}`,
    });
  }, [currentPrice, symbol]);


  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[#1a1e2e]">
        <span className="text-lg font-bold text-white mr-2">{symbol}/USD</span>
        {currentPrice > 0 && (
          <span className="text-lg font-semibold text-[#f0b90b]">
            ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: currentPrice < 1 ? 6 : 2 })}
          </span>
        )}

        <div className="flex-1" />

        {/* Chart type toggle */}
        <div className="flex bg-[#1a1e2e] rounded-lg overflow-hidden">
          <button
            onClick={() => setChartType('candlestick')}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              chartType === 'candlestick' ? 'bg-[#2a2e3e] text-white' : 'text-[#848e9c] hover:text-white'
            }`}
          >
            Candles
          </button>
          <button
            onClick={() => setChartType('line')}
            className={`px-3 py-1 text-xs font-medium transition-colors ${
              chartType === 'line' ? 'bg-[#2a2e3e] text-white' : 'text-[#848e9c] hover:text-white'
            }`}
          >
            Line
          </button>
        </div>

        {/* Timeframe selector */}
        <div className="flex bg-[#1a1e2e] rounded-lg overflow-hidden">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.label}
              onClick={() => onIntervalChange(tf.interval)}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                interval === tf.interval ? 'bg-[#2a2e3e] text-[#f0b90b]' : 'text-[#848e9c] hover:text-white'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 relative min-h-[300px] md:min-h-[500px]">
        <div ref={chartContainerRef} className="absolute inset-0" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e17]/80 z-10">
            <div className="text-[#848e9c] text-sm">Loading chart data...</div>
          </div>
        )}
      </div>
    </div>
  );
}
