import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { RefreshCw, Bug, Activity, DollarSign, Gauge, LineChart, Info, Flame, Percent } from 'lucide-react';
import { DROPDOWN_ASSETS, DropdownAssetKey, isSupportedAsset } from '@/lib/signalData';
import { SIGNAL_TIMEFRAMES, SignalTF } from '@/lib/signalEngine';
import { useSignalEngine } from '@/hooks/useSignalEngine';
import { SignalCard } from '@/components/crypto/SignalCard';
import { SignalParityCheck } from '@/components/crypto/SignalParityCheck';
import { LegOutcomeTimeline } from '@/components/crypto/LegOutcomeTimeline';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { DirArrow, useValueDirection, type Dir } from '@/components/crypto/DirIndicator';
import { computeResult, isHighImpactUsdEventSoon, type Timeframe } from '@/lib/resultIndicator';

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

/** Small ⓘ icon with a tooltip that opens on hover, tap and keyboard (mobile-friendly). */
function InfoTip({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            aria-expanded={open}
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
            className="inline-flex items-center justify-center text-[#5b6472] hover:text-[#848e9c] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#848e9c] rounded"
          >
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          role="tooltip"
          className="max-w-[220px] border-[#1a1e2e] bg-[#0a0e17] text-[11px] leading-snug text-[#c7ccd6]"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}



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

  const { meta, signal, macro, loading, refreshedAt, stale, refresh } = useSignalEngine(engineAsset, tf);

  // Guard against duplicate refreshes: ignore taps while one is in flight and
  // enforce a short cooldown (debounce) between manual refreshes.
  const REFRESH_COOLDOWN_MS = 3000;
  const refreshingRef = useRef(false);
  const lastRefreshRef = useRef(0);
  const [cooling, setCooling] = useState(false);
  const handleRefresh = useCallback(() => {
    if (refreshingRef.current || loading) return;
    if (Date.now() - lastRefreshRef.current < REFRESH_COOLDOWN_MS) return;
    refreshingRef.current = true;
    lastRefreshRef.current = Date.now();
    setCooling(true);
    Promise.resolve(refresh()).finally(() => {
      refreshingRef.current = false;
      window.setTimeout(() => setCooling(false), REFRESH_COOLDOWN_MS);
    });
  }, [refresh, loading]);
  const refreshDisabled = loading || cooling;

  // Remember the last successfully fetched macro values so a failed refresh can
  // keep showing a meaningful number (with a ⚠️ stale badge) instead of "—".
  const lastDxyRef = useRef<number | null>(null);
  const lastFgRef = useRef<number | null>(null);
  const lastSpxRef = useRef<number | null>(null);
  const lastVixRef = useRef<number | null>(null);
  const lastU10yRef = useRef<number | null>(null);
  const lastU10yChgRef = useRef<number | null>(null);
  useEffect(() => { if (macro.dxyChangePct != null) lastDxyRef.current = macro.dxyChangePct; }, [macro.dxyChangePct]);
  useEffect(() => { if (macro.fearGreed != null) lastFgRef.current = macro.fearGreed; }, [macro.fearGreed]);
  useEffect(() => { if (macro.spxChangePct != null) lastSpxRef.current = macro.spxChangePct; }, [macro.spxChangePct]);
  useEffect(() => { if (macro.vix != null) lastVixRef.current = macro.vix; }, [macro.vix]);
  useEffect(() => { if (macro.us10y != null) lastU10yRef.current = macro.us10y; }, [macro.us10y]);
  useEffect(() => { if (macro.us10yChangePct != null) lastU10yChgRef.current = macro.us10yChangePct; }, [macro.us10yChangePct]);

  const dxyVal = macro.dxyChangePct ?? lastDxyRef.current;
  const dxyStale = macro.dxyChangePct == null && lastDxyRef.current != null;
  const fgVal = macro.fearGreed ?? lastFgRef.current;
  const fgStale = macro.fearGreed == null && lastFgRef.current != null;
  const spxVal = macro.spxChangePct ?? lastSpxRef.current;
  const spxStale = macro.spxChangePct == null && lastSpxRef.current != null;
  const vixVal = macro.vix ?? lastVixRef.current;
  const vixStale = macro.vix == null && lastVixRef.current != null;
  const u10yVal = macro.us10y ?? lastU10yRef.current;
  const u10yStale = macro.us10y == null && lastU10yRef.current != null;
  const u10yChg = macro.us10yChangePct ?? lastU10yChgRef.current;

  const StaleBadge = ({ label }: { label: string }) => {
    const [open, setOpen] = useState(false);
    const msg = bi('بەهای کۆن', 'Stale value');
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip open={open} onOpenChange={setOpen}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${label}: ${msg}`}
              aria-expanded={open}
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
              onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
              className="inline-flex items-center justify-center text-[9px] leading-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#848e9c] rounded"
            >
              ⚠️
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            role="tooltip"
            className="max-w-[220px] border-[#1a1e2e] bg-[#0a0e17] text-[11px] leading-snug text-[#c7ccd6]"
          >
            {msg}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const macroChip = (
    label: string,
    value: string,
    color: string,
    Icon: typeof DollarSign,
    tip: string,
    stale: boolean,
  ) => (
    <div className="flex items-center gap-1.5 rounded-lg bg-[#0a0e17] border border-[#1a1e2e] px-2.5 py-1.5">
      <Icon className="h-3.5 w-3.5" style={{ color }} />
      <span className="text-[10px] text-[#848e9c]">{label}</span>
      <span className="text-[11px] font-bold tabular-nums" style={{ color }}>{value}</span>
      {stale && <StaleBadge label={label} />}
      <InfoTip text={tip} label={bi(`زانیاری ${label}`, `${label} info`)} />
    </div>
  );


  const dxyTxt = dxyVal == null ? '—' : `${dxyVal > 0 ? '+' : ''}${dxyVal.toFixed(2)}%`;
  // DXY ↑ strengthens the dollar = bad for gold → red; ↓ = good for gold → green.
  const dxyColor = dxyVal == null ? C_MUTED : dxyVal > 0 ? C_BEAR : C_BULL;
  const fgTxt = fgVal == null ? '—' : String(fgVal);
  // Semantic for gold/risk: <40 fear (caution) red, 40-60 neutral yellow, >60 greed (risk-on) green.
  const fgColor = fgVal == null ? C_MUTED : fgVal < 40 ? C_BEAR : fgVal > 60 ? C_BULL : '#f0b90b';
  // BTC uses the alternative.me crypto index; everything else uses CNN's index.
  const fgSource = engineAsset === 'btc' ? 'alternative.me' : 'CNN';
  const spxTxt = spxVal == null ? '—' : `${spxVal > 0 ? '+' : ''}${spxVal.toFixed(2)}%`;
  // S&P ↓ = risk-off, supportive for gold → green; ↑ = risk-on → red.
  const spxColor = spxVal == null ? C_MUTED : spxVal < 0 ? C_BULL : C_BEAR;
  const vixTxt = vixVal == null ? '—' : vixVal.toFixed(2);
  // VIX >20 high fear (risk-off) = good for gold → green; <15 low fear = bad → red; 15-20 neutral yellow.
  const vixColor = vixVal == null ? C_MUTED : vixVal > 20 ? C_BULL : vixVal < 15 ? C_BEAR : '#f0b90b';
  const u10yTxt = u10yVal == null ? '—' : `${u10yVal.toFixed(2)}%`;
  // 10Y yield rising = bad for gold → red; falling = good → green.
  const u10yColor = u10yVal == null || u10yChg == null ? C_MUTED : u10yChg > 0 ? C_BEAR : u10yChg < 0 ? C_BULL : C_MUTED;

  const dxyTip = bi('پێوەری دۆلار — هەڵکشانی دۆلار زێڕ دادەبەزێنێت', 'Dollar index — rising dollar pushes gold down');
  const spxTip = bi('بازاڕی پشک — دابەزینی پشک = ڕیسک-ئۆف = زێڕ بەرز', 'Stock market — falling stocks = risk-off = gold up');
  const fgTip = bi('هەستی CNN — ترس (<٤٠) زۆرجار پشتگیری زێڕ دەکات وەک پەناگەی پارێزراو', 'CNN sentiment — fear (<40) often supports gold as safe haven');
  const vixTip = bi('پێوەری ترس — VIXـی بەرز = پەشۆکانی بازاڕ = زێڕ بەرز', 'Fear gauge — high VIX = market panic = gold up');
  const u10yTip = bi('قازانجی بۆندی خەزانە — هەڵکشانی قازانج = زێڕ دادەبەزێت (بۆند ڕکابەری زێڕ دەکات)', 'Treasury yield — rising yield = gold down (bonds compete with gold)');

  // ---- Result indicator -------------------------------------------------
  // Pure logic lives in src/lib/resultIndicator.ts (unit-tested).
  // Feed the observed multi-timeframe price trend (confluence) so a clearly
  // falling/rising chart can't be overridden by macro safe-haven theory.
  const trend = signal
    ? { dir: signal.confluenceDebug.confDir, strength: signal.confluenceDebug.confScore }
    : undefined;
  const { macroScore, techScore, macroWeight, techWeight, resultScore, resultDir } =
    computeResult(tf as Timeframe, { fgVal, vixVal, spxVal, dxyVal, u10yChg }, signal, trend);

  // High-impact USD event within 15 minutes → caution flag on the badge.
  const newsSoon = isHighImpactUsdEventSoon(signal?.newsRisk);


  const resultColor = resultDir === 'up' ? C_BULL : resultDir === 'down' ? C_BEAR : '#f0b90b';
  const resultEmoji = resultDir === 'up' ? '🟢 ⬆️' : resultDir === 'down' ? '🔴 ⬇️' : '🟡 ➡️';
  const resultLabel =
    resultDir === 'up' ? bi('زێڕ بەرز', 'GOLD UP')
      : resultDir === 'down' ? bi('زێڕ نزم', 'GOLD DOWN')
      : bi('ناوەند', 'NEUTRAL');
  const resultFlash = resultDir !== 'neutral';





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
            {refreshedAt && ` · ${bi('نوێدەبێتەوە هەر ١ خولەک', 'auto · 1 min')}`}
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
            onClick={handleRefresh}
            disabled={refreshDisabled}
            aria-label={bi('نوێکردنەوە', 'Refresh')}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#1a1e2e] hover:bg-[#252a3a] text-xs font-bold text-[#f0b90b] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {bi('نوێکردنەوە', 'Refresh')}
          </button>
        </div>
      </div>

      {/* Macro context chips */}
      <div className="flex flex-wrap gap-2">
        {macroChip('DXY', dxyTxt, dxyColor, DollarSign, dxyTip, dxyStale)}
        <div className="flex items-center gap-1.5 rounded-lg bg-[#0a0e17] border border-[#1a1e2e] px-2.5 py-1.5">
          <Gauge className="h-3.5 w-3.5" style={{ color: fgColor }} />
          <span className="text-[10px] text-[#848e9c]">{bi('ترس/چاوبڕکێ', 'Fear/Greed')}</span>
          <span className="text-[11px] font-bold tabular-nums" style={{ color: fgColor }}>{fgTxt}</span>
          <span className="text-[9px] font-semibold text-[#5b6472] bg-[#1a1e2e] rounded px-1 py-0.5 leading-none">{fgSource}</span>
          {fgStale && <StaleBadge label={bi('ترس/چاوبڕکێ', 'Fear/Greed')} />}
          <InfoTip text={fgTip} label={bi('زانیاری ترس/چاوبڕکێ', 'Fear/Greed info')} />

        </div>
        {macroChip('S&P 500', spxTxt, spxColor, LineChart, spxTip, spxStale)}
        {macroChip('VIX', vixTxt, vixColor, Flame, vixTip, vixStale)}
        {macroChip('US10Y', u10yTxt, u10yColor, Percent, u10yTip, u10yStale)}

        {/* Macro Bias badge — market-sentiment context, NOT the primary trade decision */}
        <div
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${resultFlash ? 'animate-pulse' : ''}`}
          style={{ backgroundColor: `${resultColor}1a`, borderColor: `${resultColor}66` }}
          role="status"
          aria-live="polite"
          aria-label={`${bi('لایەنی ماکرۆ', 'Macro Bias')}: ${resultLabel}${newsSoon ? ` ${bi('ئاگاداری هەواڵ', 'news alert')}` : ''}`}
        >
          <span className="text-[10px] font-bold text-[#848e9c]">{bi('لایەنی ماکرۆ', 'Macro Bias')}</span>
          <span className="text-[11px] leading-none">{resultEmoji}</span>
          <span className="text-[11px] font-extrabold" style={{ color: resultColor }}>{resultLabel}</span>
          {newsSoon && (
            <span title={bi('ڕووداوی گرنگی دۆلار لە ١٥ خولەکدا', 'High-impact USD event within 15 min')}>⚠️</span>
          )}
          <InfoTip
            text={bi('لایەنی ماکرۆ/هەستی بازاڕ — بڕیاری کڕین/فرۆشتن نییە. سیگناڵی سەرەکی لە کارتی سەرەوەیە.', 'Macro / market-sentiment bias — not the buy/sell decision. The primary signal is the card above.')}
            label={bi('زانیاری لایەنی ماکرۆ', 'Macro Bias info')}
          />
        </div>
      </div>

      {/* Stale-data warning: shown when the last refresh is overdue (e.g. the
          tab was backgrounded). The signal may not reflect the live market. */}
      {stale && !loading && (
        <button
          onClick={handleRefresh}
          disabled={refreshDisabled}
          className="flex w-full items-center gap-2 rounded-lg border border-[#f0b90b55] bg-[#f0b90b14] px-3 py-2 text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="text-sm leading-none">⚠️</span>
          <span className="text-[11px] leading-snug text-[#f0b90b]">
            {bi(
              'دراوەکان دەکرێ کۆن بن — دەستبکە بۆ نوێکردنەوە لەگەڵ بازاڕی زیندوو',
              'Data may be stale — tap to refresh with the live market',
            )}
          </span>
        </button>
      )}








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

      {/* Non-M15 viewing note: M15 is the canonical PRIMARY signal (matches Gold Pro) */}
      {tf !== 'M15' && (
        <div className="flex items-start gap-2 rounded-lg border border-[#1a1e2e] bg-[#0a0e17] px-3 py-2">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[#848e9c]" />
          <div className="text-[11px] leading-snug text-[#848e9c]">
            {bi(
              `تەماشای ${tf} دەکەیت — سیگناڵی بنەڕەت (M15) لەوانەیە جیاواز بێت.`,
              `Viewing ${tf} — default signal (M15) may differ.`,
            )}
          </div>
        </div>
      )}

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
