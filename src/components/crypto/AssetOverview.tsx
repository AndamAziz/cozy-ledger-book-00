import { computeBuySellPct } from '@/lib/indicators';
import { OverviewEntry } from '@/lib/overview';
import { useLanguage } from '@/contexts/LanguageContext';
import { Sparkline } from '@/components/crypto/Sparkline';
import { CandlestickChart, Activity, TrendingUp, TrendingDown, Minus, RefreshCw, Loader2 } from 'lucide-react';

interface AssetOverviewProps {
  title: string;
  subtitle: string;
  entries: OverviewEntry[];
  isLoading: boolean;
  /** Open an asset, either on its chart/market view or its analysis view. */
  onOpen: (key: string, mode: 'chart' | 'analysis') => void;
}

const BUY = '#0ecb81';
const SELL = '#f6465d';
const NEUTRAL = '#848e9c';

function OverviewCard({
  entry,
  onOpen,
  bi,
}: {
  entry: OverviewEntry;
  onOpen: (key: string, mode: 'chart' | 'analysis') => void;
  bi: (ku: string, en: string) => string;
}) {
  const pct = entry.summary
    ? computeBuySellPct(entry.summary)
    : { hasData: false, buyPct: 0, sellPct: 0, neutralPct: 0, total: 0 };
  const isUp = entry.change > 0;
  const isFlat = entry.change === 0;
  const trendColor = isFlat ? NEUTRAL : isUp ? BUY : SELL;

  const signal = entry.summary?.signal ?? 'neutral';
  const signalColor = signal === 'buy' ? BUY : signal === 'sell' ? SELL : NEUTRAL;
  const signalLabel =
    signal === 'buy' ? bi('کڕین', 'Buy') : signal === 'sell' ? bi('فرۆشتن', 'Sell') : bi('بێلایەن', 'Neutral');

  return (
    <div className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-3 flex flex-col gap-2.5">
      {/* Header: logo + symbol + price */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl shrink-0">{entry.logo}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white leading-tight truncate">{entry.symbol}</p>
            <p className="text-[10px] text-[#848e9c] truncate">{entry.name}</p>
          </div>
        </div>
        <div className="text-end shrink-0">
          <p className="text-sm font-bold text-white tabular-nums">
            ${entry.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: entry.price < 1 ? 6 : 2 })}
          </p>
          <p className="text-[11px] font-semibold tabular-nums flex items-center justify-end gap-0.5" style={{ color: trendColor }}>
            {isFlat ? <Minus className="h-3 w-3" /> : isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {isFlat ? '0.00%' : `${isUp ? '+' : ''}${entry.change.toFixed(2)}%`}
          </p>
        </div>
      </div>

      {/* Sparkline */}
      <Sparkline data={entry.closes} color={trendColor} />

      {/* Buy/Sell signal */}
      {pct.hasData ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{ color: signalColor, backgroundColor: `${signalColor}1f` }}
            >
              {signalLabel}
            </span>
            <span className="text-[10px] text-[#848e9c] tabular-nums">
              <span style={{ color: BUY }}>{pct.buyPct}%</span>
              {' · '}
              <span style={{ color: NEUTRAL }}>{pct.neutralPct}%</span>
              {' · '}
              <span style={{ color: SELL }}>{pct.sellPct}%</span>
            </span>
          </div>
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-[#1a1e2e]">
            <div style={{ width: `${pct.buyPct}%`, backgroundColor: BUY }} />
            <div style={{ width: `${pct.neutralPct}%`, backgroundColor: NEUTRAL }} />
            <div style={{ width: `${pct.sellPct}%`, backgroundColor: SELL }} />
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-[#848e9c] py-1.5 text-center">{bi('داتای شیکاری بەردەست نییە', 'No signal data')}</p>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => onOpen(entry.key, 'chart')}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-[#1a1e2e] text-[11px] font-bold text-white hover:bg-[#252a3a] active:scale-95 transition"
        >
          <CandlestickChart className="h-3.5 w-3.5" />
          {bi('چارت', 'Chart')}
        </button>
        <button
          onClick={() => onOpen(entry.key, 'analysis')}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-[#f0b90b] text-[11px] font-bold text-black hover:brightness-110 active:scale-95 transition"
        >
          <Activity className="h-3.5 w-3.5" />
          {bi('شیکاری', 'Analysis')}
        </button>
      </div>
    </div>
  );
}

/** At-a-glance overview grid: price, change, sparkline + Buy/Sell signal per asset. */
export function AssetOverview({ title, subtitle, entries, isLoading, onOpen }: AssetOverviewProps) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' ? en : ku);

  return (
    <div className="flex-1 flex flex-col bg-[#0a0e17] overflow-y-auto">
      <div className="px-4 pt-4 pb-3 border-b border-[#1a1e2e] flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white truncate">{title}</h2>
          <p className="text-xs text-[#848e9c] truncate">{subtitle}</p>
        </div>
        {isLoading && <Loader2 className="h-4 w-4 text-[#f0b90b] animate-spin shrink-0" />}
      </div>

      <div className="flex-1 p-3">
        {entries.length === 0 && isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#848e9c]">
            <RefreshCw className="h-7 w-7 animate-spin mb-3" />
            <p className="text-sm">{bi('بارکردنی پوختەی شیکاری...', 'Loading analysis overview...')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {entries.map((entry) => (
              <OverviewCard key={entry.key} entry={entry} onOpen={onOpen} bi={bi} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
