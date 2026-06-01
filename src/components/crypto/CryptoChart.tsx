import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, CandlestickSeries, LineSeries, AreaSeries, Time } from 'lightweight-charts';
import { OHLCCandle, TIMEFRAMES, getDisplaySymbol, getSymbolFromPair } from '@/lib/krakenApi';
import { calculateMA, calculateEMA, MA_PERIODS, MAType } from '@/lib/movingAverage';
import { useLanguage } from '@/contexts/LanguageContext';

interface CryptoChartProps {
  pair: string;
  candles: OHLCCandle[];
  isLoading: boolean;
  currentPrice: number;
  interval: number;
  onIntervalChange: (interval: number) => void;
}

export function CryptoChart({ pair, candles, isLoading, currentPrice, interval, onIntervalChange }: CryptoChartProps) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' ? en : ku);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maSeriesRefs = useRef<Record<number, any>>({});
  const [chartType, setChartType] = useState<'candlestick' | 'line' | 'area'>('candlestick');
  const [activeMAs, setActiveMAs] = useState<Set<number>>(new Set([7, 25]));
  const [maType, setMaType] = useState<MAType>('MA');

  const symbol = getDisplaySymbol(getSymbolFromPair(pair));

  const toggleMA = (period: number) => {
    setActiveMAs(prev => {
      const next = new Set(prev);
      if (next.has(period)) next.delete(period);
      else next.add(period);
      return next;
    });
  };

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
      maSeriesRefs.current = {};
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
    } else if (chartType === 'line') {
      const series = chart.addSeries(LineSeries, {
        color: '#2962ff',
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
      });
      seriesRef.current = series;
    } else {
      const isUp = candles.length >= 2 && candles[candles.length - 1].close >= candles[0].close;
      const lineColor = isUp ? '#0ecb81' : '#f6465d';
      const series = chart.addSeries(AreaSeries, {
        lineColor,
        lineWidth: 2,
        topColor: isUp ? 'rgba(14,203,129,0.3)' : 'rgba(246,70,93,0.3)',
        bottomColor: isUp ? 'rgba(14,203,129,0.02)' : 'rgba(246,70,93,0.02)',
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBackgroundColor: lineColor,
      });
      seriesRef.current = series;
    }

    // Add MA series
    for (const ma of MA_PERIODS) {
      if (activeMAs.has(ma.period)) {
        const maSeries = chart.addSeries(LineSeries, {
          color: ma.color,
          lineWidth: 1,
          crosshairMarkerVisible: false,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        maSeriesRefs.current[ma.period] = maSeries;
      }
    }

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      maSeriesRefs.current = {};
    };
  }, [chartType, pair, activeMAs, maType]);

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

    // Update MA data
    for (const ma of MA_PERIODS) {
      const maSeries = maSeriesRefs.current[ma.period];
      if (maSeries) {
        const maData = maType === 'EMA' ? calculateEMA(candles, ma.period) : calculateMA(candles, ma.period);
        maSeries.setData(maData.map(d => ({ time: d.time as Time, value: d.value })));
      }
    }

    chartRef.current?.timeScale().fitContent();
  }, [candles, chartType, activeMAs, maType]);

  // Update price line
  useEffect(() => {
    if (!seriesRef.current || currentPrice <= 0) return;

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

        {/* MA/EMA type toggle */}
        <div className="flex bg-[#1a1e2e] rounded-lg overflow-hidden">
          {(['MA', 'EMA'] as MAType[]).map(type => (
            <button
              key={type}
              onClick={() => setMaType(type)}
              className={`px-2 py-1 text-[10px] font-bold transition-colors ${
                maType === type ? 'bg-[#2a2e3e] text-white' : 'text-[#848e9c] hover:text-white'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* MA period toggles */}
        <div className="flex bg-[#1a1e2e] rounded-lg overflow-hidden">
          {MA_PERIODS.map(ma => (
            <button
              key={ma.period}
              onClick={() => toggleMA(ma.period)}
              className={`px-2 py-1 text-[10px] font-bold transition-colors ${
                activeMAs.has(ma.period) ? 'text-white' : 'text-[#848e9c] hover:text-white opacity-50'
              }`}
              style={{ color: activeMAs.has(ma.period) ? ma.color : undefined }}
            >
              {maType}{ma.label}
            </button>
          ))}
        </div>

        {/* Chart type toggle */}
        <div className="flex bg-[#1a1e2e] rounded-lg overflow-hidden">
          {(['candlestick', 'line', 'area'] as const).map(type => (
            <button
              key={type}
              onClick={() => setChartType(type)}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                chartType === type ? 'bg-[#2a2e3e] text-white' : 'text-[#848e9c] hover:text-white'
              }`}
            >
              {type === 'candlestick' ? bi('شمع', 'Candles') : type === 'line' ? bi('هێڵ', 'Line') : bi('ناوچە', 'Area')}
            </button>
          ))}
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
