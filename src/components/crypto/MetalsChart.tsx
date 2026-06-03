import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, LineSeries, AreaSeries, CandlestickSeries, Time } from 'lightweight-charts';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { MetalCandle } from '@/hooks/useMetalsHistory';
import { calculateMA, calculateEMA, MA_PERIODS, MAType } from '@/lib/movingAverage';
import { computeChartPreset } from '@/lib/chartPreset';
import { computeIndicators, summarizeSignals, computeBuySellPct } from '@/lib/indicators';
import { TradeControls, TradeSide, TradePct } from '@/components/crypto/TradeControls';
import { useDemoAccount } from '@/contexts/DemoAccountContext';
import { toast } from '@/hooks/use-toast';
import type { OHLCCandle } from '@/lib/krakenApi';

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
  { key: '1min', label: '1m' },
  { key: '5min', label: '5m' },
  { key: '15min', label: '15m' },
  { key: '1d', label: '1D' },
  { key: '5d', label: '5D' },
  { key: '1mo', label: '1M' },
  { key: '3mo', label: '3M' },
  { key: '1y', label: '1Y' },
];

const INTRADAY_RANGES = new Set(['1min', '5min', '15min', '1d', '5d']);

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
  // Tracks the current series identity so we only auto-fit when the timeframe /
  // metal / chart type changes — never on live price ticks (which would reset
  // the user's manual zoom & pan).
  const lastFitKeyRef = useRef<string>('');
  // Remembers the user's pan/zoom (visible logical range) per metal+timeframe
  // so it is restored when they switch back instead of being re-fit.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const savedViewsRef = useRef<Record<string, any>>({});
  const currentViewKeyRef = useRef<string>('');
  const restoringRef = useRef(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [chartType, setChartType] = useState<'candles' | 'area' | 'line'>('candles');
  const [activeMAs, setActiveMAs] = useState<Set<number>>(new Set([7, 25]));
  const [maType, setMaType] = useState<MAType>('MA');

  // Shared demo account + the single open position (persists across navigation).
  const { balance, renew, position, openOrAdd, updatePrice, setTpSl, closePosition } = useDemoAccount();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tradeLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tpLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slLineRef = useRef<any>(null);
  const [tradeAmount, setTradeAmount] = useState(0.001);
  const [tradePct, setTradePct] = useState<TradePct | null>(null);
  // Bumped whenever the chart series is recreated so the trade line redraws.
  const [seriesVersion, setSeriesVersion] = useState(0);

  // Unique key for this metal so its position is isolated from other assets.
  const mySymbol = `metal:${name || ''}`;

  const fmtQty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });

  const livePrice = () => (currentPrice && currentPrice > 0
    ? currentPrice
    : (candles.length ? candles[candles.length - 1].close : 0));

  // The position only counts for THIS chart when it belongs to this metal.
  const myPos = position && position.symbol === mySymbol ? position : null;
  const tradeSide: TradeSide = myPos?.side ?? null;
  const entryPrice = myPos?.entryPrice ?? null;
  const positionQty = myPos?.qty ?? 0;
  const takeProfit = myPos?.takeProfit ?? null;
  const stopLoss = myPos?.stopLoss ?? null;

  const handleRefreshTrade = () => {
    const ohlc: OHLCCandle[] = candles.map(c => ({
      time: c.time, open: c.close, high: c.high, low: c.low, close: c.close, volume: 0,
    }));
    const ind = computeIndicators(ohlc);
    const summary = summarizeSignals(ind, livePrice());
    const { hasData, buyPct, sellPct } = computeBuySellPct(summary);
    setTradePct({ hasData, buyPct, sellPct });
  };

  // Open or ADD to a position (stacking, averaged). A position on another asset
  // must be closed first.
  const handleAdd = (side: 'buy' | 'sell') => {
    if (balance <= 0) return;
    const price = livePrice();
    if (price <= 0) return;
    if (otherPositionLabel) return;
    if (tradeSide && tradeSide !== side) return;
    openOrAdd({ symbol: mySymbol, label: name || bi('کانزا', 'Metal'), side, price, amount: tradeAmount });
  };

  // Close the whole position and realise its P/L (handled in context).
  const handleClose = () => closePosition();

  // Reset only the analysis percentages when switching metals; the open
  // position itself persists in the shared context until closed manually.
  useEffect(() => {
    setTradePct(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);





  // Auto layout: spacing computed from chart width + candle count + timeframe.
  const [autoFit, setAutoFit] = useState(true);
  const [containerWidth, setContainerWidth] = useState(600);

  // Manual override values (used only when autoFit is off).
  const [rightOffset, setRightOffset] = useState(12);
  const [barSpacing, setBarSpacing] = useState(8);
  const [minBarSpacing, setMinBarSpacing] = useState(4);
  const [scaleMarginTop, setScaleMarginTop] = useState(0.12);
  const [scaleMarginBottom, setScaleMarginBottom] = useState(0.12);

  const preset = autoFit
    ? computeChartPreset(containerWidth, candles.length, INTRADAY_RANGES.has(range))
    : { rightOffset, barSpacing, minBarSpacing, scaleMarginTop, scaleMarginBottom };


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
    // Fresh chart instance -> allow one auto-fit on the next data update.
    lastFitKeyRef.current = '';

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
        timeVisible: INTRADAY_RANGES.has(range),
        secondsVisible: false,
        rightOffset: preset.rightOffset,
        barSpacing: preset.barSpacing,
        minBarSpacing: preset.minBarSpacing,
        ticksVisible: false,
      },
      width: rect.width || 600,
      height: rect.height || 300,
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

    // Persist the user's pan/zoom per metal+timeframe as they interact.
    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (restoringRef.current || !range || !currentViewKeyRef.current) return;
      savedViewsRef.current[currentViewKeyRef.current] = range;
    });

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
        lastValueVisible: false,
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
        priceLineVisible: false,
        lastValueVisible: false,
      });
      seriesRef.current = series;
    } else {
      const series = chart.addSeries(LineSeries, {
        color: accentColor,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        priceLineVisible: false,
        lastValueVisible: false,
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

    // Candle tooltip on crosshair
    const handleCrosshairMove = (param: any) => {
      if (!tooltipRef.current || !chartContainerRef.current) return;
      if (!param.point || param.point.x < 0 || param.point.y < 0 || !param.time) {
        tooltipRef.current.style.display = 'none';
        return;
      }
      const candle = param.seriesData?.get(seriesRef.current);
      if (!candle || typeof candle !== 'object' || !('open' in candle)) {
        tooltipRef.current.style.display = 'none';
        return;
      }
      const isUp = candle.close >= candle.open;
      const color = isUp ? UP_COLOR : DOWN_COLOR;
      const dirLabel = isUp ? bi('بەرزبوونەوە', 'Bullish') : bi('دابەزین', 'Bearish');
      const timeNum = typeof param.time === 'number' ? param.time : 0;
      const dateObj = new Date(timeNum * 1000);
      // Use the browser's local timezone, force Latin (English) numerals globally
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const locale = language === 'en' ? 'en-GB-u-nu-latn' : 'ku-Arab-u-nu-latn';
      // Format the tooltip date/time appropriately for each range
      let dateOpts: Intl.DateTimeFormatOptions;
      if (range === '1min' || range === '5min' || range === '15min') {
        // Minute timeframes: emphasise hour:minute
        dateOpts = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false };
      } else if (range === '1d') {
        // Intraday: emphasise time of day
        dateOpts = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false };
      } else if (range === '5d') {
        // Few days: weekday + time
        dateOpts = { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false };
      } else if (range === '1mo' || range === '3mo') {
        // Weeks/months: full day date, no time
        dateOpts = { day: 'numeric', month: 'short', year: 'numeric' };
      } else {
        // 1Y+: month + year
        dateOpts = { month: 'short', year: 'numeric' };
      }
      const dateStr = dateObj.toLocaleString(locale, { ...dateOpts, timeZone: tz });
      const fmt = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      tooltipRef.current.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;direction:rtl;">
          <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>
          <span style="font-weight:700;font-size:12px;color:${color};">${dirLabel}</span>
        </div>
        <div style="font-size:10px;color:#848e9c;margin-bottom:6px;direction:rtl;">${dateStr}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 10px;font-size:11px;direction:rtl;">
          <div><span style="color:#848e9c;">${bi('کردنەوە', 'O')}:</span> <span style="color:#e0e0e0;font-weight:600;">${fmt(candle.open)}</span></div>
          <div><span style="color:#848e9c;">${bi('بەرزترین', 'H')}:</span> <span style="color:#e0e0e0;font-weight:600;">${fmt(candle.high)}</span></div>
          <div><span style="color:#848e9c;">${bi('نزمترین', 'L')}:</span> <span style="color:#e0e0e0;font-weight:600;">${fmt(candle.low)}</span></div>
          <div><span style="color:#848e9c;">${bi('داخستن', 'C')}:</span> <span style="color:#e0e0e0;font-weight:600;">${fmt(candle.close)}</span></div>
        </div>
      `;

      const rect = chartContainerRef.current.getBoundingClientRect();
      const tooltipWidth = 210;
      const tooltipHeight = 100;
      let left = param.point.x + 12;
      let top = param.point.y + 12;
      if (left + tooltipWidth > rect.width) left = param.point.x - tooltipWidth - 12;
      if (top + tooltipHeight > rect.height) top = param.point.y - tooltipHeight - 12;
      if (left < 0) left = 4;
      if (top < 0) top = 4;

      tooltipRef.current.style.left = `${left}px`;
      tooltipRef.current.style.top = `${top}px`;
      tooltipRef.current.style.display = 'block';
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    // Reset stale trade-line ref and notify the trade-line effect to redraw.
    tradeLineRef.current = null;
    setSeriesVersion(v => v + 1);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLineRef.current = null;
      maSeriesRefs.current = {};
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    };
  }, [chartType, range, isUp, activeMAs, maType, language]);

  // Apply layout preset without recreating the chart. Recomputes whenever the
  // preset values, the selected range, or the auto-fit mode change so the Auto
  // layout always matches the current candles + price scale.
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({
      rightPriceScale: { scaleMargins: { top: preset.scaleMarginTop, bottom: preset.scaleMarginBottom } },
      timeScale: { rightOffset: preset.rightOffset, barSpacing: preset.barSpacing, minBarSpacing: preset.minBarSpacing },
    });
    // Only auto-fit when there's no remembered view for this metal+timeframe;
    // otherwise the saved pan/zoom is restored by the data effect.
    if (autoFit && !savedViewsRef.current[`${name || ''}-${range}`]) {
      restoringRef.current = true;
      chartRef.current.timeScale().fitContent();
      requestAnimationFrame(() => { restoringRef.current = false; });
    }
  }, [preset.rightOffset, preset.barSpacing, preset.minBarSpacing, preset.scaleMarginTop, preset.scaleMarginBottom, range, autoFit, name]);

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

    // Track the active view key (metal+timeframe) so live ticks save to it.
    const viewKey = `${name || ''}-${range}`;
    currentViewKeyRef.current = viewKey;

    // Only adjust the visible range when switching metal / timeframe / chart
    // type. Live price ticks keep the user's current zoom & pan untouched.
    const fitKey = `${name || ''}-${range}-${chartType}`;
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
      requestAnimationFrame(() => { restoringRef.current = false; });
    }
  }, [candles, activeMAs, maType, chartType, name, range]);

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

  // Draw the average-entry line for the open position (green buy / red sell).
  useEffect(() => {
    if (!seriesRef.current) return;

    if (tradeLineRef.current) {
      try { seriesRef.current.removePriceLine(tradeLineRef.current); } catch { /* ignore */ }
      tradeLineRef.current = null;
    }

    if (!tradeSide || !entryPrice || entryPrice <= 0 || positionQty <= 0) return;

    const isBuy = tradeSide === 'buy';
    tradeLineRef.current = seriesRef.current.createPriceLine({
      price: entryPrice,
      color: isBuy ? '#0ecb81' : '#f6465d',
      lineWidth: 2,
      lineStyle: 0,
      axisLabelVisible: true,
      title: `${isBuy ? bi('کڕین', 'Buy') : bi('فرۆشتن', 'Sell')} ${fmtQty(positionQty)}`,
    });
  }, [tradeSide, entryPrice, positionQty, seriesVersion, language]);


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
    <div className="border-b border-[#1a1e2e]">
      {/* Buy / Refresh / Sell controls above the chart */}
      <TradeControls
        activeSide={tradeSide}
        amount={tradeAmount}
        pct={tradePct}
        entryPrice={entryPrice}
        positionQty={positionQty}
        currentPrice={livePrice()}
        timeframeLabel={RANGES.find(r => r.key === range)?.label}
        balance={balance}
        onRenew={renew}
        onBuy={() => handleAdd('buy')}
        onSell={() => handleAdd('sell')}
        onClose={handleClose}
        onRefresh={handleRefreshTrade}
        onAmountChange={setTradeAmount}
      />

      {/* Controls */}
      <div className="border-b border-white/5">
        {/* Timeframes row (underline active) */}
        <div className="flex items-center gap-4 px-3 py-2.5 overflow-x-auto scrollbar-thin border-b border-white/5">
          {RANGES.map(r => {
            const active = range === r.key;
            return (
              <button
                key={r.key}
                onClick={() => onRangeChange(r.key)}
                className={`relative shrink-0 text-[11px] sm:text-xs font-bold whitespace-nowrap pb-1 transition-colors active:scale-95 ${
                  active ? '' : 'text-[#848e9c] hover:text-white'
                }`}
                style={active ? { color: accentColor } : undefined}
              >
                {r.label}
                {active && (
                  <span
                    className="absolute -bottom-[11px] left-0 w-full h-[2px] rounded-full"
                    style={{ backgroundColor: accentColor }}
                  />
                )}
              </button>
            );
          })}

          {/* Change indicator */}
          {candles.length >= 2 && (
            <span className={`ml-auto pl-3 text-[10px] sm:text-xs font-bold whitespace-nowrap shrink-0 ${isUp ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
              {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{pctChange.toFixed(2)}%
            </span>
          )}
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
          {([['candles', language === 'en' ? 'Candles' : 'شمع'], ['area', 'Area'], ['line', 'Line']] as const).map(([type, label]) => (
            <button
              key={type}
              onClick={() => setChartType(type as 'candles' | 'area' | 'line')}
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
              autoFit ? 'text-white' : 'text-[#848e9c] border-white/5 hover:text-white'
            }`}
            style={autoFit ? { color: accentColor, borderColor: `${accentColor}55`, backgroundColor: `${accentColor}1a` } : undefined}
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
              delete savedViewsRef.current[`${name || ''}-${range}`];
              chartRef.current?.timeScale().fitContent();
            }}
            className="shrink-0 px-2.5 py-1 text-[10px] sm:text-xs font-bold rounded-md border text-[#848e9c] border-white/5 hover:text-white hover:bg-white/5 active:scale-95 transition-colors"
          >
            {bi('ڕێستکردنی بینین', 'Reset View')}
          </button>
        </div>
      </div>



      {/* Chart */}
      <div className="relative h-[250px] sm:h-[320px]">
        <div ref={chartContainerRef} className="absolute inset-0" />
        <div
          ref={tooltipRef}
          className="absolute hidden z-20 pointer-events-none rounded-lg border border-[#2a2e3e] p-2.5 shadow-xl"
          style={{
            background: 'rgba(16,20,30,0.95)',
            backdropFilter: 'blur(8px)',
            minWidth: '180px',
          }}
        />
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
