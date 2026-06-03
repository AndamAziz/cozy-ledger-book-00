import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, CandlestickSeries, LineSeries, AreaSeries, Time } from 'lightweight-charts';
import { OHLCCandle, TIMEFRAMES, getDisplaySymbol, getSymbolFromPair } from '@/lib/krakenApi';
import { calculateMA, calculateEMA, MA_PERIODS, MAType } from '@/lib/movingAverage';
import { computeChartPreset } from '@/lib/chartPreset';
import { computeIndicators, summarizeSignals, computeBuySellPct } from '@/lib/indicators';
import { TradeControls, TradeSide, TradePct } from '@/components/crypto/TradeControls';
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
  const tradeLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maSeriesRefs = useRef<Record<number, any>>({});
  // Tracks the current series identity so we only auto-fit the view when the
  // timeframe / symbol / chart type changes — never on live price ticks (which
  // would otherwise reset the user's manual zoom & pan).
  const lastFitKeyRef = useRef<string>('');
  // Remembers the user's pan/zoom (visible logical range) per symbol+timeframe
  // so it is restored when they switch back instead of being re-fit.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const savedViewsRef = useRef<Record<string, any>>({});
  const currentViewKeyRef = useRef<string>('');
  const restoringRef = useRef(false);
  const [chartType, setChartType] = useState<'candlestick' | 'line' | 'area'>('candlestick');
  const [activeMAs, setActiveMAs] = useState<Set<number>>(new Set([7, 25]));
  const [maType, setMaType] = useState<MAType>('MA');

  // Buy/Sell trade controls (identical logic to Metals).
  const [tradeSide, setTradeSide] = useState<TradeSide>(null);
  const [tradeAmount, setTradeAmount] = useState(0.001);
  const [tradePct, setTradePct] = useState<TradePct | null>(null);
  // Bumped whenever the chart series is recreated so the trade line redraws.
  const [seriesVersion, setSeriesVersion] = useState(0);

  const handleRefreshTrade = () => {
    const ind = computeIndicators(candles);
    const summary = summarizeSignals(ind, currentPrice);
    const { hasData, buyPct, sellPct } = computeBuySellPct(summary);
    setTradePct({ hasData, buyPct, sellPct });
  };

  // Auto layout: spacing computed from chart width + candle count + timeframe.
  const [autoFit, setAutoFit] = useState(true);
  const [containerWidth, setContainerWidth] = useState(600);

  // Manual override values (used only when autoFit is off).
  const [rightOffset, setRightOffset] = useState(12);
  const [barSpacing, setBarSpacing] = useState(8);
  const [minBarSpacing, setMinBarSpacing] = useState(4);
  const [scaleMarginTop, setScaleMarginTop] = useState(0.12);
  const [scaleMarginBottom, setScaleMarginBottom] = useState(0.12);

  const INTRADAY = interval <= 60;
  const preset = autoFit
    ? computeChartPreset(containerWidth, candles.length, INTRADAY)
    : { rightOffset, barSpacing, minBarSpacing, scaleMarginTop, scaleMarginBottom };

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
    // Fresh chart instance -> allow one auto-fit on the next data update.
    lastFitKeyRef.current = '';

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
        vertLines: { visible: false },
        horzLines: { color: 'rgba(132,142,156,0.08)', style: 0 },
      },
      crosshair: {
        vertLine: { color: '#4a5568', width: 1, style: 2, labelBackgroundColor: '#1a1e2e' },
        horzLine: { color: '#4a5568', width: 1, style: 2, labelBackgroundColor: '#1a1e2e' },
      },
      rightPriceScale: {
        borderColor: 'rgba(132,142,156,0.15)',
        scaleMargins: { top: preset.scaleMarginTop, bottom: preset.scaleMarginBottom },
        entireTextOnly: true,
        ticksVisible: false,
      },
      timeScale: {
        borderColor: 'rgba(132,142,156,0.15)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: preset.rightOffset,
        barSpacing: preset.barSpacing,
        minBarSpacing: preset.minBarSpacing,
        ticksVisible: false,
      },
      width: rect.width || 600,
      height: rect.height || 400,
    });

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
        setContainerWidth(width);
      }
    });
    resizeObserver.observe(container);

    chartRef.current = chart;

    // Persist the user's pan/zoom per symbol+timeframe as they interact.
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (restoringRef.current || !range || !currentViewKeyRef.current) return;
      savedViewsRef.current[currentViewKeyRef.current] = range;
    });

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

    // Reset stale price-line refs and notify the trade-line effect to redraw.
    priceLineRef.current = null;
    tradeLineRef.current = null;
    setSeriesVersion(v => v + 1);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      maSeriesRefs.current = {};
    };
  }, [chartType, pair, activeMAs, maType]);

  // Apply layout preset without recreating the chart. Recomputes whenever the
  // preset values, the selected timeframe, or the auto-fit mode change so the
  // Auto layout always matches the current candles + price scale.
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({
      rightPriceScale: { scaleMargins: { top: preset.scaleMarginTop, bottom: preset.scaleMarginBottom } },
      timeScale: { rightOffset: preset.rightOffset, barSpacing: preset.barSpacing, minBarSpacing: preset.minBarSpacing },
    });
    // Only auto-fit when there's no remembered view for this symbol+timeframe;
    // otherwise the saved pan/zoom is restored by the data effect.
    if (autoFit && !savedViewsRef.current[`${pair}-${interval}`]) {
      restoringRef.current = true;
      chartRef.current.timeScale().fitContent();
      requestAnimationFrame(() => { restoringRef.current = false; });
    }
  }, [preset.rightOffset, preset.barSpacing, preset.minBarSpacing, preset.scaleMarginTop, preset.scaleMarginBottom, interval, autoFit, pair]);

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

    // Track the active view key (symbol+timeframe) so live ticks save to it.
    const viewKey = `${pair}-${interval}`;
    currentViewKeyRef.current = viewKey;

    // Only adjust the visible range when switching symbol / timeframe / chart
    // type. Live price ticks keep the user's current zoom & pan untouched.
    const fitKey = `${pair}-${interval}-${chartType}`;
    if (lastFitKeyRef.current !== fitKey) {
      lastFitKeyRef.current = fitKey;
      const ts = chartRef.current?.timeScale();
      const saved = savedViewsRef.current[viewKey];
      restoringRef.current = true;
      if (saved) {
        try { ts?.setVisibleLogicalRange(saved); } catch { ts?.fitContent(); }
      } else {
        ts?.fitContent();
      }
      // Release the save-suppression after the range change settles.
      requestAnimationFrame(() => { restoringRef.current = false; });
    }
  }, [candles, chartType, activeMAs, maType, pair, interval]);

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

  const stepper = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    min: number,
    max: number,
    step: number,
    displayFn?: (v: number) => string
  ) => (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="text-[10px] text-[#848e9c]">{label}</span>
      <button
        onClick={() => onChange(Math.max(min, +(value - step).toFixed(3)))}
        className="w-5 h-5 flex items-center justify-center rounded bg-white/5 text-[10px] text-[#848e9c] hover:bg-white/10 hover:text-white active:scale-95 transition-colors"
      >−</button>
      <span className="text-[10px] font-bold text-white w-7 text-center tabular-nums">{displayFn ? displayFn(value) : value}</span>
      <button
        onClick={() => onChange(Math.min(max, +(value + step).toFixed(3)))}
        className="w-5 h-5 flex items-center justify-center rounded bg-white/5 text-[10px] text-[#848e9c] hover:bg-white/10 hover:text-white active:scale-95 transition-colors"
      >+</button>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-white/5">
        {/* Symbol + price */}
        <div className="flex items-baseline gap-2 px-3 pt-3 pb-2">
          <span className="text-lg sm:text-xl font-bold tracking-tight text-white">{symbol}/USD</span>
          {currentPrice > 0 && (
            <span className="text-lg sm:text-xl font-bold text-[#f0b90b] tracking-tight truncate">
              ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: currentPrice < 1 ? 6 : 2 })}
            </span>
          )}
        </div>

        {/* Timeframes row (underline active) */}
        <div className="flex items-center gap-4 px-3 py-2.5 overflow-x-auto scrollbar-thin border-y border-white/5">
          {TIMEFRAMES.map(tf => {
            const active = interval === tf.interval;
            return (
              <button
                key={tf.label}
                onClick={() => onIntervalChange(tf.interval)}
                className={`relative shrink-0 text-[11px] sm:text-xs font-bold whitespace-nowrap pb-1 transition-colors active:scale-95 ${
                  active ? 'text-[#f0b90b]' : 'text-[#848e9c] hover:text-white'
                }`}
              >
                {tf.label}
                {active && (
                  <span className="absolute -bottom-[11px] left-0 w-full h-[2px] rounded-full bg-[#f0b90b]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Indicators + chart type strip (single scrollable row of chips) */}
        <div className="flex items-center gap-2 px-3 py-2.5 overflow-x-auto scrollbar-thin bg-[#090c11]">
          {/* MA period chips */}
          {MA_PERIODS.map(ma => {
            const active = activeMAs.has(ma.period);
            return (
              <button
                key={ma.period}
                onClick={() => toggleMA(ma.period)}
                className={`shrink-0 px-2.5 py-1 text-[10px] sm:text-xs font-bold rounded-md border transition-colors ${
                  active ? '' : 'text-[#848e9c] border-white/5 hover:text-white'
                }`}
                style={active ? { color: ma.color, borderColor: `${ma.color}55`, backgroundColor: `${ma.color}1a` } : undefined}
              >
                {maType}{ma.label}
              </button>
            );
          })}

          {/* MA/EMA type */}
          {(['MA', 'EMA'] as MAType[]).map(type => (
            <button
              key={type}
              onClick={() => setMaType(type)}
              className={`shrink-0 px-2.5 py-1 text-[10px] sm:text-xs font-bold rounded-md border transition-colors ${
                maType === type ? 'bg-[#1a1e2e] text-white border-white/10' : 'text-[#848e9c] border-white/5 hover:text-white'
              }`}
            >
              {type}
            </button>
          ))}

          <div className="w-px h-4 bg-white/10 mx-1 self-center shrink-0" />

          {/* Chart type */}
          {([['candlestick', bi('شمع', 'Candles')], ['area', bi('ناوچە', 'Area')], ['line', bi('هێڵ', 'Line')]] as const).map(([type, label]) => (
            <button
              key={type}
              onClick={() => setChartType(type as 'candlestick' | 'line' | 'area')}
              className={`shrink-0 px-2.5 py-1 text-[10px] sm:text-xs font-bold rounded-md border transition-colors ${
                chartType === type ? 'bg-[#2a2e3e] text-white border-white/10' : 'text-[#848e9c] border-white/5 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}

          <div className="w-px h-4 bg-white/10 mx-1 self-center shrink-0" />

          {/* Auto-fit toggle */}
          <button
            onClick={() => setAutoFit(v => !v)}
            className={`shrink-0 px-2.5 py-1 text-[10px] sm:text-xs font-bold rounded-md border transition-colors ${
              autoFit ? 'bg-[#f0b90b1a] text-[#f0b90b] border-[#f0b90b55]' : 'text-[#848e9c] border-white/5 hover:text-white'
            }`}
          >
            {bi('خۆکار', 'Auto')}
          </button>

          {/* Manual spacing controls (only when auto is off) */}
          {!autoFit && (
            <>
              {stepper('→', rightOffset, setRightOffset, 0, 40, 1)}
              {stepper('⇄', barSpacing, setBarSpacing, 2, 24, 1)}
              {stepper('⇄ₘ', minBarSpacing, setMinBarSpacing, 1, 12, 1)}
              {stepper('↑', scaleMarginTop, v => setScaleMarginTop(v), 0, 0.4, 0.02, v => v.toFixed(2))}
              {stepper('↓', scaleMarginBottom, v => setScaleMarginBottom(v), 0, 0.4, 0.02, v => v.toFixed(2))}
            </>
          )}
          <button
            onClick={() => {
              delete savedViewsRef.current[`${pair}-${interval}`];
              chartRef.current?.timeScale().fitContent();
            }}
            className="shrink-0 px-2.5 py-1 text-[10px] sm:text-xs font-bold rounded-md border text-[#848e9c] border-white/5 hover:text-white hover:bg-white/5 active:scale-95 transition-colors"
          >
            {bi('ڕێستکردنی بینین', 'Reset View')}
          </button>
        </div>
      </div>


      {/* Chart */}
      <div className="flex-1 relative min-h-[300px] md:min-h-[500px]">
        <div ref={chartContainerRef} className="absolute inset-0" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e17]/80 z-10">
            <div className="text-[#848e9c] text-sm">{bi('بارکردنی داتای چارت...', 'Loading chart data...')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
