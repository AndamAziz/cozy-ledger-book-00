import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { RefreshCw, Bug, Activity, DollarSign, Gauge, LineChart, Info } from 'lucide-react';
import { DROPDOWN_ASSETS, DropdownAssetKey, isSupportedAsset } from '@/lib/signalData';
import { SIGNAL_TIMEFRAMES, SignalTF } from '@/lib/signalEngine';
import { useSignalEngine } from '@/hooks/useSignalEngine';
import { SignalCard } from '@/components/crypto/SignalCard';
import { SignalParityCheck } from '@/components/crypto/SignalParityCheck';
import { LegOutcomeTimeline } from '@/components/crypto/LegOutcomeTimeline';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

const C_BULL = '#0ecb81';
const C_BEAR = '#f6465d';
const C_MUTED = '#848e9c';

function trendArrow(dir: 'up' | 'down' | 'neutral'): string {
  return dir === 'up' ? '⬆️' : dir === 'down' ? '⬇️' : '↔️';
}
function dirColor(dir: 'up' | 'down' | 'neutral'): string {
  return dir === 'up' ? C_BULL : dir === 'down' ? C_BEAR : C_MUTED;
}

const LAST_TF_KEY = 'signals:lastTF';

interface SignalsPanelProps {
  /** Asset selected by the dropdown in the tab header. */
  asset: DropdownAssetKey;
}

