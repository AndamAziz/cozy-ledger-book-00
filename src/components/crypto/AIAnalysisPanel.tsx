import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  analyzeAsset,
  getSessionStatuses,
  AssetAnalysis,
  SessionStatus,
  TFTrend,
  TradeSetup,
} from '@/lib/aiAnalysis';
import { RefreshCw, TrendingUp, TrendingDown, Minus, Target, Clock, Layers, Gauge, Bug } from 'lucide-react';

interface Props {
  btcPrice: number;
  goldPrice: number;
}

const C_BULL = '#0ecb81';
const C_BEAR = '#f6465d';
const C_NEUTRAL = '#848e9c';

function trendArrow(dir: 'up' | 'down' | 'neutral'): string {
  return dir === 'up' ? '⬆️' : dir === 'down' ? '⬇️' : '↔️';
}

function dirColor(dir: 'up' | 'down' | 'neutral'): string {
  return dir === 'up' ? C_BULL : dir === 'down' ? C_BEAR : C_NEUTRAL;
}

/** Map a 0..100 confluence score to a strength tier. */
function signalStrength(score: number): { key: 'strong' | 'moderate' | 'weak'; emoji: string; color: string } {
  if (score >= 75) return { key: 'strong', emoji: '⚡', color: C_BULL };
  if (score >= 50) return { key: 'moderate', emoji: '🔶', color: '#f0b90b' };
  return { key: 'weak', emoji: '⚠️', color: C_NEUTRAL };
}

/** Compact relative-time label, e.g. "5m", "2h", "1d". */
function fmtAgo(ts: number | null): string {
  if (!ts) return '—';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function fmtPrice(n: number, asset: 'btc' | 'gold'): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  return n.toLocaleString(undefined, {
    minimumFractionDigits: asset === 'gold' ? 2 : 0,
    maximumFractionDigits: asset === 'gold' ? 2 : 0,
  });
}

function TFRow({ trends }: { trends: TFTrend[] }) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {trends.map((t) => (
        <div
          key={t.label}
          className="flex flex-col items-center gap-1 rounded-lg bg-[#0a0e17] border border-[#1a1e2e] py-2"
        >
          <span className="text-[10px] font-bold text-[#848e9c]">{t.label}</span>
          <span className="text-base leading-none">{trendArrow(t.dir)}</span>
          <span className="text-[9px]" style={{ color: dirColor(t.dir) }}>
            {t.dir === 'up' ? 'Bull' : t.dir === 'down' ? 'Bear' : 'Flat'}
          </span>
        </div>
      ))}
    </div>
  );
}

