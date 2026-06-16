import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, LineSeries, AreaSeries, CandlestickSeries, HistogramSeries, Time, createSeriesMarkers } from 'lightweight-charts';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { MetalCandle } from '@/hooks/useMetalsHistory';
import { calculateMA, calculateEMA, MA_PERIODS, MAType } from '@/lib/movingAverage';
import { computeChartPreset } from '@/lib/chartPreset';
import { computeIndicators, summarizeSignals, computeBuySellPct, bestIndicatorSettings, STANDARD_INDICATOR_SETTINGS } from '@/lib/indicators';
import { rsiSeries, macdSeries } from '@/lib/indicatorSeries';
import { TradeControls, TradeSide, TradePct, askPrice, bidPrice } from '@/components/crypto/TradeControls';
import { OrderBookPanel } from '@/components/crypto/OrderBookPanel';
import { TradeJournalModal } from '@/components/crypto/TradeJournalModal';

import { useDemoAccount } from '@/contexts/DemoAccountContext';
import type { OHLCCandle } from '@/lib/krakenApi';

interface MetalsChartProps {
  candles: MetalCandle[];
  isLoading: boolean;
  error?: string | null;
  lastUpdated?: number | null;
  onRetry?: () => void;
  accentColor: string;
  range: string;
  onRangeChange: (range: string) => void;
  currentPrice?: number;
  name?: string;
  code?: string;
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

// Approximate candle duration (minutes) per range, used for the hold hint.
const RANGE_MINUTES: Record<string, number> = {
  '1min': 1, '5min': 5, '15min': 15, '1d': 1440, '5d': 1440, '1mo': 1440, '3mo': 1440, '1y': 1440,
};


const INTRADAY_RANGES = new Set(['1min', '5min', '15min', '1d', '5d']);

export function MetalsChart({ candles, isLoading, error, lastUpdated, onRetry, accentColor, range, onRangeChange, currentPrice, name }: MetalsChartProps) {
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
  const [activeMAs, setActiveMAs] = useState<Set<number>>(new Set([9, 21, 50]));
  const [maType, setMaType] = useState<MAType>('EMA');
  // MT5-style extras: RSI / MACD panes, depth-of-market ladder, trade journal.
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const [showDOM, setShowDOM] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  // Toggle: show entry qty + price alongside live P/L on the chart, or just P/L.
  const [showTradeDetails, setShowTradeDetails] = useState(() => {
    try { return localStorage.getItem('chart_show_trade_details') === 'true'; } catch { return false; }
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rsiSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const macdHistRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const macdLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const macdSignalRef = useRef<any>(null);

  // Shared demo account + the single open position (persists across navigation).
  const { balance, realizedPnl, renew, getPosition, openOrAdd, updatePrice, setTpSl, closePosition } = useDemoAccount();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tradeLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any>(null);
  const [tradeAmount, setTradeAmount] = useState(0.01);
  const [tradePct, setTradePct] = useState<TradePct | null>(null);
  // Bumped whenever the chart series is recreated so the trade line redraws.
  const [seriesVersion, setSeriesVersion] = useState(0);

  useEffect(() => {
    try { localStorage.setItem('chart_show_trade_details', String(showTradeDetails)); } catch {}
  }, [showTradeDetails]);

  // Unique key for this metal so its position is isolated from other assets.
  const mySymbol = `metal:${name || ''}`;

  const fmtQty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });

  const livePrice = () => (currentPrice && currentPrice > 0
    ? currentPrice
    : (candles.length ? candles[candles.length - 1].close : 0));

  // The position only counts for THIS chart when it belongs to this metal.
  const myPos = getPosition(mySymbol);
  const buyLeg = myPos?.buy && myPos.buy.qty > 0 ? myPos.buy : null;
  const sellLeg = myPos?.sell && myPos.sell.qty > 0 ? myPos.sell : null;
  // Trading is now free across assets — no single-asset lock.
  const otherPositionLabel = null;

  // (Live per-trade P/L is shown directly on the chart, MT5-style, below.)
  const price = livePrice();

  // Track the live-price direction for the up/down indicator on the buttons.
  const prevPriceRef = useRef<number>(0);
  const [priceDir, setPriceDir] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    const p = livePrice();
    if (p <= 0) return;
    const prev = prevPriceRef.current;
    if (prev > 0 && p !== prev) setPriceDir(p > prev ? 'up' : 'down');
    prevPriceRef.current = p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice, candles]);

  const handleRefreshTrade = () => {
    const ohlc: OHLCCandle[] = candles.map(c => ({
      time: c.time, open: c.close, high: c.high, low: c.low, close: c.close, volume: 0,
    }));
    const ind = computeIndicators(ohlc, bestIndicatorSettings(ohlc.length));
    const summary = summarizeSignals(ind, livePrice());
    const { hasData, buyPct, sellPct } = computeBuySellPct(summary);
    setTradePct({ hasData, buyPct, sellPct });
  };

  // Open or ADD to a leg. Buy and Sell can both be open at once (hedge mode).
  // A position on another asset must be closed first.
  const handleAdd = (side: 'buy' | 'sell', tpSlPct?: number) => {
    if (balance <= 0) return;
    const price = livePrice();
    if (price <= 0) return;
    if (otherPositionLabel) return;
    // Buy fills at the ask, sell fills at the bid (matches the button prices).
    const fillPrice = side === 'buy' ? askPrice(price) : bidPrice(price);
    openOrAdd({ symbol: mySymbol, label: name || bi('کانزا', 'Metal'), side, price: fillPrice, amount: tradeAmount });
    // Auto-apply a symmetric TP/SL preset (% of fill price) when requested.
    if (tpSlPct != null && tpSlPct > 0) {
      const delta = fillPrice * (tpSlPct / 100);
      const tp = side === 'buy' ? fillPrice + delta : fillPrice - delta;
      const sl = side === 'buy' ? fillPrice - delta : fillPrice + delta;
      setTpSl(mySymbol, side, +tp.toFixed(6), +sl.toFixed(6));
    }
  };

  // Close one leg and realise its P/L (handled in context).
  const handleClose = (side: 'buy' | 'sell') => closePosition(mySymbol, side);


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
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);

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
      // Indicator series belonged to the now-disposed chart. Drop the refs so the
      // live-update effect doesn't call setData on disposed objects.
      rsiSeriesRef.current = null;
      macdHistRef.current = null;
      macdLineRef.current = null;
      macdSignalRef.current = null;
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
        entireTextOnly: false,
        ticksVisible: true,
      },
      timeScale: {
        borderColor: 'rgba(132,142,156,0.15)',
        timeVisible: INTRADAY_RANGES.has(range),
        secondsVisible: false,
        rightOffset: preset.rightOffset,
        barSpacing: preset.barSpacing,
        minBarSpacing: preset.minBarSpacing,
        ticksVisible: true,
      },
      // Touch-friendly gestures: one-finger HORIZONTAL swipe pans the chart,
      // vertical swipes are released to the page for scrolling, and two-finger
      // pinch zooms the time axis. Kinetic scroll gives momentum on flick.
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      kineticScroll: {
        touch: true,
        mouse: false,
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
    markersRef.current = null;
    setSeriesVersion(v => v + 1);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLineRef.current = null;
      maSeriesRefs.current = {};
      rsiSeriesRef.current = null;
      macdHistRef.current = null;
      macdLineRef.current = null;
      macdSignalRef.current = null;
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
      // Price already shows once on the standard axis label — keep only the
      // metal name in the title so the value isn't duplicated.
      title: `${name || ''}`,
    });
  }, [currentPrice, name, accentColor]);

  // Push the live price into the shared position so P/L updates and TP/SL
  // can auto-close while this metal is on screen.
  useEffect(() => {
    const p = livePrice();
    if (p > 0) updatePrice(mySymbol, p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice, candles, mySymbol, updatePrice]);

  // Draw the entry line + TP/SL lines for each open leg (buy and/or sell).
  useEffect(() => {
    if (!seriesRef.current) return;

    if (Array.isArray(tradeLineRef.current)) {
      for (const line of tradeLineRef.current) {
        try { seriesRef.current.removePriceLine(line); } catch { /* ignore */ }
      }
    }
    tradeLineRef.current = [];

    const lp = livePrice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legFills = (leg: any): { id: string; entryPrice: number; qty: number; entryTime: number }[] =>
      (leg?.fills && leg.fills.length)
        ? leg.fills
        : (leg ? [{ id: 'agg', entryPrice: leg.entryPrice, qty: leg.qty, entryTime: leg.entryTime }] : []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drawLeg = (side: 'buy' | 'sell', leg: any) => {
      if (!leg || leg.qty <= 0) return;
      const isBuy = side === 'buy';
      const fills = legFills(leg);
      // One entry line PER individual trade, each with its own live P/L.
      fills.forEach((f, i) => {
        if (f.entryPrice <= 0 || f.qty <= 0) return;
        const diff = lp > 0 ? (isBuy ? lp - f.entryPrice : f.entryPrice - lp) : 0;
        const pnlVal = diff * f.qty;
        const inProfit = pnlVal >= 0;
        // Live P/L always shown (green = profit, red = loss). When the details
        // toggle is on, prefix with Buy/Sell label, qty and entry price (MT5).
        const pnl = lp > 0
          ? `${inProfit ? '+' : '−'}$${Math.abs(pnlVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : '';
        const sideLabel = isBuy ? (language === 'tr' ? 'Al' : bi('کڕین', 'Buy')) : (language === 'tr' ? 'Sat' : bi('فرۆشتن', 'Sell'));
        const tag = fills.length > 1 ? ` #${i + 1}` : '';
        let title = pnl || sideLabel;
        if (showTradeDetails) {
          title = `${sideLabel}${tag} ${fmtQty(f.qty)} @ $${f.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}${pnl ? ` ${pnl}` : ''}`;
        }
        tradeLineRef.current.push(seriesRef.current.createPriceLine({
          price: f.entryPrice,
          // Entry label is tinted by live P/L (green = profit, red = loss).
          color: lp > 0 ? (inProfit ? '#0ecb81' : '#f6465d') : (isBuy ? '#0ecb81' : '#f6465d'),
          lineWidth: 1,
          lineStyle: 0,
          // Keep the P/L on the line itself but DON'T stack a box on the price
          // axis — that kept the scale numbers from showing when zoomed in.
          axisLabelVisible: false,
          title,
        }));
      });
    };

    drawLeg('buy', buyLeg);
    drawLeg('sell', sellLeg);

    // Arrow marker on the candle where each trade was opened.
    if (!markersRef.current) {
      markersRef.current = createSeriesMarkers(seriesRef.current, []);
    }
    const lastTime = candles.length ? (candles[candles.length - 1].time as number) : Math.floor(Date.now() / 1000);
    const firstTime = candles.length ? (candles[0].time as number) : 0;
    const snap = (t: number) => {
      if (!candles.length) return t;
      const clamped = Math.min(Math.max(t, firstTime), lastTime);
      let nearest = candles[0].time as number;
      for (const c of candles) {
        if (Math.abs((c.time as number) - clamped) < Math.abs(nearest - clamped)) nearest = c.time as number;
      }
      return nearest;
    };
    // Aggregate fills per candle+side into ONE marker so labels never overlap on
    // a single bar. Each merged marker carries the total size, the volume-
    // weighted entry price AND how many fills it represents (×N), so multiple
    // trades on one candle stay readable. Buy sits belowBar / Sell aboveBar, so
    // a Buy + Sell on the same candle land on opposite sides and never collide.
    const markerAgg = new Map<string, { time: number; side: 'buy' | 'sell'; qty: number; cost: number; count: number }>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const collect = (side: 'buy' | 'sell', leg: any) => {
      for (const f of legFills(leg)) {
        const t = snap(f.entryTime) as number;
        const key = `${side}-${t}`;
        const prev = markerAgg.get(key);
        if (prev) {
          prev.qty = +(prev.qty + f.qty).toFixed(6);
          prev.cost += f.entryPrice * f.qty;
          prev.count += 1;
        } else {
          markerAgg.set(key, { time: t, side, qty: f.qty, cost: f.entryPrice * f.qty, count: 1 });
        }
      }
    };
    if (buyLeg) collect('buy', buyLeg);
    if (sellLeg) collect('sell', sellLeg);
    const fmtMarkerPrice = (n: number) =>
      n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sideText = (side: 'buy' | 'sell') =>
      side === 'buy'
        ? (language === 'tr' ? 'Al' : bi('کڕین', 'Buy'))
        : (language === 'tr' ? 'Sat' : bi('فرۆشتن', 'Sell'));
    const markers: any[] = Array.from(markerAgg.values()).map((m) => {
      const avgPrice = m.qty > 0 ? m.cost / m.qty : 0;
      const countTag = m.count > 1 ? ` ×${m.count}` : '';
      return {
        time: m.time as Time,
        position: m.side === 'buy' ? 'belowBar' : 'aboveBar',
        color: m.side === 'buy' ? '#0ecb81' : '#f6465d',
        shape: m.side === 'buy' ? 'arrowUp' : 'arrowDown',
        text: `${sideText(m.side)}${countTag} ${fmtQty(m.qty)} @ $${fmtMarkerPrice(avgPrice)}`,
      };
    });
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    markersRef.current.setMarkers(markers);
  }, [buyLeg, sellLeg, seriesVersion, language, candles, currentPrice, showTradeDetails]);

  // OHLC view of the metal candles for the indicator-series helpers.
  const ohlcForIndicators = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => candles.map((c) => ({ time: c.time as number, open: c.open, high: c.high, low: c.low, close: c.close })) as any,
    [candles],
  );
  

  // Create / remove the RSI and MACD panes when toggled or chart is recreated.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const removeAll = () => {
      [rsiSeriesRef, macdHistRef, macdLineRef, macdSignalRef].forEach((ref) => {
        if (ref.current) {
          try { chart.removeSeries(ref.current); } catch { /* ignore */ }
          ref.current = null;
        }
      });
    };
    removeAll();

    let paneIndex = 1;

    if (showRSI) {
      const s = chart.addSeries(LineSeries, {
        color: '#f0b90b', lineWidth: 2,
        priceLineVisible: false, lastValueVisible: true,
        priceFormat: { type: 'custom', minMove: 0.01, formatter: (v: number) => v.toFixed(0) },
      }, paneIndex);
      if (candles.length) s.setData(rsiSeries(ohlcForIndicators, STANDARD_INDICATOR_SETTINGS.rsiPeriod).map((d) => ({ time: d.time as Time, value: d.value })));
      try {
        s.createPriceLine({ price: 70, color: '#f6465d', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
        s.createPriceLine({ price: 30, color: '#0ecb81', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      } catch { /* ignore */ }
      rsiSeriesRef.current = s;
      try { chart.panes()[paneIndex]?.setStretchFactor(1); } catch { /* ignore */ }
      paneIndex++;
    }

    if (showMACD) {
      const data = candles.length ? macdSeries(ohlcForIndicators, STANDARD_INDICATOR_SETTINGS.macdFast, STANDARD_INDICATOR_SETTINGS.macdSlow, STANDARD_INDICATOR_SETTINGS.macdSignal) : { macd: [], signal: [], histogram: [] };
      const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, paneIndex);
      hist.setData(data.histogram.map((d) => ({
        time: d.time as Time, value: d.value,
        color: d.value >= 0 ? 'rgba(14,203,129,0.6)' : 'rgba(246,70,93,0.6)',
      })));
      const macdL = chart.addSeries(LineSeries, { color: '#2962ff', lineWidth: 2, priceLineVisible: false, lastValueVisible: false }, paneIndex);
      macdL.setData(data.macd.map((d) => ({ time: d.time as Time, value: d.value })));
      const sigL = chart.addSeries(LineSeries, { color: '#f0b90b', lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, paneIndex);
      sigL.setData(data.signal.map((d) => ({ time: d.time as Time, value: d.value })));
      macdHistRef.current = hist;
      macdLineRef.current = macdL;
      macdSignalRef.current = sigL;
      try { chart.panes()[paneIndex]?.setStretchFactor(1); } catch { /* ignore */ }
    }

    try { chart.panes()[0]?.setStretchFactor(showRSI || showMACD ? 3 : 1); } catch { /* ignore */ }

    return removeAll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRSI, showMACD, seriesVersion]);

  // Live-update the indicator pane data as new candles arrive.
  useEffect(() => {
    if (!candles.length) return;
    try {
      if (rsiSeriesRef.current) {
        rsiSeriesRef.current.setData(rsiSeries(ohlcForIndicators, STANDARD_INDICATOR_SETTINGS.rsiPeriod).map((d) => ({ time: d.time as Time, value: d.value })));
      }
      if (macdHistRef.current && macdLineRef.current && macdSignalRef.current) {
        const data = macdSeries(ohlcForIndicators, STANDARD_INDICATOR_SETTINGS.macdFast, STANDARD_INDICATOR_SETTINGS.macdSlow, STANDARD_INDICATOR_SETTINGS.macdSignal);
        macdHistRef.current.setData(data.histogram.map((d) => ({
          time: d.time as Time, value: d.value,
          color: d.value >= 0 ? 'rgba(14,203,129,0.6)' : 'rgba(246,70,93,0.6)',
        })));
        macdLineRef.current.setData(data.macd.map((d) => ({ time: d.time as Time, value: d.value })));
        macdSignalRef.current.setData(data.signal.map((d) => ({ time: d.time as Time, value: d.value })));
      }
    } catch {
      /* series may belong to a chart that is mid-recreation; ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles]);



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

          {/* RSI / MACD indicator panes + Depth of Market toggle (MT5 style) */}
          {([['RSI', showRSI, () => setShowRSI(v => !v)], ['MACD', showMACD, () => setShowMACD(v => !v)], [bi('قووڵایی', 'DOM'), showDOM, () => setShowDOM(v => !v)]] as const).map(([label, active, onClick]) => (
            <button
              key={label}
              onClick={onClick}
              className={`shrink-0 px-2.5 py-1 text-[10px] sm:text-xs font-bold rounded-md border transition-colors ${
                active ? 'bg-[#f0b90b1a] text-[#f0b90b] border-[#f0b90b55]' : 'text-[#848e9c] border-white/5 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}

          <div className="w-px h-4 bg-white/10 mx-1 self-center shrink-0" />

          {/* Trade journal opener */}
          <button
            onClick={() => setShowJournal(true)}
            className="shrink-0 px-2.5 py-1 text-[10px] sm:text-xs font-bold rounded-md border text-[#848e9c] border-white/5 hover:text-white hover:bg-white/5 active:scale-95 transition-colors"
          >
            {bi('تۆمار', 'Journal')}
          </button>

          {/* Toggle: show qty + entry price on trade labels, or just P/L */}
          <button
            onClick={() => setShowTradeDetails(v => !v)}
            className={`shrink-0 px-2.5 py-1 text-[10px] sm:text-xs font-bold rounded-md border transition-colors ${
              showTradeDetails ? 'bg-[#f0b90b1a] text-[#f0b90b] border-[#f0b90b55]' : 'text-[#848e9c] border-white/5 hover:text-white'
            }`}
          >
            {bi('وردەکاری', 'Details')}
          </button>

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


      {/* Buy / Refresh / Sell controls directly above the chart (MT5 style) */}
      <TradeControls
        amount={tradeAmount}
        pct={tradePct}
        currentPrice={livePrice()}
        priceDir={priceDir}
        buyLeg={buyLeg}
        sellLeg={sellLeg}
        otherPositionLabel={otherPositionLabel}
        timeframeLabel={RANGES.find(r => r.key === range)?.label}
        timeframeMinutes={RANGE_MINUTES[range] ?? 5}
        balance={balance}
        realizedPnl={realizedPnl}
        onRenew={renew}
        onBuy={(tpSlPct) => handleAdd('buy', tpSlPct)}
        onSell={(tpSlPct) => handleAdd('sell', tpSlPct)}
        onClose={handleClose}
        onRefresh={handleRefreshTrade}
        onAmountChange={setTradeAmount}
        onClearTpSl={() => {
          if (buyLeg) setTpSl(mySymbol, 'buy', null, null);
          if (sellLeg) setTpSl(mySymbol, 'sell', null, null);
        }}
        onApplyTpSl={(pct) => {
          if (buyLeg) {
            const d = buyLeg.entryPrice * (pct / 100);
            setTpSl(mySymbol, 'buy', +(buyLeg.entryPrice + d).toFixed(6), +(buyLeg.entryPrice - d).toFixed(6));
          }
          if (sellLeg) {
            const d = sellLeg.entryPrice * (pct / 100);
            setTpSl(mySymbol, 'sell', +(sellLeg.entryPrice - d).toFixed(6), +(sellLeg.entryPrice + d).toFixed(6));
          }
        }}
      />

      {/* Chart — grows to fill the screen in landscape (MT5-style) */}
      <div className="relative h-[72vh] sm:h-[340px] landscape:h-[88vh] landscape:max-h-none">
        <div ref={chartContainerRef} className="absolute inset-0" />



        {/* Depth-of-market ladder (MT5 style) overlaid on the right edge */}
        {showDOM && currentPrice > 0 && (
          <div className="absolute top-2 end-2 z-20 w-[150px] sm:w-[190px]">
            <OrderBookPanel
              symbol={name || bi('کانزا', 'Metal')}
              currentPrice={currentPrice}
              onClose={() => setShowDOM(false)}
            />
          </div>
        )}


        {/* Per-trade size + live P/L now render directly on the chart at each
            entry point (green = profit, red = loss), MT5 style — no overlay boxes. */}

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
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e17]/95 z-10 px-6">
            <div className="flex flex-col items-center gap-3 text-center max-w-[280px]">
              {/* Faux empty grid baseline for a clear chart-shaped placeholder */}
              <div className="w-full h-12 mb-1 relative opacity-30">
                <div className="absolute inset-0 flex flex-col justify-between">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="border-t border-dashed border-[#848e9c]/40" />
                  ))}
                </div>
              </div>
              <AlertTriangle className="w-7 h-7 text-[#f0b90b]" />
              <span className="text-xs font-medium text-white">
                {language === 'en'
                  ? `No ${(RANGES.find(r => r.key === range)?.label) || range} history for ${name || 'this asset'} yet.`
                  : `هێشتا مێژووی ${(RANGES.find(r => r.key === range)?.label) || range} بۆ ${name || 'ئەم دارایە'} بەردەست نییە.`}
              </span>
              <span className="text-[10px] text-[#848e9c] leading-relaxed">
                {error
                  ? error
                  : language === 'en'
                    ? 'Spot data may be briefly rate-limited. We never show futures prices instead — try again in a moment or pick another timeframe.'
                    : 'لەوانەیە داتای spot بۆ ماوەیەکی کورت سنووردار بێت. هەرگیز نرخی futures جێگرەوە ناکەین — تکایە دوای چەند چرکەیەک هەوڵبدەرەوە یان ماوەیەکی تر هەڵبژێرە.'}
              </span>
              {lastUpdated && (
                <span className="text-[10px] text-[#5e6673]">
                  {language === 'en' ? 'Last updated: ' : 'دوایین نوێکردنەوە: '}
                  {new Date(lastUpdated).toLocaleString(
                    language === 'en' ? 'en-GB-u-nu-latn' : 'ku-Arab-u-nu-latn',
                    { hour: '2-digit', minute: '2-digit', second: '2-digit', day: 'numeric', month: 'short', hour12: false }
                  )}
                </span>
              )}
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

      {/* Trade history / journal modal */}
      <TradeJournalModal open={showJournal} onClose={() => setShowJournal(false)} />
    </div>
  );
}