export function SignalsPanel({ asset }: SignalsPanelProps) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);

  const [tf, setTf] = useState<SignalTF>(() => {
    try {
      const s = localStorage.getItem(LAST_TF_KEY) as SignalTF | null;
      if (s && (SIGNAL_TIMEFRAMES as readonly string[]).includes(s)) return s;
    } catch { /* noop */ }
    return 'M15';
  });
  const [debug, setDebug] = useState(false);

  useEffect(() => { try { localStorage.setItem(LAST_TF_KEY, tf); } catch { /* noop */ } }, [tf]);

  // Validate against the analysis engine's supported assets; fall back to a
  // safe key for the hook and render a friendly notice for unsupported assets.
  const supported = isSupportedAsset(asset);
  const engineAsset = supported ? asset : 'gold';
  const dropdownMeta = DROPDOWN_ASSETS.find((a) => a.key === asset);

  const { meta, signal, macro, loading, refreshedAt, refresh } = useSignalEngine(engineAsset, tf);

  const macroChip = (label: string, value: string, color: string, Icon: typeof DollarSign) => (
    <div className="flex items-center gap-1.5 rounded-lg bg-[#0a0e17] border border-[#1a1e2e] px-2.5 py-1.5">
      <Icon className="h-3.5 w-3.5" style={{ color }} />
      <span className="text-[10px] text-[#848e9c]">{label}</span>
      <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );

  const dxyTxt = macro.dxyChangePct == null ? '—' : `${macro.dxyChangePct > 0 ? '+' : ''}${macro.dxyChangePct.toFixed(2)}%`;
  // DXY ↑ strengthens the dollar = bad for gold → red; ↓ = good for gold → green.
  const dxyColor = macro.dxyChangePct == null ? C_MUTED : macro.dxyChangePct > 0 ? C_BEAR : C_BULL;
  const fgTxt = macro.fearGreed == null ? '—' : String(macro.fearGreed);
  // Semantic for gold/risk: <40 fear (caution) red, 40-60 neutral yellow, >60 greed (risk-on) green.
  const fgColor = macro.fearGreed == null ? C_MUTED : macro.fearGreed < 40 ? C_BEAR : macro.fearGreed > 60 ? C_BULL : '#f0b90b';
  // BTC uses the alternative.me crypto index; everything else uses CNN's index.
  const fgSource = engineAsset === 'btc' ? 'alternative.me' : 'CNN';
  const spxTxt = macro.spxChangePct == null ? '—' : `${macro.spxChangePct > 0 ? '+' : ''}${macro.spxChangePct.toFixed(2)}%`;
  // S&P ↓ = risk-off, supportive for gold → green; ↑ = risk-on → red.
  const spxColor = macro.spxChangePct == null ? C_MUTED : macro.spxChangePct < 0 ? C_BULL : C_BEAR;


  // Friendly fallback when the dropdown asset isn't supported by the engine.
  if (!supported) {
    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <h1 className="text-base font-extrabold text-white flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#f0b90b]" /> {bi('سیگناڵە زیندووەکان', 'Live Signals')}
        </h1>
        <div className="flex flex-col items-center justify-center text-center gap-2 rounded-xl border border-[#1a1e2e] bg-[#0d1117] px-4 py-10">
          <span className="text-3xl leading-none">{dropdownMeta?.emoji ?? '🛢️'}</span>
          <p className="text-sm font-bold text-white">
            {bi(
              `شیکاری بۆ ${dropdownMeta?.label ?? 'ئەم ئامرازە'} هێشتا بەردەست نییە`,
              `${dropdownMeta?.label ?? 'This asset'} analysis isn't available yet`,
            )}
          </p>
          <p className="text-[11px] text-[#848e9c] max-w-[260px]">
            {bi(
              'تکایە ئامرازێکی پشتگیریکراو هەڵبژێرە لە لیستەکە (وەک زێڕ یان بیتکۆین).',
              'Please pick a supported asset from the dropdown (e.g. Gold or Bitcoin).',
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold text-white flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#f0b90b]" /> {bi('سیگناڵە زیندووەکان', 'Live Signals')}
          </h1>
          <p className="text-[11px] text-[#848e9c]">
            {bi('تەکنیکی + هەواڵ + دانیشتنی بازاڕ', 'Technical + News + Market session')}
            {refreshedAt && ` · ${bi('نوێدەبێتەوە هەر ٥ خولەک', 'auto · 5 min')}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setDebug((d) => !d)}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-bold"
            style={{ backgroundColor: debug ? '#0ecb8122' : '#1a1e2e', color: debug ? '#0ecb81' : '#848e9c' }}
          >
            <Bug className="h-3.5 w-3.5" /> {bi('دیباگ', 'Debug')}
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#1a1e2e] hover:bg-[#252a3a] text-xs font-bold text-[#f0b90b] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Macro context chips */}
      <div className="flex flex-wrap gap-2">
        {macroChip('DXY', dxyTxt, dxyColor, DollarSign)}
        <div className="flex items-center gap-1.5 rounded-lg bg-[#0a0e17] border border-[#1a1e2e] px-2.5 py-1.5">
          <Gauge className="h-3.5 w-3.5" style={{ color: fgColor }} />
          <span className="text-[10px] text-[#848e9c]">{bi('ترس/چاوبڕکێ', 'Fear/Greed')}</span>
          <span className="text-[11px] font-bold tabular-nums" style={{ color: fgColor }}>{fgTxt}</span>
          <span className="text-[9px] font-semibold text-[#5b6472] bg-[#1a1e2e] rounded px-1 py-0.5 leading-none">{fgSource}</span>
        </div>
        {macroChip('S&P 500', spxTxt, spxColor, LineChart)}
      </div>



      {/* Timeframe selector */}
      <div className="grid grid-cols-6 gap-1.5">
        {SIGNAL_TIMEFRAMES.map((t) => (
          <button
            key={t}
            onClick={() => setTf(t)}
            className={`rounded-lg border py-2 text-xs font-bold transition-colors ${tf === t ? 'border-[#0ecb81] bg-[#0ecb8114] text-[#0ecb81]' : 'border-[#1a1e2e] bg-[#0a0e17] text-[#848e9c]'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Signal card */}
      <SignalCard signal={signal} loading={loading && !signal} emoji={meta.emoji} />

      {/* Higher-TF confluence conflict warning */}
      {signal?.confluenceAlignment === 'conflicting' && (
        <div className="flex items-start gap-2 rounded-lg border border-[#f0b90b55] bg-[#f0b90b14] px-3 py-2">
          <span className="text-sm leading-none mt-0.5">⚠️</span>
          <div className="text-[11px] leading-snug text-[#f0b90b]">
            {bi(
              `بەرامبەر ئاراستەی کاتە بەرزەکانە (${signal.confluenceDebug.confScore}٪ ${signal.confluenceDebug.confDir === 'down' ? 'دابەزین' : 'بەرزبوونەوە'})`,
              `Conflicts with higher-TF trend (${signal.confluenceDebug.confScore}% ${signal.confluenceDebug.confDir === 'down' ? 'bearish' : 'bullish'})`,
            )}
          </div>
        </div>
      )}

      {/* Multi-timeframe strip */}
      {signal && (
        <div className="rounded-xl bg-[#0d1117] border border-[#1a1e2e] p-3">
          <div className="text-[10px] font-bold text-[#848e9c] mb-2">
            {bi('ئاراستەی فرە-کاتی', 'Multi-timeframe trend')}
            {signal.conflict && <span className="ml-2 text-[#f0b90b]">{bi('· ناکۆکی', '· conflict')}</span>}
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {signal.perTF.map((t) => (
              <div key={t.label} className={`flex flex-col items-center gap-1 rounded-lg border py-2 ${t.label === tf ? 'border-[#f0b90b]' : 'border-[#1a1e2e]'} bg-[#0a0e17]`}>
                <span className="text-[10px] font-bold text-[#848e9c]">{t.label}</span>
                <span className="text-base leading-none">{trendArrow(t.dir)}</span>
                <span className="text-[9px]" style={{ color: dirColor(t.dir) }}>
                  {t.dir === 'up' ? 'Bull' : t.dir === 'down' ? 'Bear' : 'Flat'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Debug: raw indicator values */}
      {debug && signal && (
        <div className="rounded-xl bg-[#08131a] border border-[#1f3a2e] p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#0ecb81] mb-2">
            <Bug className="h-3.5 w-3.5" /> {bi('بەهای خاو', 'Raw values')} ({tf})
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] tabular-nums">
            <div className="flex justify-between"><span className="text-[#848e9c]">RSI</span><span className="text-white font-bold">{signal.rsi?.toFixed(1) ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-[#848e9c]">Score</span><span className="text-white font-bold">{signal.score}</span></div>
            <div className="flex justify-between"><span className="text-[#848e9c]">MACD</span><span className="text-white font-bold">{signal.macd?.macd.toFixed(3) ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-[#848e9c]">Signal</span><span className="text-white font-bold">{signal.macd?.signal.toFixed(3) ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-[#848e9c]">EMA20</span><span className="text-white font-bold">{signal.ema20?.toFixed(signal.decimals) ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-[#848e9c]">EMA50</span><span className="text-white font-bold">{signal.ema50?.toFixed(signal.decimals) ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-[#848e9c]">ATR</span><span className="text-white font-bold">{signal.atr.toFixed(signal.decimals)}</span></div>
            <div className="flex justify-between"><span className="text-[#848e9c]">Signal Confidence</span><span className="text-white font-bold">{signal.confidence}%</span></div>
            <div className="flex justify-between"><span className="text-[#848e9c]">TF Agreement</span><span className="text-white font-bold">{signal.confluenceDebug.confScore}% {signal.confluenceDebug.confDir}</span></div>

            <div className="flex justify-between"><span className="text-[#848e9c]">Damp</span><span className="text-white font-bold">×{signal.confluenceDebug.damp.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-[#848e9c]">Combined</span><span className="text-white font-bold">{signal.confluenceDebug.combinedBefore}→{signal.confluenceDebug.combinedAfter}</span></div>
            <div className="flex justify-between"><span className="text-[#848e9c]">Align</span><span className="text-white font-bold">{signal.confluenceAlignment}</span></div>
          </div>
        </div>
      )}

      {/* Cross-engine parity check (Confluence vs Signals vs Telegram) */}
      <SignalParityCheck asset={asset} />

      {/* Per-timeframe outcome timeline (Telegram cascade legs) */}
      <LegOutcomeTimeline />





      <p className="text-[10px] text-[#848e9c] leading-relaxed pb-2">
        {bi('ئەمە یارمەتیدەرە نەک ڕاوێژی دارایی. هەمیشە Stop Loss بەکاربهێنە.', 'Guidance only, not financial advice. Always use a Stop Loss.')}
      </p>
    </div>
  );
}
