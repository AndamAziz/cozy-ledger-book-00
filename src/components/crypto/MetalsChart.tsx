import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, LineSeries, AreaSeries, CandlestickSeries, Time } from 'lightweight-charts';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { MetalCandle } from '@/hooks/useMetalsHistory';
import { calculateMA, calculateEMA, MA_PERIODS, MAType } from '@/lib/movingAverage';

interface MetalsChartProps {
  candles: MetalCandle[];
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
  accentColor: string;
  range: string;
  onRangeChange: (range: string) => void;
  currentPrice?: number;
  name?: string;
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

export function MetalsChart({ candles, isLoading, error, onRetry, accentColor, range, onRangeChange, currentPrice, name }: MetalsChartProps) {
  const { language } = useLanguage();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maSeriesRefs = useRef<Record<number, any>>({});
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [chartType, setChartType] = useState<'candles' | 'area' | 'line'>('candles');
  const [activeMAs, setActiveMAs] = useState<Set<number>>(new Set([7, 25]));
  const [maType, setMaType] = useState<MAType>('MA');

  // Bilingual helper
  const bi = (ku: string, en: string) => (language === 'en' ? en : ku);

  // Professional candlestick palette (Binance-style)
  const UP_COLOR = '#0ecb81';
  const DOWN_COLOR = '#f6465d';


  const isUp = candles.length >= 2 && candles[candles.length - 1].close >= candles[0].close;
  const lineColor = isUp ? '#0ecb81' : '#f6465d';

  const priceChange = candles.length >= 2 ? candles[candles.length - 1].close - candles[0].close : 0;
  const pctChange = candles.length >= 2 && candles[0].close > 0 ? (priceChange / candles[0].close) * 100 : 0;

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
      priceLineRef.current = null;
      maSeriesRefs.current = {};
    }

    const rect = container.getBoundingClientRect();
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0e17' },
        textColor: '#848e9c',
        fontSize: 11,
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
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: '#1a1e2e',
        timeVisible: range === '1d' || range === '5d',
        secondsVisible: false,
      },
      width: rect.width || 600,
      height: rect.height || 300,
    });

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    resizeObserver.observe(container);

    chartRef.current = chart;

    if (chartType === 'candles') {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: UP_COLOR,
        downColor: DOWN_COLOR,
        borderUpColor: UP_COLOR,
        borderDownColor: DOWN_COLOR,
        wickUpColor: UP_COLOR,
        wickDownColor: DOWN_COLOR,
        borderVisible: true,
        priceLineVisible: false,
      });
      seriesRef.current = series;
    } else if (chartType === 'area') {
      const series = chart.addSeries(AreaSeries, {
        lineColor: lineColor,
        lineWidth: 2,
        topColor: isUp ? 'rgba(14,203,129,0.3)' : 'rgba(246,70,93,0.3)',
        bottomColor: isUp ? 'rgba(14,203,129,0.02)' : 'rgba(246,70,93,0.02)',
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBackgroundColor: lineColor,
      });
      seriesRef.current = series;
    } else {
      const series = chart.addSeries(LineSeries, {
        color: accentColor,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
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
      priceLineRef.current = null;
      maSeriesRefs.current = {};
    };
  }, [chartType, range, isUp, activeMAs, maType]);

  // Update data
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;

    if (chartType === 'candles') {
      const data = candles.map(c => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      seriesRef.current.setData(data);
    } else {
      const data = candles.map(c => ({
        time: c.time as Time,
        value: c.close,
      }));
      seriesRef.current.setData(data);
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
  }, [candles, activeMAs, maType, chartType]);

  // Update price line
  useEffect(() => {
    if (!seriesRef.current || !currentPrice || currentPrice <= 0) return;

    if (priceLineRef.current) {
      try { seriesRef.current.removePriceLine(priceLineRef.current); } catch {}
    }

    priceLineRef.current = seriesRef.current.createPriceLine({
      price: currentPrice,
      color: accentColor,
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: `${name || ''} $${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    });
  }, [currentPrice, name, accentColor]);

  return (
    <div className="border-b border-[#1a1e2e]">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[#1a1e2e]">
        {/* Range selector */}
        <div className="flex bg-[#1a1e2e] rounded-lg overflow-hidden">
          {RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => onRangeChange(r.key)}
              className={`px-2 sm:px-2.5 py-1 text-[10px] sm:text-xs font-medium transition-colors active:scale-95 ${
                range === r.key ? 'text-black' : 'text-[#848e9c] hover:text-white'
              }`}
              style={range === r.key ? { backgroundColor: accentColor } : undefined}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Change indicator */}
        {candles.length >= 2 && (
          <span className={`text-[10px] sm:text-xs font-bold ${isUp ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
            {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{priceChange.toFixed(2)} ({isUp ? '+' : ''}{pctChange.toFixed(2)}%)
          </span>
        )}

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
          <button
            onClick={() => setChartType('candles')}
            className={`px-2 py-1 text-[10px] font-medium transition-colors ${
              chartType === 'candles' ? 'bg-[#2a2e3e] text-white' : 'text-[#848e9c] hover:text-white'
            }`}
          >
            {language === 'en' ? 'Candles' : 'شمع'}
          </button>
          <button
            onClick={() => setChartType('area')}
            className={`px-2 py-1 text-[10px] font-medium transition-colors ${
              chartType === 'area' ? 'bg-[#2a2e3e] text-white' : 'text-[#848e9c] hover:text-white'
            }`}
          >
            Area
          </button>
          <button
            onClick={() => setChartType('line')}
            className={`px-2 py-1 text-[10px] font-medium transition-colors ${
              chartType === 'line' ? 'bg-[#2a2e3e] text-white' : 'text-[#848e9c] hover:text-white'
            }`}
          >
            Line
          </button>
        </div>
      </div>


      {/* Chart */}
      <div className="relative h-[250px] sm:h-[320px]">
        <div ref={chartContainerRef} className="absolute inset-0" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e17]/80 z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-[#848e9c] border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] text-[#848e9c]">Loading chart...</span>
            </div>
          </div>
        )}
        {!isLoading && (error || candles.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e17]/90 z-10 px-6">
            <div className="flex flex-col items-center gap-3 text-center max-w-[260px]">
              <AlertTriangle className="w-7 h-7 text-[#f0b90b]" />
              <span className="text-xs font-medium text-white">
                {error || (language === 'en' ? 'No chart data available for this timeframe.' : 'هیچ داتایەکی چارت بۆ ئەم ماوەیە بەردەست نییە.')}
              </span>
              <span className="text-[10px] text-[#848e9c] leading-relaxed">
                {language === 'en'
                  ? 'Spot data may be briefly rate-limited. We never show futures prices instead — try again in a moment or pick another timeframe.'
                  : 'لەوانەیە داتای spot بۆ ماوەیەکی کورت سنووردار بێت. هەرگیز نرخی futures جێگرەوە ناکەین — تکایە دوای چەند چرکەیەک هەوڵبدەرەوە یان ماوەیەکی تر هەڵبژێرە.'}
              </span>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-black active:scale-95 transition-transform"
                  style={{ backgroundColor: accentColor }}
                >
                  <RefreshCw className="w-3 h-3" />
                  {language === 'en' ? 'Retry' : 'دووبارە'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
