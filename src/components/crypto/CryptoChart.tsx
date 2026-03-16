import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries, LineSeries, CandlestickData, LineData, Time } from 'lightweight-charts';
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
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null>(null);
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');

  const symbol = getDisplaySymbol(getSymbolFromPair(pair));

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
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
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });

    chartRef.current = chart;

    if (chartType === 'candlestick') {
      const series = chart.addCandlestickSeries({
        upColor: '#0ecb81',
        downColor: '#f6465d',
        borderUpColor: '#0ecb81',
        borderDownColor: '#f6465d',
        wickUpColor: '#0ecb81',
        wickDownColor: '#f6465d',
      });
      seriesRef.current = series;
    } else {
      const series = chart.addLineSeries({
        color: '#2962ff',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      });
      seriesRef.current = series;
    }

    // Resize handler
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [chartType, pair]);

  // Update data
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;

    if (chartType === 'candlestick') {
      const data: CandlestickData[] = candles.map(c => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      (seriesRef.current as ISeriesApi<'Candlestick'>).setData(data);
    } else {
      const data: LineData[] = candles.map(c => ({
        time: c.time as Time,
        value: c.close,
      }));
      (seriesRef.current as ISeriesApi<'Line'>).setData(data);
    }

    // Add price line
    if (currentPrice > 0) {
      seriesRef.current.createPriceLine({
        price: currentPrice,
        color: '#f0b90b',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `${symbol} $${currentPrice.toLocaleString()}`,
      });
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles, chartType, currentPrice, symbol]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-8 w-48 bg-[#1a1e2e]" />
        <Skeleton className="h-[400px] w-full bg-[#1a1e2e]" />
      </div>
    );
  }

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
      <div ref={chartContainerRef} className="flex-1 min-h-[300px] md:min-h-[500px]" />
    </div>
  );
}
