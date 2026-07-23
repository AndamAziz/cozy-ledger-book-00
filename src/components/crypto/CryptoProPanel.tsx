import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { OHLCCandle } from '@/lib/krakenApi';
import { computeIndicators, summarizeSignals } from '@/lib/indicators';
import { computeSR } from '@/lib/supportResistance';
import { DxyWidget } from '@/components/crypto/DxyWidget';
import { SentimentGauge } from '@/components/crypto/SentimentGauge';
import { useMacro } from '@/hooks/useMacro';
import { TechnicalSignals } from '@/components/crypto/TechnicalSignals';

import { EventAlertBanner, CalendarEvent } from '@/components/crypto/EventAlertBanner';
import { PriceAlerts } from '@/components/crypto/PriceAlerts';
import { SignalHistory } from '@/components/crypto/SignalHistory';
import { Crown, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react';

interface Props {
  candles: OHLCCandle[];
  price: number;
  symbol: string;
}

type Bias = 'bullish' | 'bearish' | 'neutral';
type Action = 'buy' | 'sell' | 'wait';

const C_BUY = '#0ecb81';
const C_SELL = '#f6465d';
const C_WAIT = '#f0b90b';

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function priceDecimals(p: number): number {
  if (p >= 1000) return 2;
  if (p >= 1) return 2;
  if (p >= 0.01) return 4;
  return 6;
}

export function CryptoProPanel({ candles, price, symbol }: Props) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);

  // SINGLE SOURCE OF TRUTH for macro indicators. Crypto correctly uses the
  // alternative.me crypto Fear & Greed index. Shared 60s hook.
  const { dxy, sentiment, loading: loadingMacro, refresh: refreshMacro } = useMacro('crypto');

  const headers = {
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };

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
    loadEvents();
  }, [loadEvents]);

  // Crypto reacts inverse to the dollar (risk-on / risk-off).
  const cryptoBias: Bias = useMemo(() => {
    if (dxy.changePct == null) return 'neutral';
    if (dxy.changePct <= -0.1) return 'bullish';
    if (dxy.changePct >= 0.1) return 'bearish';
    return 'neutral';
  }, [dxy.changePct]);

  // ---- Combined Crypto Signal ----
  const signal = useMemo(() => {
    const ind = computeIndicators(candles);
    const tech = summarizeSignals(ind, price); // score -100..100
    // Dollar: strong USD weighs on risk assets like crypto.
    const dxyScore = dxy.changePct != null ? clamp(-dxy.changePct * 35, -100, 100) : 0;
    // Sentiment: Fear & Greed drives crypto momentum (greed up, fear down).
    let sentScore = 0;
    if (sentiment.value != null) {
      sentScore = clamp((sentiment.value - 50) * 1.6, -100, 100);
    }
    // Crypto is sentiment-heavy: technicals 55%, sentiment 30%, dollar 15%.
    const combined = Math.round(tech.score * 0.55 + sentScore * 0.3 + dxyScore * 0.15);

    let action: Action = 'wait';
    if (combined >= 20) action = 'buy';
    else if (combined <= -20) action = 'sell';

    const confidence = clamp(Math.round(Math.abs(combined) + 45), 45, 95);

    const sr = computeSR(candles);
    let entry = price;
    let sl: number | null = null;
    let tp: number | null = null;
    if (sr && price > 0) {
      if (action === 'buy') {
        sl = Math.min(sr.s1, price * 0.985);
        tp = price + (price - sl) * 2;
      } else if (action === 'sell') {
        sl = Math.max(sr.r1, price * 1.015);
        tp = price - (sl - price) * 2;
      }
    }

    return { action, combined, confidence, entry, sl, tp, techScore: tech.score, dxyScore: Math.round(dxyScore), sentScore: Math.round(sentScore) };
  }, [candles, price, dxy.changePct, sentiment.value]);

  const dec = priceDecimals(price);
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });

  const actColor = signal.action === 'buy' ? C_BUY : signal.action === 'sell' ? C_SELL : C_WAIT;
  const actLabel =
    signal.action === 'buy' ? bi('بکڕە (Long)', 'BUY (Long)') :
    signal.action === 'sell' ? bi('بفرۆشە (Short)', 'SELL (Short)') :
    bi('چاوەڕوانبە', 'WAIT');
  const ActIcon = signal.action === 'buy' ? TrendingUp : signal.action === 'sell' ? TrendingDown : Minus;

  const refreshAll = () => { refreshMacro(); loadEvents(); };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0e17] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-[#f0b90b]" />
          <h2 className="text-lg font-bold text-white">{bi('کریپتۆ پرۆ', 'Crypto Pro')} · {symbol}</h2>
        </div>
        <button
          onClick={refreshAll}
          disabled={loadingMacro || loadingEvents}
          className="p-1.5 rounded-lg hover:bg-[#1a1e2e] text-[#848e9c] hover:text-white transition-colors disabled:opacity-50"
          aria-label={bi('نوێکردنەوە', 'Refresh')}
        >
          <RefreshCw className={`h-4 w-4 ${loadingMacro || loadingEvents ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Combined signal card */}
      <div className="rounded-xl p-4 border" style={{ borderColor: actColor + '55', backgroundColor: actColor + '12' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ActIcon className={`h-7 w-7 ${signal.action !== 'wait' ? 'animate-flash-blink' : ''}`} style={{ color: actColor }} />
            <div>
              <div className="text-xl font-extrabold" style={{ color: actColor }}>{actLabel}</div>
              <div className="text-[11px] text-[#848e9c]">{bi('سیگناڵی تێکەڵی کریپتۆ', 'Combined Crypto Signal')} ({symbol}/USD)</div>
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
              <div className="text-sm font-bold text-white tabular-nums">${fmt(signal.entry)}</div>
            </div>
            <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
              <div className="text-[10px] text-[#848e9c]">Stop Loss</div>
              <div className="text-sm font-bold tabular-nums" style={{ color: C_SELL }}>${fmt(signal.sl)}</div>
            </div>
            <div className="bg-[#0a0e17] rounded-lg p-2 text-center">
              <div className="text-[10px] text-[#848e9c]">Take Profit</div>
              <div className="text-sm font-bold tabular-nums" style={{ color: C_BUY }}>${fmt(signal.tp)}</div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-3 text-[10px] text-[#848e9c]">
          <span>{bi('تەکنیکی', 'Technical')}: <span style={{ color: signal.techScore >= 0 ? C_BUY : C_SELL }}>{signal.techScore}</span></span>
          <span>{bi('هەست', 'Sentiment')}: <span style={{ color: signal.sentScore >= 0 ? C_BUY : C_SELL }}>{signal.sentScore}</span></span>
          <span>{bi('دۆلار', 'Dollar')}: <span style={{ color: signal.dxyScore >= 0 ? C_BUY : C_SELL }}>{signal.dxyScore}</span></span>
          <span>{bi('کۆ', 'Total')}: <span style={{ color: actColor }}>{signal.combined}</span></span>
        </div>
        <p className="text-[10px] text-[#848e9c] mt-2 leading-relaxed">
          {bi('ئەمە یارمەتیدەرە نەک ڕاوێژی دارایی. هەمیشە Stop Loss بەکاربهێنە.', 'This is guidance, not financial advice. Always use a Stop Loss.')}
        </p>
      </div>

      {false && <PriceAlerts storeKey={`${symbol}USD`} label={`${symbol}/USD`} price={price} decimals={dec} />}
      {false && <SignalHistory storeKey={`${symbol}USD`} action={signal.action} confidence={signal.confidence} price={price} decimals={dec} />}

      <SentimentGauge sentiment={sentiment} loading={loadingMacro} asset="crypto" />
      <DxyWidget dxy={dxy} goldBias={cryptoBias} loading={loadingMacro} asset="crypto" />
      <TechnicalSignals candles={candles} price={price} />
      <EventAlertBanner events={events} loading={loadingEvents} />
    </div>
  );
}
