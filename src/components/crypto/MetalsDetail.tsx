import { useMemo, useState } from 'react';
import { Metal, METALS_META } from '@/lib/metalsApi';
import { useMetalsHistory } from '@/hooks/useMetalsHistory';
import { useLanguage } from '@/contexts/LanguageContext';
import { MetalsChart } from '@/components/crypto/MetalsChart';
import { CryptoAnalysis } from '@/components/crypto/CryptoAnalysis';
import type { OHLCCandle } from '@/lib/krakenApi';
import { ArrowUpRight, ArrowDownRight, Minus, RefreshCw, LineChart, Sparkles } from 'lucide-react';

const RANGE_LABELS: Record<string, string> = {
  '1d': '1D', '5d': '5D', '1mo': '1M', '3mo': '3M', '6mo': '6M', '1y': '1Y', '5y': '5Y',
};

interface MetalsDetailProps {
  metals: Metal[];
  selectedCode: string | null;
  isLoading: boolean;
}

export function MetalsDetail({ metals, selectedCode, isLoading }: MetalsDetailProps) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' ? en : ku);
  const [chartRange, setChartRange] = useState('1d');
  const [view, setView] = useState<'market' | 'analysis'>('market');
  const selected = selectedCode ? metals.find(m => m.code === selectedCode) : null;
  const livePrice = selected?.price || 0;
  const { candles: historyCandles, isLoading: historyLoading, error: historyError, refetch: refetchHistory } = useMetalsHistory(selectedCode, chartRange, livePrice);

  // Adapt metals candles (close/high/low) to the OHLC shape the analysis expects
  const ohlcCandles = useMemo<OHLCCandle[]>(
    () => historyCandles.map(c => ({
      time: c.time,
      open: c.close,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: 0,
    })),
    [historyCandles],
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0a0e17]">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 text-[#848e9c] mx-auto mb-3 animate-spin" />
          <p className="text-sm text-[#848e9c]">{bi('بارکردنی نرخەکان...', 'Loading prices...')}</p>
        </div>
      </div>
    );
  }

  const meta = selectedCode ? METALS_META.find(m => m.code === selectedCode) : null;

  if (!selected || !meta) {
    const metalItems = metals.filter(m => m.category === 'metal');
    const oilItems = metals.filter(m => m.category === 'oil');

    const renderCard = (m: Metal) => {
      const isPositive = m.change > 0;
      const isNeutral = m.change === 0;
      const accentColor = m.category === 'oil' ? '#e67e22' : '#d4af37';
      return (
        <div key={m.code} className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-4 hover:border-opacity-30 transition-colors" style={{ borderColor: undefined }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">{m.emoji}</span>
            <div>
              <h3 className="text-base font-bold text-white">{m.name}</h3>
              <p className="text-xs text-[#848e9c]">{m.symbol}</p>
            </div>
          </div>
          <p className="text-2xl font-bold tabular-nums mb-1" style={{ color: accentColor }}>
            ${m.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-[#848e9c] mb-2">{bi('بۆ', 'per')} {m.unit === 'bbl' ? bi('بەرمیل', 'barrel') : bi('ئۆنسی ترۆی', 'troy ounce')}</p>
          <div className={`flex items-center gap-1 text-xs font-medium ${
            isNeutral ? 'text-[#848e9c]' : isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
          }`}>
            {isNeutral ? <Minus className="h-3.5 w-3.5" /> : isPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {isNeutral ? 'No change' : `${isPositive ? '+' : ''}${m.change.toFixed(2)}%`}
          </div>
        </div>
      );
    };

    return (
      <div className="flex-1 flex flex-col bg-[#0a0e17]">
        <div className="p-4 border-b border-[#1a1e2e]">
          <h2 className="text-lg font-bold text-white mb-1">📊 Commodities — Live Spot Prices</h2>
          <p className="text-xs text-[#848e9c]">Select a commodity for details • Live real-time prices</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Precious Metals */}
          <div>
            <h3 className="text-xs font-bold text-[#d4af37] uppercase tracking-wider mb-3">🏆 Precious Metals</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {metalItems.map(renderCard)}
            </div>
          </div>
          {/* Crude Oil */}
          <div>
            <h3 className="text-xs font-bold text-[#e67e22] uppercase tracking-wider mb-3">🛢️ Crude Oil</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {oilItems.map(renderCard)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Detail view
  const isPositive = selected.change > 0;
  const isNeutral = selected.change === 0;
  const isOil = selected.category === 'oil';
  const accentColor = isOil ? '#e67e22' : '#d4af37';
  const otherItems = metals.filter(m => m.code !== selectedCode);

  return (
    <div className="flex-1 flex flex-col bg-[#0a0e17] overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-[#1a1e2e]">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-4xl">{meta.emoji}</span>
          <div>
            <h2 className="text-xl font-bold text-white">{meta.symbol}</h2>
            <p className="text-sm text-[#848e9c]">{meta.name} Spot Price</p>
          </div>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold tabular-nums" style={{ color: accentColor }}>
            ${selected.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-[#848e9c]">/ {isOil ? 'barrel' : 'troy oz'}</span>
          <span className={`flex items-center gap-1 text-sm font-semibold ${
            isNeutral ? 'text-[#848e9c]' : isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
          }`}>
            {isNeutral ? <Minus className="h-4 w-4" /> : isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            {isNeutral ? '0.00%' : `${isPositive ? '+' : ''}${selected.change.toFixed(2)}%`}
          </span>
        </div>
      </div>

      {/* View toggle: Market vs Analysis */}
      <div role="radiogroup" aria-label="View / نمایش" className="flex gap-2 p-3 border-b border-[#1a1e2e]">
        <button
          type="button"
          role="radio"
          aria-checked={view === 'market'}
          aria-label="Market view / بازاڕ"
          onClick={() => setView('market')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0d1117] ${
            view === 'market' ? 'bg-[#1a1e2e] text-white' : 'text-[#848e9c] hover:text-white'
          }`}
        >
          <LineChart className="h-3.5 w-3.5" />
          {language === 'en' ? 'Market' : 'بازاڕ'}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={view === 'analysis'}
          aria-label="Analysis view / شیکاری"
          onClick={() => setView('analysis')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0d1117] ${
            view === 'analysis' ? 'bg-[#f0b90b] text-black' : 'text-[#848e9c] hover:text-white'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {language === 'en' ? 'Analysis' : 'شیکاری'}
        </button>
      </div>

      {view === 'analysis' ? (
        <CryptoAnalysis
          symbol={meta.symbol}
          candles={ohlcCandles}
          currentPrice={selected.price}
          change24h={selected.change}
          timeframeLabel={RANGE_LABELS[chartRange] ?? chartRange}
        />
      ) : (
      <>
      {/* Price History Chart */}
      <MetalsChart
        candles={historyCandles}
        isLoading={historyLoading}
        error={historyError}
        onRetry={refetchHistory}
        accentColor={accentColor}
        range={chartRange}
        onRangeChange={setChartRange}
        currentPrice={selected.price}
        name={selected.name}
      />


      <div className="p-4 border-b border-[#1a1e2e]">
        <h3 className="text-sm font-semibold text-white mb-3">
          {isOil ? 'Volume Pricing' : 'Price by Weight'}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {isOil ? [
            { label: '1 Barrel', factor: 1 },
            { label: '10 Barrels', factor: 10 },
            { label: '100 Barrels', factor: 100 },
            { label: '1000 Barrels', factor: 1000 },
          ].map(w => (
            <div key={w.label} className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-3">
              <p className="text-[10px] text-[#848e9c] uppercase mb-1">{w.label}</p>
              <p className="text-sm font-bold text-white tabular-nums">
                ${(selected.price * w.factor).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          )) : [
            { label: '1 Troy Oz', factor: 1 },
            { label: '1 Gram', factor: 1 / 31.1035 },
            { label: '10 Grams', factor: 10 / 31.1035 },
            { label: '1 Kilogram', factor: 1000 / 31.1035 },
          ].map(w => (
            <div key={w.label} className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-3">
              <p className="text-[10px] text-[#848e9c] uppercase mb-1">{w.label}</p>
              <p className="text-sm font-bold text-white tabular-nums">
                ${(selected.price * w.factor).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Investment calculator */}
      <div className="p-4 border-b border-[#1a1e2e]">
        <h3 className="text-sm font-semibold text-white mb-3">Investment Amounts</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[100, 500, 1000, 5000].map(amount => (
            <div key={amount} className="bg-[#0d1117] border border-[#1a1e2e] rounded-lg p-2 text-center">
              <p className="text-[10px] text-[#848e9c]">${amount.toLocaleString()}</p>
              <p className="text-xs font-semibold text-white tabular-nums">
                {isOil 
                  ? `${(amount / selected.price).toFixed(1)} bbl`
                  : `${(amount / selected.price).toFixed(4)} oz`
                }
              </p>
              {!isOil && (
                <p className="text-[9px] text-[#848e9c]">
                  {((amount / selected.price) * 31.1035).toFixed(2)} g
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Other commodities */}
      <div className="p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Other Commodities</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {otherItems.map(m => {
            const mPositive = m.change > 0;
            const mNeutral = m.change === 0;
            return (
              <div key={m.code} className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-3 flex items-center gap-3">
                <span className="text-2xl">{m.emoji}</span>
                <div className="min-w-0">
                  <p className="text-xs text-[#848e9c]">{m.name}</p>
                  <p className="text-sm font-bold text-white tabular-nums">
                    ${m.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <span className={`text-[10px] font-medium ${
                    mNeutral ? 'text-[#848e9c]' : mPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
                  }`}>
                    {mNeutral ? '0.00%' : `${mPositive ? '+' : ''}${m.change.toFixed(2)}%`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
