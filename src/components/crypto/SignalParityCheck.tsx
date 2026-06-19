import { useCallback, useState } from 'react';
import { ShieldCheck, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { AssetKey } from '@/lib/signalEngine';
import {
  runSignalParity,
  ParityResult,
  ParityRow,
  ParitySource,
  label as sourceLabel,
} from '@/lib/signalParity';

const C_BULL = '#0ecb81';
const C_BEAR = '#f6465d';
const C_MUTED = '#848e9c';

/** Assets that exist in all three engines (Confluence + Signals + Telegram). */
const PARITY_ASSETS: AssetKey[] = ['gold', 'btc'];

function statusMeta(status: ParityResult['status']) {
  switch (status) {
    case 'pass':
      return { color: C_BULL, Icon: CheckCircle2, en: 'PASS', ku: 'سەرکەوتوو' };
    case 'warn':
      return { color: '#f0b90b', Icon: AlertTriangle, en: 'WARN', ku: 'ئاگاداری' };
    case 'fail':
      return { color: C_BEAR, Icon: XCircle, en: 'FAIL', ku: 'شکست' };
    default:
      return { color: C_MUTED, Icon: ShieldCheck, en: '—', ku: '—' };
  }
}

function fmt(n: number, decimals: number): string {
  if (!Number.isFinite(n) || n === 0) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function sideColor(side: ParityRow['side']): string {
  return side === 'buy' ? C_BULL : side === 'sell' ? C_BEAR : C_MUTED;
}

export function SignalParityCheck({ asset }: { asset: AssetKey }) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);

  const [result, setResult] = useState<ParityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const supported = PARITY_ASSETS.includes(asset);
  const decimals = asset === 'btc' ? 0 : 2;

  const run = useCallback(async () => {
    if (!supported) return;
    setLoading(true);
    try {
      const r = await runSignalParity(asset);
      setResult(r);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [asset, supported]);

  if (!supported) {
    return (
      <div className="rounded-xl bg-[#0d1117] border border-[#1a1e2e] p-3">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#848e9c]">
          <ShieldCheck className="h-3.5 w-3.5" />
          {bi('پشکنینی هاوتایی ئەنجن', 'Engine parity check')}
        </div>
        <p className="mt-1.5 text-[10px] text-[#848e9c] leading-relaxed">
          {bi(
            'تەنها بۆ زێڕ و بیتکۆین بەردەستە (هەر سێ ئەنجنیان هەیە).',
            'Available for Gold & Bitcoin only (the assets present in all three engines).',
          )}
        </p>
      </div>
    );
  }

  const sm = result ? statusMeta(result.status) : statusMeta('pending');

  return (
    <div className="rounded-xl bg-[#0d1117] border border-[#1a1e2e] p-3 space-y-3">
      {/* Header + run */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[12px] font-extrabold text-white">
            <ShieldCheck className="h-4 w-4 text-[#f0b90b]" />
            {bi('پشکنینی هاوتایی ئەنجن', 'Engine Parity Check')}
          </div>
          <p className="text-[10px] text-[#848e9c] leading-snug mt-0.5">
            {bi(
              'بەراوردی Entry/SL/TP لە نێوان Confluence + Signals + Telegram (M15)',
              'Confluence vs Signals vs Telegram · Entry/SL/TP @ M15',
            )}
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#1a1e2e] hover:bg-[#252a3a] text-xs font-bold text-[#f0b90b] disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? bi('دەپشکنرێت…', 'Checking…') : bi('پشکنین', 'Verify')}
        </button>
      </div>

      {/* Status banner */}
      {result && (
        <div
          className="flex items-start gap-2 rounded-lg px-3 py-2 border"
          style={{ backgroundColor: `${sm.color}14`, borderColor: `${sm.color}55` }}
        >
          <sm.Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: sm.color }} />
          <div className="min-w-0">
            <div className="text-[12px] font-extrabold" style={{ color: sm.color }}>
              {bi(sm.ku, sm.en)}
              {result.status !== 'pass' && result.maxRelDiff > 0 && (
                <span className="ml-1.5 font-bold tabular-nums">
                  Δ {(result.maxRelDiff * 100).toFixed(2)}%
                </span>
              )}
            </div>
            <p className="text-[10px] text-[#c7ccd6] leading-snug mt-0.5">{result.summary}</p>
          </div>
        </div>
      )}

      {/* Comparison table */}
      {result && (
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] tabular-nums border-collapse">
            <thead>
              <tr className="text-[#848e9c]">
                <th className="text-left font-bold py-1 pr-2">{bi('ئەنجن', 'Engine')}</th>
                <th className="text-left font-bold py-1 px-1">{bi('ئاراستە', 'Dir')}</th>
                <th className="text-right font-bold py-1 px-1">{bi('چوونەژوور', 'Entry')}</th>
                <th className="text-right font-bold py-1 px-1">SL</th>
                <th className="text-right font-bold py-1 px-1">TP1</th>
                <th className="text-right font-bold py-1 px-1">TP2</th>
                <th className="text-right font-bold py-1 pl-1">R:R</th>
              </tr>
            </thead>
            <tbody>
              {(['confluence', 'signals', 'telegram'] as ParitySource[]).map((src) => {
                const row = result.rows.find((r) => r.source === src);
                if (!row) return null;
                return (
                  <tr key={src} className="border-t border-[#1a1e2e]">
                    <td className="text-left py-1.5 pr-2 font-bold text-white">{sourceLabel(src)}</td>
                    {row.available ? (
                      <>
                        <td className="text-left py-1.5 px-1 font-bold" style={{ color: sideColor(row.side) }}>
                          {row.side.toUpperCase()}
                        </td>
                        <td className="text-right py-1.5 px-1 text-white">{fmt(row.entry, decimals)}</td>
                        <td className="text-right py-1.5 px-1" style={{ color: C_BEAR }}>{fmt(row.stopLoss, decimals)}</td>
                        <td className="text-right py-1.5 px-1" style={{ color: C_BULL }}>{fmt(row.takeProfit1, decimals)}</td>
                        <td className="text-right py-1.5 px-1" style={{ color: C_BULL }}>{fmt(row.takeProfit2, decimals)}</td>
                        <td className="text-right py-1.5 pl-1 text-[#f0b90b] font-bold">
                          {row.riskReward ? `${row.riskReward}:1` : '—'}
                        </td>
                      </>
                    ) : (
                      <td colSpan={6} className="text-left py-1.5 px-1 text-[#848e9c] italic">
                        {bi('بەردەست نییە', 'unavailable')}
                        {row.note ? ` — ${row.note}` : ''}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <p className="text-[9px] text-[#848e9c] leading-relaxed">
          {bi(
            'هەمووی ATR-بنەما (SL = ١.٥×ATR، TP1 = ١.٥R، TP2 = ٣R). جیاوازی بچووک لە نرخی زیندوو دێت، نەک لە مۆدێلی مەترسی.',
            'All ATR-based (SL = 1.5×ATR, TP1 = 1.5R, TP2 = 3R). Small gaps come from live-price timing, not the risk model.',
          )}
        </p>
      )}
    </div>
  );
}
