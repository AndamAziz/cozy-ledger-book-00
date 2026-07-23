import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { fetchForexCandles, ForexCandle } from '@/lib/forexApi';
import { computeIndicators, summarizeSignals } from '@/lib/indicators';
import { computeSR } from '@/lib/supportResistance';
import { DxyWidget } from '@/components/crypto/DxyWidget';
import { SentimentGauge } from '@/components/crypto/SentimentGauge';
import { useMacro } from '@/hooks/useMacro';
import { TechnicalSignals } from '@/components/crypto/TechnicalSignals';
import { RiskCalculator } from '@/components/crypto/RiskCalculator';
import { EventAlertBanner, CalendarEvent } from '@/components/crypto/EventAlertBanner';
import { PriceAlerts } from '@/components/crypto/PriceAlerts';
import { SignalHistory } from '@/components/crypto/SignalHistory';
import { Crown, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';

interface Props {
  code: string;
  name: string;
  flag: string;
  rate: number;
}

type Bias = 'bullish' | 'bearish' | 'neutral';
type Action = 'buy' | 'sell' | 'wait';

const C_BUY = '#0ecb81';
const C_SELL = '#f6465d';
const C_WAIT = '#f0b90b';

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function fxDecimals(p: number): number {
  if (p >= 1000) return 2;
  if (p >= 100) return 3;
  if (p >= 1) return 4;
  return 6;
}

export function ForexProPanel({ code, name, flag, rate }: Props) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);

  const [candles, setCandles] = useState<ForexCandle[]>([]);
  const [loadingCandles, setLoadingCandles] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // SINGLE SOURCE OF TRUTH for macro indicators. Forex uses the CNN (US
  // stock-market) Fear & Greed index — never the crypto one. Shared 60s hook.
  const { dxy, sentiment, loading: loadingMacro, refresh: refreshMacro } = useMacro('cnn');

  const headers = {
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };

  const loadCandles = useCallback(async () => {
    setLoadingCandles(true);
    try {
      const data = await fetchForexCandles(code, '1mo');
      setCandles(data);
    } catch {
      /* ignore */
    } finally {
      setLoadingCandles(false);
    }
  }, [code]);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-news`, { headers });
      const data = await res.json();
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch {
      /* ignore */
    } finally {
      setLoadingEvents(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCandles();
    loadEvents();
  }, [loadCandles, loadEvents]);

  // Pair = USD/CODE → a stronger dollar pushes the pair UP.
  const fxBias: Bias = useMemo(() => {
    if (dxy.changePct == null) return 'neutral';
    if (dxy.changePct >= 0.1) return 'bullish';
    if (dxy.changePct <= -0.1) return 'bearish';
    return 'neutral';
  }, [dxy.changePct]);

  const candlesForInd = useMemo(
    () => candles.map(c => ({ ...c, volume: 0 })),
    [candles],
  );

  // ---- Combined Forex Signal (USD/CODE) ----
  const signal = useMemo(() => {
    const ind = computeIndicators(candlesForInd);
    const tech = summarizeSignals(ind, rate); // -100..100 on the USD/CODE series
    // Dollar strength lifts USD/CODE (positive DXY change = bullish for the pair).
    const dxyScore = dxy.changePct != null ? clamp(dxy.changePct * 40, -100, 100) : 0;
    // Forex is technical + macro driven: technicals 60%, dollar 40%.
    const combined = Math.round(tech.score * 0.6 + dxyScore * 0.4);

    let action: Action = 'wait';
    if (combined >= 20) action = 'buy';
    else if (combined <= -20) action = 'sell';

    const confidence = clamp(Math.round(Math.abs(combined) + 45), 45, 95);

    const sr = computeSR(candlesForInd);
    let entry = rate;
    let sl: number | null = null;
    let tp: number | null = null;
    if (sr && rate > 0) {
      if (action === 'buy') {
        sl = Math.min(sr.s1, rate * 0.997);
        tp = rate + (rate - sl) * 2;
      } else if (action === 'sell') {
        sl = Math.max(sr.r1, rate * 1.003);
        tp = rate - (sl - rate) * 2;
      }
    }

    return { action, combined, confidence, entry, sl, tp, techScore: tech.score, dxyScore: Math.round(dxyScore) };
  }, [candlesForInd, rate, dxy.changePct]);

  const dec = fxDecimals(rate);
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });

  const actColor = signal.action === 'buy' ? C_BUY : signal.action === 'sell' ? C_SELL : C_WAIT;
  const actLabel =
    signal.action === 'buy' ? bi('بکڕە (Long)', 'BUY (Long)') :
    signal.action === 'sell' ? bi('بفرۆشە (Short)', 'SELL (Short)') :
    bi('چاوەڕوانبە', 'WAIT');
  const ActIcon = signal.action === 'buy' ? TrendingUp : signal.action === 'sell' ? TrendingDown : Minus;

  const refreshAll = () => { loadCandles(); refreshMacro(); loadEvents(); };
  const loadingAny = loadingMacro || loadingEvents || loadingCandles;

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0e17] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-[#2962ff]" />
          <h2 className="text-lg font-bold text-white">{bi('فۆرێکس پرۆ', 'Forex Pro')} · {flag} USD/{code}</h2>
        </div>
        <button
          onClick={refreshAll}
          disabled={loadingAny}
          className="p-1.5 rounded-lg hover:bg-[#1a1e2e] text-[#848e9c] hover:text-white transition-colors disabled:opacity-50"
          aria-label={bi('نوێکردنەوە', 'Refresh')}
        >
          <RefreshCw className={`h-4 w-4 ${loadingAny ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Combined signal card */}
      <div className="rounded-xl p-4 border" style={{ borderColor: actColor + '55', backgroundColor: actColor + '12' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ActIcon className={`h-7 w-7 ${signal.action !== 'wait' ? 'animate-flash-blink' : ''}`} style={{ color: actColor }} />
            {signal.action === 'buy' && (
              <span className="text-[10px] font-bold animate-flash-blink" style={{ color: C_BUY }}>USD/{code} ↑</span>
            )}
            {signal.action === 'sell' && (
              <span className="text-[10px] font-bold animate-flash-blink" style={{ color: C_SELL }}>USD/{code} ↓</span>
            )}
            <div>
              <div className="text-xl font-extrabold" style={{ color: actColor }}>{actLabel}</div>
              <div className="text-[11px] text-[#848e9c]">{bi('سیگناڵی تێکەڵ', 'Combined Signal')} (USD/{code})</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums" style={{ color: actColor }}>{signal.confidence}%</div>
            <div className="text-[10px] text-[#848e9c]">{bi('متمانە', 'Confidence')}</div>
          </div>
        </div>

        {signal.action !== 'wait' && signal.sl != null && signal.tp != null && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
              <div className="text-[10px] text-[#848e9c]">{bi('داخڵبوون', 'Entry')}</div>
              <div className="text-sm font-bold text-white tabular-nums">{fmt(signal.entry)}</div>
            </div>
            <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
              <div className="text-[10px] text-[#848e9c]">Stop Loss</div>
              <div className="text-sm font-bold tabular-nums" style={{ color: C_SELL }}>{fmt(signal.sl)}</div>
            </div>
            <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
              <div className="text-[10px] text-[#848e9c]">Take Profit</div>
              <div className="text-sm font-bold tabular-nums" style={{ color: C_BUY }}>{fmt(signal.tp)}</div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-3 text-[10px] text-[#848e9c]">
          <span>{bi('تەکنیکی', 'Technical')}: <span style={{ color: signal.techScore >= 0 ? C_BUY : C_SELL }}>{signal.techScore}</span></span>
          <span>{bi('دۆلار', 'Dollar')}: <span style={{ color: signal.dxyScore >= 0 ? C_BUY : C_SELL }}>{signal.dxyScore}</span></span>
          <span>{bi('کۆ', 'Total')}: <span style={{ color: actColor }}>{signal.combined}</span></span>
        </div>
        <p className="text-[10px] text-[#848e9c] mt-2 leading-relaxed">
          {bi('ئەمە یارمەتیدەرە نەک ڕاوێژی دارایی. هەمیشە Stop Loss بەکاربهێنە.', 'This is guidance, not financial advice. Always use a Stop Loss.')}
        </p>
      </div>

      {false && <PriceAlerts storeKey={`USD${code}`} label={`USD/${code}`} price={rate} decimals={dec} />}
      {false && <SignalHistory storeKey={`USD${code}`} action={signal.action} confidence={signal.confidence} price={rate} decimals={dec} />}

      <DxyWidget dxy={dxy} goldBias={fxBias} loading={loadingMacro} asset="forex" />
      <SentimentGauge sentiment={sentiment} loading={loadingMacro} asset="gold" />
      <TechnicalSignals candles={candlesForInd} price={rate} />
      <EventAlertBanner events={events} loading={loadingEvents} />
      <RiskCalculator
        defaultEntry={rate}
        contractSize={100000}
        pipSize={dec >= 4 ? 0.0001 : 0.01}
        priceDecimals={dec}
        unitLabel={{ ku: `بڕ (${code})`, en: `Units (${code})` }}
        sizeLabel={{ ku: 'قەبارەی Lot', en: 'Position Size' }}
      />
    </div>
  );
}
