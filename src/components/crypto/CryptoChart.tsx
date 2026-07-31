import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, CandlestickSeries, LineSeries, AreaSeries, HistogramSeries, Time, createSeriesMarkers } from 'lightweight-charts';
import { OHLCCandle, TIMEFRAMES, getDisplaySymbol, getSymbolFromPair } from '@/lib/krakenApi';
import { calculateMA, calculateEMA, MA_PERIODS, MAType } from '@/lib/movingAverage';
import { computeChartPreset } from '@/lib/chartPreset';
import { computeIndicators, summarizeSignals, computeBuySellPct } from '@/lib/indicators';
import { rsiSeries, macdSeries } from '@/lib/indicatorSeries';
import { computeConfluence } from '@/lib/confluenceSignal';
import { TradeControls, TradeSide, TradePct, askPrice, bidPrice } from '@/components/crypto/TradeControls';
import { OrderBookPanel } from '@/components/crypto/OrderBookPanel';
import { TradeJournalModal } from '@/components/crypto/TradeJournalModal';
import { LivePriceBadge } from '@/components/crypto/LivePriceBadge';
import { MarketStatusBadge } from '@/components/crypto/MarketStatusBadge';

import { useDemoAccount } from '@/contexts/DemoAccountContext';
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
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tradeLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maSeriesRefs = useRef<Record<number, any>>({});
  // Indicator pane series (RSI + MACD) drawn in their own panes below price.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rsiSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const macdHistRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const macdLineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const macdSignalRef = useRef<any>(null);
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
  const [activeMAs, setActiveMAs] = useState<Set<number>>(new Set([9, 21, 50]));
  const [maType, setMaType] = useState<MAType>('EMA');
  // MT5-style extras: RSI / MACD panes, depth-of-market ladder, trade journal.
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const [showDOM, setShowDOM] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  // CTP Confluence Buy/Sell signal overlay (EMA + RSI + MACD confluence).
  const [showCTP, setShowCTP] = useState(() => {
    try { return localStorage.getItem('chart_show_ctp') !== 'false'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('chart_show_ctp', String(showCTP)); } catch { /* ignore */ }
  }, [showCTP]);
  // Minimum confidence a signal must reach before it is drawn (0 = show all).
  const [minConf, setMinConf] = useState(() => {
    try { return Number(localStorage.getItem('chart_ctp_min_conf') ?? '70') || 0; } catch { return 70; }
  });
  useEffect(() => {
    try { localStorage.setItem('chart_ctp_min_conf', String(minConf)); } catch { /* ignore */ }
  }, [minConf]);
  const cycleMinConf = () => setMinConf((v) => {
    const i = CONFIDENCE_STEPS.indexOf(v as typeof CONFIDENCE_STEPS[number]);
    return CONFIDENCE_STEPS[(i + 1) % CONFIDENCE_STEPS.length];
  });
  const confluence = useMemo(() => computeConfluence(candles), [candles]);
  const ctpSignals = useMemo(() => filterByConfidence(confluence.signals, minConf), [confluence, minConf]);
  const ctpLast = ctpSignals.length ? ctpSignals[ctpSignals.length - 1] : null;
  // Toggle: show entry qty + price alongside live P/L on the chart, or just P/L.
  const [showTradeDetails, setShowTradeDetails] = useState(() => {
    try { return localStorage.getItem('chart_show_trade_details') === 'true'; } catch { return false; }
  });

  // Shared demo account + the single open position (persists across navigation).
  const { balance, realizedPnl, renew, getPosition, openOrAdd, updatePrice, setTpSl, closePosition } = useDemoAccount();
  const [tradeAmount, setTradeAmount] = useState(0.01);
  const [tradePct, setTradePct] = useState<TradePct | null>(null);
  // Bumped whenever the chart series is recreated so the trade line redraws.
  const [seriesVersion, setSeriesVersion] = useState(0);

  // The position only counts for THIS chart when it belongs to this pair.
  const myPos = getPosition(pair);
  const buyLeg = myPos?.buy && myPos.buy.qty > 0 ? myPos.buy : null;
  const sellLeg = myPos?.sell && myPos.sell.qty > 0 ? myPos.sell : null;
  // Trading is now free across assets — no single-asset lock.
  const otherPositionLabel = null;

  // (Live per-trade P/L is shown directly on the chart, MT5-style, below.)

  // Track the live-price direction for the up/down indicator on the buttons.
  const prevPriceRef = useRef<number>(0);
  const [priceDir, setPriceDir] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    if (currentPrice <= 0) return;
    const prev = prevPriceRef.current;
    if (prev > 0 && currentPrice !== prev) setPriceDir(currentPrice > prev ? 'up' : 'down');
    prevPriceRef.current = currentPrice;
  }, [currentPrice]);

  useEffect(() => {
    try { localStorage.setItem('chart_show_trade_details', String(showTradeDetails)); } catch {}
  }, [showTradeDetails]);

  const fmtQty = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });

  const handleRefreshTrade = () => {
    const ind = computeIndicators(candles);
    const summary = summarizeSignals(ind, currentPrice);
    const { hasData, buyPct, sellPct } = computeBuySellPct(summary);
    setTradePct({ hasData, buyPct, sellPct });
  };

  // Open or ADD to a leg. Buy and Sell can both be open at once (hedge mode).
  // A position on another asset must be closed first.
  const handleAdd = (side: 'buy' | 'sell', tpSlPct?: number) => {
    if (balance <= 0 || currentPrice <= 0) return;
    if (otherPositionLabel) return;
    // Buy fills at the ask, sell fills at the bid (matches the button prices).
    const fillPrice = side === 'buy' ? askPrice(currentPrice) : bidPrice(currentPrice);
    openOrAdd({ symbol: pair, label: `${symbol}/USD`, side, price: fillPrice, amount: tradeAmount });
    // Auto-apply a symmetric TP/SL preset (% of fill price) when requested.
    if (tpSlPct != null && tpSlPct > 0) {
      const delta = fillPrice * (tpSlPct / 100);
      const tp = side === 'buy' ? fillPrice + delta : fillPrice - delta;
      const sl = side === 'buy' ? fillPrice - delta : fillPrice + delta;
      setTpSl(pair, side, +tp.toFixed(6), +sl.toFixed(6));
    }
  };

  // Close one leg and realise its P/L (handled in context).
  const handleClose = (side: 'buy' | 'sell') => closePosition(pair, side);




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
        entireTextOnly: false,
        ticksVisible: true,
      },
      timeScale: {
        borderColor: 'rgba(132,142,156,0.15)',
        timeVisible: true,
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
    markersRef.current = null;
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

  // Update price line. Re-anchors after every timeframe / chart-type switch
  // (the series is recreated, bumping seriesVersion) so the live-price line
  // never disappears. Falls back to the latest candle close before the first
  // live tick arrives.
  useEffect(() => {
    if (!seriesRef.current) return;
    const anchorPrice = currentPrice > 0
      ? currentPrice
      : (candles.length ? candles[candles.length - 1].close : 0);
    if (anchorPrice <= 0) return;

    if (priceLineRef.current) {
      try { seriesRef.current.removePriceLine(priceLineRef.current); } catch {}
      priceLineRef.current = null;
    }

    priceLineRef.current = seriesRef.current.createPriceLine({
      price: anchorPrice,
      color: '#f0b90b',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      // Price already shows once on the standard axis label — keep only the
      // symbol in the title so the value isn't duplicated.
      title: `${symbol}`,
    });
  }, [currentPrice, candles, symbol, interval, chartType, seriesVersion]);

  // Push the live price into the shared position so P/L updates and TP/SL
  // can auto-close even while this asset is on screen.
  useEffect(() => {
    if (currentPrice > 0) updatePrice(pair, currentPrice);
  }, [currentPrice, pair, updatePrice]);

  // Draw the entry line + TP/SL lines for each open leg (buy and/or sell).
  useEffect(() => {
    if (!seriesRef.current) return;

    // Remove any previously drawn lines (stored as an array in tradeLineRef).
    if (Array.isArray(tradeLineRef.current)) {
      for (const line of tradeLineRef.current) {
        try { seriesRef.current.removePriceLine(line); } catch { /* ignore */ }
      }
    }
    tradeLineRef.current = [];

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
        const diff = currentPrice > 0 ? (isBuy ? currentPrice - f.entryPrice : f.entryPrice - currentPrice) : 0;
        const pnlVal = diff * f.qty;
        const inProfit = pnlVal >= 0;
        // Live P/L always shown (green = profit, red = loss). When the details
        // toggle is on, prefix with Buy/Sell label, qty and entry price (MT5).
        const pnl = currentPrice > 0
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
          color: currentPrice > 0 ? (inProfit ? '#0ecb81' : '#f6465d') : (isBuy ? '#0ecb81' : '#f6465d'),
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

    // Place an arrow marker on the exact candle where each trade was opened so
    // the user can SEE on the chart where every Buy/Sell happened.
    if (!markersRef.current) {
      markersRef.current = createSeriesMarkers(seriesRef.current, []);
    }
    const lastTime = candles.length ? candles[candles.length - 1].time : Math.floor(Date.now() / 1000);
    const firstTime = candles.length ? candles[0].time : 0;
    const snap = (t: number) => {
      if (!candles.length) return t as number;
      // Clamp the entry time into the visible candle range so the marker shows.
      const clamped = Math.min(Math.max(t, firstTime), lastTime);
      // Find the nearest candle time.
      let nearest = candles[0].time;
      for (const c of candles) {
        if (Math.abs(c.time - clamped) < Math.abs(nearest - clamped)) nearest = c.time;
      }
      return nearest;
    };
    // Aggregate fills landing on the same candle (per side) into ONE marker so
    // labels never overlap on a single bar. Each merged marker still reflects
    // the total size, the volume-weighted entry price AND how many individual
    // fills it represents (×N), so multiple trades on one candle stay readable.
    // Buy markers sit belowBar and Sell aboveBar, so a Buy + Sell on the same
    // candle land on opposite sides and never collide either.
    const markerAgg = new Map<string, { time: number; side: 'buy' | 'sell'; qty: number; cost: number; count: number }>();
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
      n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: n >= 1 ? 2 : 6 });
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
    // CTP Confluence signals (EMA trend + RSI + MACD cross + price/EMA).
    if (showCTP) {
      for (const s of confluence.signals) {
        const stars = '★'.repeat(s.score) + '☆'.repeat(Math.max(0, 4 - s.score));
        const strength = s.confidence >= 80
          ? bi('بەهێز', 'STRONG')
          : s.confidence >= 60
            ? bi('مامناوەند', 'MEDIUM')
            : bi('لاواز', 'WEAK');
        const strong = s.confidence >= 80;
        const medium = s.confidence >= 60;
        const color = s.side === 'buy'
          ? (strong ? '#00e07a' : medium ? '#16c784' : '#5fbf95')
          : (strong ? '#ff2f45' : medium ? '#ea3943' : '#c2707a');
        markers.push({
          time: s.time as Time,
          position: s.side === 'buy' ? 'belowBar' : 'aboveBar',
          color,
          shape: s.side === 'buy' ? 'arrowUp' : 'arrowDown',
          text: `${s.side === 'buy' ? '▲ BUY' : '▼ SELL'} ${stars} ${s.confidence}% · ${strength}`,
        });
      }
    }

    markers.sort((a, b) => (a.time as number) - (b.time as number));
    markersRef.current.setMarkers(markers);
  }, [buyLeg, sellLeg, seriesVersion, language, candles, currentPrice, showTradeDetails, showCTP, confluence]);

  // Create / remove the RSI and MACD panes (and their data) when toggled or
  // when the chart is recreated. Each indicator gets its own pane below price.
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
      if (candles.length) s.setData(rsiSeries(candles).map((d) => ({ time: d.time as Time, value: d.value })));
      try {
        s.createPriceLine({ price: 70, color: '#f6465d', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
        s.createPriceLine({ price: 30, color: '#0ecb81', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      } catch { /* ignore */ }
      rsiSeriesRef.current = s;
      try { chart.panes()[paneIndex]?.setStretchFactor(1); } catch { /* ignore */ }
      paneIndex++;
    }

    if (showMACD) {
      const data = candles.length ? macdSeries(candles) : { macd: [], signal: [], histogram: [] };
      const hist = chart.addSeries(HistogramSeries, {
        priceLineVisible: false, lastValueVisible: false,
      }, paneIndex);
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

    // Keep the price pane dominant relative to indicator panes.
    try { chart.panes()[0]?.setStretchFactor(showRSI || showMACD ? 3 : 1); } catch { /* ignore */ }

    return removeAll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRSI, showMACD, seriesVersion]);

  // Live-update the indicator pane data as new candles arrive.
  useEffect(() => {
    if (!candles.length) return;
    if (rsiSeriesRef.current) {
      rsiSeriesRef.current.setData(rsiSeries(candles).map((d) => ({ time: d.time as Time, value: d.value })));
    }
    if (macdHistRef.current && macdLineRef.current && macdSignalRef.current) {
      const data = macdSeries(candles);
      macdHistRef.current.setData(data.histogram.map((d) => ({
        time: d.time as Time, value: d.value,
        color: d.value >= 0 ? 'rgba(14,203,129,0.6)' : 'rgba(246,70,93,0.6)',
      })));
      macdLineRef.current.setData(data.macd.map((d) => ({ time: d.time as Time, value: d.value })));
      macdSignalRef.current.setData(data.signal.map((d) => ({ time: d.time as Time, value: d.value })));
    }
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
    <div className="flex flex-col">



      {/* Header */}
      <div className="border-b border-white/5">
        {/* Symbol + price */}
        <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1 px-3 pt-3 pb-2">
          <span className="text-lg sm:text-xl font-bold tracking-tight text-white">{symbol}/USD</span>
          {currentPrice > 0 && (
            <span className="text-lg sm:text-xl font-bold text-[#f0b90b] tracking-tight tabular-nums">
              ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: currentPrice < 1 ? 6 : 2 })}
            </span>
          )}
          <MarketStatusBadge assetClass="crypto" className="ml-auto self-center" />
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

          {/* CTP Confluence Buy/Sell signal overlay */}
          <button
            onClick={() => setShowCTP(v => !v)}
            className={`shrink-0 px-2.5 py-1 text-[10px] sm:text-xs font-bold rounded-md border transition-colors ${
              showCTP ? 'bg-[#16c7841a] text-[#16c784] border-[#16c78455]' : 'text-[#848e9c] border-white/5 hover:text-white'
            }`}
          >
            CTP {bi('سیگناڵ', 'Signals')}
          </button>

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

      {/* Buy / Refresh / Sell controls directly above the chart (MT5 style) */}
      <TradeControls
        amount={tradeAmount}
        pct={tradePct}
        currentPrice={currentPrice}
        priceDir={priceDir}
        buyLeg={buyLeg}
        sellLeg={sellLeg}
        otherPositionLabel={otherPositionLabel}
        timeframeLabel={TIMEFRAMES.find(t => t.interval === interval)?.label}
        timeframeMinutes={interval}
        balance={balance}
        realizedPnl={realizedPnl}
        onRenew={renew}
        onBuy={(tpSlPct) => handleAdd('buy', tpSlPct)}
        onSell={(tpSlPct) => handleAdd('sell', tpSlPct)}
        onClose={handleClose}
        onRefresh={handleRefreshTrade}
        onAmountChange={setTradeAmount}
        onClearTpSl={() => {
          if (buyLeg) setTpSl(pair, 'buy', null, null);
          if (sellLeg) setTpSl(pair, 'sell', null, null);
        }}
        onApplyTpSl={(pct) => {
          if (buyLeg) {
            const d = buyLeg.entryPrice * (pct / 100);
            setTpSl(pair, 'buy', +(buyLeg.entryPrice + d).toFixed(6), +(buyLeg.entryPrice - d).toFixed(6));
          }
          if (sellLeg) {
            const d = sellLeg.entryPrice * (pct / 100);
            setTpSl(pair, 'sell', +(sellLeg.entryPrice - d).toFixed(6), +(sellLeg.entryPrice + d).toFixed(6));
          }
        }}
      />

      {/* Chart — sized so trade controls (above) and 24h stats (below) stay reachable on mobile without awkward scrolling */}
      <div className="relative h-[46vh] sm:h-[360px] md:h-[500px] landscape:h-[86vh] landscape:max-h-none">
        <LivePriceBadge
          label={getDisplaySymbol(getSymbolFromPair(pair))}
          price={currentPrice}
          decimals={0}
          accentColor="#f0b90b"
        />
        <div ref={chartContainerRef} className="absolute inset-0" />

        {/* CTP confluence score panel (Pine-style table, bottom-start corner) */}
        {showCTP && candles.length > 0 && (
          <div className="absolute bottom-2 start-2 z-20 rounded-lg border border-white/10 bg-black/70 backdrop-blur px-2.5 py-1.5 text-[10px] leading-tight">
            <div className="mb-1 font-bold tracking-wide text-[#f0b90b]">CTP CONFLUENCE</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
              <span className="text-[#848e9c]">{bi('بەرزبوونەوە', 'Bull')}</span>
              <span className="text-end font-bold text-[#16c784]">{confluence.bullScore}/4</span>
              <span className="text-[#848e9c]">{bi('داکشان', 'Bear')}</span>
              <span className="text-end font-bold text-[#ea3943]">{confluence.bearScore}/4</span>
              <span className="text-[#848e9c]">RSI</span>
              <span className="text-end font-bold text-[#f0b90b]">{confluence.rsi}</span>
              <span className="text-[#848e9c]">{bi('ئاڕاستە', 'Trend')}</span>
              <span className={`text-end font-bold ${confluence.trend === 'up' ? 'text-[#16c784]' : confluence.trend === 'down' ? 'text-[#ea3943]' : 'text-[#848e9c]'}`}>
                {confluence.trend === 'up' ? '▲ UP' : confluence.trend === 'down' ? '▼ DOWN' : '– FLAT'}
              </span>
            </div>
            {confluence.last && (
              <div className="mt-1.5 border-t border-white/10 pt-1.5">
                <div className={`flex items-center justify-between gap-2 font-bold ${confluence.last.side === 'buy' ? 'text-[#16c784]' : 'text-[#ea3943]'}`}>
                  <span>{confluence.last.side === 'buy' ? '▲ BUY' : '▼ SELL'}</span>
                  <span className="tabular-nums">{confluence.last.score}/4 · {confluence.last.confidence}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${confluence.last.side === 'buy' ? 'bg-[#16c784]' : 'bg-[#ea3943]'}`}
                    style={{ width: `${confluence.last.confidence}%` }}
                  />
                </div>
                <div className="mt-0.5 text-[9px] font-bold text-[#848e9c]">
                  {confluence.last.confidence >= 80
                    ? bi('سیگناڵی بەهێز', 'STRONG SIGNAL')
                    : confluence.last.confidence >= 60
                      ? bi('سیگناڵی مامناوەند', 'MEDIUM SIGNAL')
                      : bi('سیگناڵی لاواز', 'WEAK SIGNAL')}
                </div>
              </div>
            )}

          </div>
        )}





        {/* Depth-of-market ladder (MT5 style) overlaid on the right edge */}
        {showDOM && currentPrice > 0 && (
          <div className="absolute top-2 end-2 z-20 w-[150px] sm:w-[190px]">
            <OrderBookPanel
              symbol={`${symbol}/USD`}
              currentPrice={currentPrice}
              onClose={() => setShowDOM(false)}
            />
          </div>
        )}


        {/* Per-trade size + live P/L now render directly on the chart at each
            entry point (green = profit, red = loss), MT5 style — no overlay boxes. */}


        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e17]/80 z-10">
            <div className="text-[#848e9c] text-sm">{bi('بارکردنی داتای چارت...', 'Loading chart data...')}</div>
          </div>
        )}
      </div>

      {/* Trade history / journal modal */}
      <TradeJournalModal open={showJournal} onClose={() => setShowJournal(false)} />
    </div>
  );
}
