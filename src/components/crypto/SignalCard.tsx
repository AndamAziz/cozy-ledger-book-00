import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Clock, Target, Shield } from 'lucide-react';
import type { AssetSignal } from '@/lib/signalEngine';
import { TelegramShareButton } from '@/components/TelegramShareButton';

const C_BUY = '#0ecb81';
const C_SELL = '#f6465d';
const C_WAIT = '#f0b90b';
const C_MUTED = '#848e9c';

function fmt(n: number, d: number) {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface Props {
  signal: AssetSignal | null;
  loading: boolean;
  emoji: string;
}

export function SignalCard({ signal, loading, emoji }: Props) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  if (loading || !signal) {
    return (
      <div className="rounded-xl bg-[#0d1117] border border-[#1a1e2e] p-4 space-y-3 animate-pulse">
        <div className="h-16 rounded-lg bg-[#0a0e17]" />
        <div className="h-20 rounded-lg bg-[#0a0e17]" />
        <div className="h-16 rounded-lg bg-[#0a0e17]" />
      </div>
    );
  }

  const action = signal.action;
  const color = action === 'buy' ? C_BUY : action === 'sell' ? C_SELL : C_WAIT;
  const Icon = action === 'buy' ? TrendingUp : action === 'sell' ? TrendingDown : Minus;
  const actLabel =
    action === 'buy' ? bi('بکڕە', 'BUY') :
    action === 'sell' ? bi('بفرۆشە', 'SELL') :
    action === 'wait' ? bi('چاوەڕێبە', 'WAIT') :
    bi('بێلایەن', 'NEUTRAL');

  const directional = action === 'buy' || action === 'sell';
  const showConfidence = signal.confidence > 60 && directional;

  const updatedAgo = (() => {
    const m = Math.max(0, Math.round((now - signal.updatedAt) / 60000));
    if (m < 1) return bi('ئێستا', 'just now');
    return bi(`${m} خولەک لەمەوبەر`, `${m}m ago`);
  })();

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: color + '55', backgroundColor: color + '0d' }}>
      {/* Header: asset + price */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">{emoji}</span>
          <div>
            <div className="text-sm font-extrabold text-white">{signal.label}</div>
            <div className="text-[11px] text-[#848e9c] tabular-nums">${fmt(signal.price, signal.decimals)}</div>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-[#0a0e17] text-[#848e9c]">{signal.timeframe}</span>
      </div>

      <div className="p-4 space-y-3">
        {/* Action + confidence */}
        <div className="flex items-center justify-between rounded-lg bg-[#0a0e17] p-3">
          <div className="flex items-center gap-2.5">
            <Icon className={`h-8 w-8 ${directional ? 'animate-flash-blink' : ''}`} style={{ color }} />
            <div>
              <div className="text-2xl font-extrabold leading-none" style={{ color }}>{actLabel}</div>
              <div className="text-[10px] text-[#848e9c] mt-1">{bi('سیگناڵی زیندوو', 'Live signal')}</div>
            </div>
          </div>
          {showConfidence ? (
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums" style={{ color }}>{signal.confidence}%</div>
              <div className="text-[10px] text-[#848e9c]">{bi('متمانە', 'Confidence')}</div>
            </div>
          ) : (
            <div className="text-right max-w-[40%]">
              <div className="text-[11px] font-bold" style={{ color: C_MUTED }}>
                {action === 'wait' ? bi('مەترسی بەرز', 'High risk') : bi('سیگناڵ لاوازە', 'Low conviction')}
              </div>
            </div>
          )}
        </div>

        {/* News warning */}
        {signal.newsWarningEn && (
          <div className="flex items-start gap-2 rounded-lg border px-3 py-2"
            style={{ borderColor: signal.newsRisk.blocking ? C_SELL + '66' : C_WAIT + '55', backgroundColor: (signal.newsRisk.blocking ? C_SELL : C_WAIT) + '14' }}>
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: signal.newsRisk.blocking ? C_SELL : C_WAIT }} />
            <span className="text-[11px] text-white leading-snug">{bi(signal.newsWarningKu || '', signal.newsWarningEn)}</span>
          </div>
        )}

        {/* Trade levels */}
        {directional && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-[#0a0e17] p-2 text-center">
                <div className="text-[9px] text-[#848e9c]">{bi('داخڵبوون', 'Entry')}</div>
                <div className="text-xs font-bold text-white tabular-nums">${fmt(signal.entry, signal.decimals)}</div>
              </div>
              <div className="rounded-lg bg-[#0a0e17] p-2 text-center">
                <div className="text-[9px] text-[#848e9c] flex items-center justify-center gap-0.5"><Shield className="h-2.5 w-2.5" />Stop Loss</div>
                <div className="text-xs font-bold tabular-nums" style={{ color: C_SELL }}>${fmt(signal.stopLoss, signal.decimals)}</div>
              </div>
              <div className="rounded-lg bg-[#0a0e17] p-2 text-center">
                <div className="text-[9px] text-[#848e9c]">{bi('پێوانە R:R', 'Risk/Reward')}</div>
                <div className="text-xs font-bold tabular-nums" style={{ color: C_WAIT }}>1 : {signal.riskReward}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-[#0a0e17] p-2 text-center">
                <div className="text-[9px] text-[#848e9c] flex items-center justify-center gap-0.5"><Target className="h-2.5 w-2.5" />Take Profit 1</div>
                <div className="text-xs font-bold tabular-nums" style={{ color: C_BUY }}>${fmt(signal.takeProfit1, signal.decimals)}</div>
              </div>
              <div className="rounded-lg bg-[#0a0e17] p-2 text-center">
                <div className="text-[9px] text-[#848e9c] flex items-center justify-center gap-0.5"><Target className="h-2.5 w-2.5" />Take Profit 2</div>
                <div className="text-xs font-bold tabular-nums" style={{ color: C_BUY }}>${fmt(signal.takeProfit2, signal.decimals)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Why this signal */}
        <div className="rounded-lg bg-[#0a0e17] p-3">
          <div className="text-[10px] font-bold text-[#848e9c] mb-1">{bi('بۆچی ئەم سیگناڵە؟', 'Why this signal')}</div>
          <p className="text-[11px] text-white leading-relaxed">{bi(signal.reasonKu, signal.reasonEn)}</p>
        </div>

        {/* Share to grow the channel */}
        <TelegramShareButton
          bi={bi}
          emoji={emoji}
          label={signal.label}
          action={action}
          entry={directional ? signal.entry : null}
          tp={directional ? signal.takeProfit1 : null}
          decimals={signal.decimals}
          className="w-full"
        />



        {/* Footer: session + updated */}
        <div className="flex items-center justify-between text-[10px] text-[#848e9c]">
          <span className="flex items-center gap-1">
            🕒 {signal.activeSessions.length ? signal.activeSessions.join(', ') : bi('بازاڕ داخراوە', 'Markets quiet')}
          </span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{updatedAgo}</span>
        </div>
      </div>
    </div>
  );
}
