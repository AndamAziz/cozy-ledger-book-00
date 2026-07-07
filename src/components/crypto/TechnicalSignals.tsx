import { useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { OHLCCandle } from '@/lib/krakenApi';
import { computeIndicators, summarizeSignals, computeBuySellPct, SignalType } from '@/lib/indicators';
import { computeSR } from '@/lib/supportResistance';
import { DirArrow, useValueDirection } from '@/components/crypto/DirIndicator';
import { Activity } from 'lucide-react';

interface Props {
  candles: OHLCCandle[];
  price: number;
}

const C_BUY = '#0ecb81';
const C_SELL = '#f6465d';
const C_NEUTRAL = '#f0b90b';

function sigColor(s: SignalType): string {
  return s === 'buy' ? C_BUY : s === 'sell' ? C_SELL : C_NEUTRAL;
}

export function TechnicalSignals({ candles, price }: Props) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);

  const { ind, summary, pct, sr } = useMemo(() => {
    const ind = computeIndicators(candles);
    const summary = summarizeSignals(ind, price);
    const pct = computeBuySellPct(summary);
    const sr = computeSR(candles);
    return { ind, summary, pct, sr };
  }, [candles, price]);

  // Per-refresh direction for each S/R level (hooks must run unconditionally).
  const dirR2 = useValueDirection(sr?.r2 ?? null);
  const dirR1 = useValueDirection(sr?.r1 ?? null);
  const dirPivot = useValueDirection(sr?.pivot ?? null);
  const dirS1 = useValueDirection(sr?.s1 ?? null);
  const dirS2 = useValueDirection(sr?.s2 ?? null);
  const dirHigh = useValueDirection(sr?.recentHigh ?? null);

  const sigLabel = (s: SignalType) =>
    s === 'buy' ? bi('بکڕە', 'Buy') : s === 'sell' ? bi('بفرۆشە', 'Sell') : bi('ناوەند', 'Neutral');

  const rows: { label: string; value: string; sig: SignalType }[] = [];

  if (ind.rsi != null) {
    rows.push({
      label: 'RSI (14)',
      value: ind.rsi.toFixed(1),
      sig: ind.rsi < 30 ? 'buy' : ind.rsi > 70 ? 'sell' : 'neutral',
    });
  }
  if (ind.macd) {
    rows.push({
      label: 'MACD',
      value: ind.macd.histogram.toFixed(2),
      sig: ind.macd.histogram > 0 ? 'buy' : ind.macd.histogram < 0 ? 'sell' : 'neutral',
    });
  }
  if (ind.bollinger) {
    rows.push({
      label: 'Bollinger %B',
      value: (ind.bollinger.percentB * 100).toFixed(0) + '%',
      sig: ind.bollinger.percentB < 0.1 ? 'buy' : ind.bollinger.percentB > 0.9 ? 'sell' : 'neutral',
    });
  }
  if (ind.ema9 != null && ind.ema21 != null) {
    rows.push({
      label: 'EMA 9/21',
      value: (ind.ema9 - ind.ema21).toFixed(2),
      sig: ind.ema9 > ind.ema21 ? 'buy' : ind.ema9 < ind.ema21 ? 'sell' : 'neutral',
    });
  }
  if (ind.ema50 != null) {
    rows.push({
      label: bi('نرخ بەرامبەر EMA50', 'Price vs EMA50'),
      value: ind.ema50.toFixed(2),
      sig: price > ind.ema50 ? 'buy' : price < ind.ema50 ? 'sell' : 'neutral',
    });
  }

  return (
    <div className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-[#3b82f6]" />
        <h3 className="text-sm font-bold text-white">{bi('پێوەرە تەکنیکیەکان', 'Technical Indicators')}</h3>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-[#848e9c]">{bi('داتای پێوەر کەمە بۆ هەژماردن.', 'Not enough data to compute indicators.')}</p>
      ) : (
        <>
          {/* Buy/Sell breakdown */}
          {pct.hasData && (
            <div className="mb-3">
              <div className="flex h-2.5 rounded-full overflow-hidden bg-[#1a1e2e]">
                <div style={{ width: `${pct.buyPct}%`, backgroundColor: C_BUY }} />
                <div style={{ width: `${pct.neutralPct}%`, backgroundColor: C_NEUTRAL }} />
                <div style={{ width: `${pct.sellPct}%`, backgroundColor: C_SELL }} />
              </div>
              <div className="flex justify-between text-[10px] mt-1">
                <span style={{ color: C_BUY }}>{bi('کڕین', 'Buy')} {pct.buyPct}%</span>
                <span style={{ color: C_NEUTRAL }}>{bi('ناوەند', 'Neutral')} {pct.neutralPct}%</span>
                <span style={{ color: C_SELL }}>{bi('فرۆشتن', 'Sell')} {pct.sellPct}%</span>
              </div>
            </div>
          )}

          <div className="space-y-1">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-xs py-1 border-b border-[#1a1e2e] last:border-0">
                <span className="text-[#848e9c]">{r.label}</span>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums text-white">{r.value}</span>
                  <span className="font-bold w-12 text-right" style={{ color: sigColor(r.sig) }}>{sigLabel(r.sig)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Support / Resistance */}
          {sr && (
            <div className="mt-4">
              <h4 className="text-[11px] font-bold text-[#848e9c] uppercase tracking-wider mb-2">{bi('پشتگیری و بەرگری', 'Support & Resistance')}</h4>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                {[
                  { l: 'R2', v: sr.r2, c: C_SELL, d: dirR2 },
                  { l: 'R1', v: sr.r1, c: C_SELL, d: dirR1 },
                  { l: bi('ناوەند', 'Pivot'), v: sr.pivot, c: C_NEUTRAL, d: dirPivot },
                  { l: 'S1', v: sr.s1, c: C_BUY, d: dirS1 },
                  { l: 'S2', v: sr.s2, c: C_BUY, d: dirS2 },
                  { l: bi('بەرزترین', 'High'), v: sr.recentHigh, c: C_SELL, d: dirHigh },
                ].map((x) => (
                  <div key={x.l} className="bg-[#0a0e17] border border-[#1a1e2e] rounded-lg py-1.5">
                    <div className="text-[9px] font-bold" style={{ color: x.c }}>{x.l}</div>
                    <div className="flex items-center justify-center gap-0.5">
                      <span className="text-[11px] tabular-nums text-white">${x.v.toFixed(2)}</span>
                      <DirArrow dir={x.d} size={10} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