function ConfluenceBar({ a, bi }: { a: AssetAnalysis; bi: (ku: string, en: string) => string }) {
  const color = dirColor(a.confluence.dir);
  const strength = signalStrength(a.confluence.score);
  const strengthLabel =
    strength.key === 'strong'
      ? bi('بەهێز', 'Strong')
      : strength.key === 'moderate'
      ? bi('مامناوەند', 'Moderate')
      : bi('لاواز', 'Weak');
  return (
    <div className="rounded-lg bg-[#0a0e17] border border-[#1a1e2e] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#848e9c]">
          <Gauge className="h-3.5 w-3.5" /> Confluence Score
        </span>
        <span className="text-lg font-extrabold" style={{ color }}>
          {a.confluence.score}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#1a1e2e] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${a.confluence.score}%`, backgroundColor: color }}
        />
      </div>
      {/* Signal strength meter */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] font-bold text-[#848e9c]">{bi('هێزی سیگناڵ', 'Signal Strength')}</span>
        <span
          className="text-xs font-extrabold px-2 py-0.5 rounded-full"
          style={{ color: strength.color, backgroundColor: `${strength.color}1f` }}
        >
          {strength.emoji} {strengthLabel}
        </span>
      </div>
      <div className="mt-2 text-sm font-bold" style={{ color }}>
        {a.confluence.label}
      </div>
      <div className="mt-1 flex gap-3 text-[10px] text-[#848e9c]">
        <span className="text-[#0ecb81]">⬆️ {a.confluence.upCount}</span>
        <span className="text-[#f6465d]">⬇️ {a.confluence.downCount}</span>
        <span>↔️ {a.confluence.neutralCount}</span>
      </div>
      {/* Last direction change timestamp */}
      <div className="mt-2 pt-2 border-t border-[#1a1e2e] flex items-center gap-1.5 text-[10px] text-[#848e9c]">
        <Clock className="h-3 w-3" />
        {bi('ئاراستە گۆڕا', 'Signal changed')}{' '}
        <span className="text-white font-bold">{fmtAgo(a.signalChangedAt)}</span>{' '}
        {bi('لەمەوبەر', 'ago')}
      </div>
    </div>
  );
}

function LevelsBlock({ a, asset }: { a: AssetAnalysis; asset: 'btc' | 'gold' }) {
  return (
    <div className="rounded-lg bg-[#0a0e17] border border-[#1a1e2e] p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#848e9c] mb-2">
        <Layers className="h-3.5 w-3.5" /> Key Levels
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] text-[#f6465d] font-bold mb-1">Resistance</div>
          {a.levels.resistances.length ? (
            a.levels.resistances.map((r, i) => (
              <div key={i} className="text-xs text-[#f6465d]/90 tabular-nums">
                ${fmtPrice(r, asset)}
              </div>
            ))
          ) : (
            <div className="text-xs text-[#848e9c]">—</div>
          )}
        </div>
        <div>
          <div className="text-[10px] text-[#0ecb81] font-bold mb-1">Support</div>
          {a.levels.supports.length ? (
            a.levels.supports.map((s, i) => (
              <div key={i} className="text-xs text-[#0ecb81]/90 tabular-nums">
                ${fmtPrice(s, asset)}
              </div>
            ))
          ) : (
            <div className="text-xs text-[#848e9c]">—</div>
          )}
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-[#1a1e2e] text-[11px] text-[#848e9c]">
        Current: <span className="text-white font-bold tabular-nums">${fmtPrice(a.price, asset)}</span>
      </div>
    </div>
  );
}

function SetupBlock({ setup, asset }: { setup: TradeSetup; asset: 'btc' | 'gold' }) {
  if (setup.side === 'none') {
    return (
      <div className="rounded-lg bg-[#0a0e17] border border-[#1a1e2e] p-3 text-xs text-[#848e9c]">
        No clear setup — timeframes are mixed. Wait for alignment.
      </div>
    );
  }
  const buy = setup.side === 'buy';
  const color = buy ? C_BULL : C_BEAR;
  return (
    <div className="rounded-lg bg-[#0a0e17] border p-3" style={{ borderColor: `${color}55` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#848e9c]">
          <Target className="h-3.5 w-3.5" /> Trade Setup of the Day
        </span>
        <span className="text-xs font-extrabold px-2 py-0.5 rounded" style={{ color, backgroundColor: `${color}22` }}>
          {buy ? 'BUY' : 'SELL'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-xs">
        <span className="text-[#848e9c]">Entry</span>
        <span className="text-white font-bold tabular-nums text-end">${fmtPrice(setup.entry, asset)}</span>
        <span className="text-[#848e9c]">Stop Loss</span>
        <span className="text-[#f6465d] font-bold tabular-nums text-end">${fmtPrice(setup.stopLoss, asset)}</span>
        <span className="text-[#848e9c]">Take Profit 1</span>
        <span className="text-[#0ecb81] font-bold tabular-nums text-end">${fmtPrice(setup.takeProfit1, asset)}</span>
        <span className="text-[#848e9c]">Take Profit 2</span>
        <span className="text-[#0ecb81] font-bold tabular-nums text-end">${fmtPrice(setup.takeProfit2, asset)}</span>
        <span className="text-[#848e9c]">Risk / Reward</span>
        <span className="font-bold tabular-nums text-end" style={{ color: setup.riskReward >= 1.5 ? C_BULL : C_NEUTRAL }}>
          1 : {setup.riskReward}
        </span>
      </div>
    </div>
  );
}

/** Raw RSI / MACD values per timeframe, shown only in debug mode. */
function DebugBlock({ trends, bi }: { trends: TFTrend[]; bi: (ku: string, en: string) => string }) {
  const fmt = (n: number | null | undefined, d = 2) =>
    n == null || !Number.isFinite(n) ? '—' : n.toFixed(d);
  return (
    <div className="rounded-lg bg-[#08131a] border border-[#1f3a2e] p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#0ecb81] mb-2">
        <Bug className="h-3.5 w-3.5" /> {bi('شێوازی دیباگ — بەهای خاو', 'Debug — Raw Values')}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] tabular-nums">
          <thead>
            <tr className="text-[#848e9c] text-left">
              <th className="py-1 pe-2 font-bold">TF</th>
              <th className="py-1 pe-2 font-bold">RSI</th>
              <th className="py-1 pe-2 font-bold">MACD</th>
              <th className="py-1 pe-2 font-bold">Signal</th>
              <th className="py-1 pe-2 font-bold">Hist</th>
              <th className="py-1 pe-2 font-bold">N</th>
              <th className="py-1 font-bold">Dir</th>
            </tr>
          </thead>
          <tbody>
            {trends.map((t) => {
              const rsiColor = t.rsi == null ? '#848e9c' : t.rsi > 70 ? C_BEAR : t.rsi < 30 ? C_BULL : '#fff';
              return (
                <tr key={t.label} className="border-t border-[#142028]">
                  <td className="py-1 pe-2 font-bold text-[#848e9c]">{t.label}</td>
                  <td className="py-1 pe-2 font-bold" style={{ color: rsiColor }}>
                    {fmt(t.rsi, 1)}
                  </td>
                  <td className="py-1 pe-2 text-white">{fmt(t.macd?.macd, 3)}</td>
                  <td className="py-1 pe-2 text-white">{fmt(t.macd?.signal, 3)}</td>
                  <td
                    className="py-1 pe-2 font-bold"
                    style={{ color: (t.macd?.histogram ?? 0) >= 0 ? C_BULL : C_BEAR }}
                  >
                    {fmt(t.macd?.histogram, 3)}
                  </td>
                  <td className="py-1 pe-2 text-[#848e9c]">{t.candleCount}</td>
                  <td className="py-1 text-base leading-none">{trendArrow(t.dir)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[9px] text-[#848e9c] leading-relaxed">
        {bi(
          'بوڵ: RSI>50 و MACD>Signal · بێر: RSI<50 و MACD<Signal · ناکۆکی: ناوەند',
          'Bull: RSI>50 & MACD>Signal · Bear: RSI<50 & MACD<Signal · Disagree: Neutral',
        )}
      </div>
    </div>
  );
}

function AssetCard({
  title,
  logo,
  asset,
  analysis,
  bi,
  debug,
}: {
  title: string;
  logo: string;
  asset: 'btc' | 'gold';
  analysis: AssetAnalysis | null;
  bi: (ku: string, en: string) => string;
  debug: boolean;
}) {
  // Glow the whole card when confluence is strong (>=75%) with a clear direction.
  const strong = !!analysis && analysis.confluence.score >= 75 && analysis.confluence.dir !== 'neutral';
  const glowColor = analysis?.confluence.dir === 'up' ? C_BULL : C_BEAR;
  const cardStyle = strong
    ? { borderColor: glowColor, boxShadow: `0 0 18px ${glowColor}66, inset 0 0 24px ${glowColor}1a` }
    : undefined;
  return (
    <div
      className={`rounded-xl bg-[#0d1117] border p-3 space-y-3 transition-all duration-500 ${strong ? '' : 'border-[#1a1e2e]'}`}
      style={cardStyle}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{logo}</span>
          <span className="text-sm font-extrabold text-white">{title}</span>
        </div>
        {analysis && (
          <span className="flex items-center gap-1 text-[11px] font-bold" style={{ color: dirColor(analysis.confluence.dir) }}>
            {analysis.confluence.dir === 'up' ? <TrendingUp className="h-3.5 w-3.5" /> : analysis.confluence.dir === 'down' ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
            {analysis.confluence.dir === 'up' ? bi('بەرزبوونەوە', 'Bullish') : analysis.confluence.dir === 'down' ? bi('داشکان', 'Bearish') : bi('ناوەند', 'Neutral')}
          </span>
        )}
      </div>

      {!analysis ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-16 rounded-lg bg-[#0a0e17]" />
          <div className="h-20 rounded-lg bg-[#0a0e17]" />
          <div className="h-20 rounded-lg bg-[#0a0e17]" />
        </div>
      ) : (
        <>
          <div>
            <div className="text-[10px] font-bold text-[#848e9c] mb-1.5">{bi('ئاراستەی فرە-کاتی', 'Multi-Timeframe Trend')}</div>
            <TFRow trends={analysis.trends} />
          </div>
          <ConfluenceBar a={analysis} bi={bi} />
          <LevelsBlock a={analysis} asset={asset} />
          <SetupBlock setup={analysis.setup} asset={asset} />
        </>
      )}
    </div>
  );
}

function SessionsBlock({ sessions }: { sessions: SessionStatus[] }) {
  return (
    <div className="rounded-xl bg-[#0d1117] border border-[#1a1e2e] p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#848e9c] mb-2">
        <Clock className="h-3.5 w-3.5" /> Forex Sessions
      </div>
      <div className="grid grid-cols-3 gap-2">
        {sessions.map((s) => (
          <div
            key={s.name}
            className="rounded-lg border p-2 text-center"
            style={{
              borderColor: s.active ? `${C_BULL}66` : '#1a1e2e',
              backgroundColor: s.active ? `${C_BULL}11` : '#0a0e17',
            }}
          >
            <div className="text-lg leading-none">{s.emoji}</div>
            <div className="text-[11px] font-bold text-white mt-1">{s.name}</div>
            <div className="text-[10px] mt-0.5" style={{ color: s.active ? C_BULL : C_NEUTRAL }}>
              {s.active ? '🟢 Open' : '⚪ Closed'}
            </div>
            <div className="text-[9px] text-[#848e9c] mt-0.5">
              {s.untilOpen ? 'opens in' : 'closes in'} {s.countdown}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AIAnalysisPanel({ btcPrice, goldPrice }: Props) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);
  const [btc, setBtc] = useState<AssetAnalysis | null>(null);
  const [gold, setGold] = useState<AssetAnalysis | null>(null);
  const [sessions, setSessions] = useState<SessionStatus[]>(getSessionStatuses());
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    const [b, g] = await Promise.all([analyzeAsset('btc', btcPrice), analyzeAsset('gold', goldPrice)]);
    setBtc(b);
    setGold(g);
    setLastUpdated(Date.now());
    setLoading(false);
  }, [btcPrice, goldPrice]);

  // Run on mount + every 60s.
  useEffect(() => {
    runAnalysis();
    const id = window.setInterval(runAnalysis, 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Session countdowns tick every 30s.
  useEffect(() => {
    const id = window.setInterval(() => setSessions(getSessionStatuses()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold text-white flex items-center gap-2">
            🤖 {bi('شیکاری زیرەک', 'AI Analysis')}
          </h1>
          <p className="text-[11px] text-[#848e9c]">
            {bi('شیکاری فرە-کاتی بۆ زێڕ و بیتکۆین', 'Multi-timeframe confluence for Gold & Bitcoin')}
            {lastUpdated && ` · ${bi('نوێکرایەوە', 'updated')} ${Math.max(0, Math.round((Date.now() - lastUpdated) / 1000))}s`}
          </p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1a1e2e] hover:bg-[#252a3a] text-xs font-bold text-[#f0b90b] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {bi('نوێکردنەوە', 'Refresh')}
        </button>
      </div>

      <SessionsBlock sessions={sessions} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <AssetCard title="XAU/USD" logo="🥇" asset="gold" analysis={gold} bi={bi} />
        <AssetCard title="BTC/USD" logo="₿" asset="btc" analysis={btc} bi={bi} />
      </div>
    </div>
  );
}
