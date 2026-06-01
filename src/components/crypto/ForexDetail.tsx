import { ForexCurrency, CURRENCIES } from '@/lib/forexApi';
import { useLanguage } from '@/contexts/LanguageContext';
import { ArrowUpRight, ArrowDownRight, Minus, RefreshCw } from 'lucide-react';

interface ForexDetailProps {
  currencies: ForexCurrency[];
  selectedCode: string | null;
  isLoading: boolean;
}

export function ForexDetail({ currencies, selectedCode, isLoading }: ForexDetailProps) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' ? en : ku);
  const selected = selectedCode ? currencies.find(c => c.code === selectedCode) : null;
  const meta = selectedCode ? CURRENCIES.find(c => c.code === selectedCode) : null;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0a0e17]">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 text-[#848e9c] mx-auto mb-3 animate-spin" />
          <p className="text-sm text-[#848e9c]">{bi('بارکردنی نرخی دراو...', 'Loading forex rates...')}</p>
        </div>
      </div>
    );
  }

  if (!selected || !meta) {
    return (
      <div className="flex-1 flex flex-col bg-[#0a0e17]">
        {/* Overview grid */}
        <div className="p-4 border-b border-[#1a1e2e]">
          <h2 className="text-lg font-bold text-white mb-1">🇺🇸 {bi('USD — نرخی دراوی بیانی', 'USD — Foreign Exchange Rates')}</h2>
          <p className="text-xs text-[#848e9c]">{bi('دراوێک هەڵبژێرە بۆ وردەکاری • نرخی ڕاستەوخۆ', 'Select a currency to see details • Live real-time rates')}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {currencies.map(c => {
              const isPositive = c.change > 0;
              const isNeutral = c.change === 0;
              return (
                <div key={c.code} className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-3 hover:border-[#2a2e3e] transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{c.flag}</span>
                    <span className="text-sm font-bold text-white">{c.code}</span>
                  </div>
                  <p className="text-xs text-[#848e9c] mb-1 truncate">{c.name}</p>
                  <p className="text-sm font-semibold text-white tabular-nums">
                    {c.rate >= 1000 ? c.rate.toLocaleString(undefined, { maximumFractionDigits: 0 }) : c.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </p>
                  <div className={`flex items-center gap-1 mt-1 text-[11px] font-medium ${
                    isNeutral ? 'text-[#848e9c]' : isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
                  }`}>
                    {isNeutral ? <Minus className="h-3 w-3" /> : isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {isNeutral ? bi('بێ گۆڕان', 'No change') : `${isPositive ? '+' : ''}${c.change.toFixed(2)}%`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Detailed view for a selected currency
  const isPositive = selected.change > 0;
  const isNeutral = selected.change === 0;

  // Cross rates: show how this currency converts to other major ones
  const crossCurrencies = currencies.filter(c => c.code !== selectedCode).slice(0, 12);

  return (
    <div className="flex-1 flex flex-col bg-[#0a0e17] overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-[#1a1e2e]">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-3xl">{meta.flag}</span>
          <div>
            <h2 className="text-xl font-bold text-white">{selected.code}/USD</h2>
            <p className="text-sm text-[#848e9c]">{meta.name}</p>
          </div>
        </div>
        
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold text-[#f0b90b] tabular-nums">
            {selected.rate >= 1000 
              ? selected.rate.toLocaleString(undefined, { maximumFractionDigits: 2 }) 
              : selected.rate.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })}
          </span>
          <span className={`flex items-center gap-1 text-sm font-semibold ${
            isNeutral ? 'text-[#848e9c]' : isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
          }`}>
            {isNeutral ? <Minus className="h-4 w-4" /> : isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            {isNeutral ? '0.00%' : `${isPositive ? '+' : ''}${selected.change.toFixed(2)}%`}
          </span>
        </div>
      </div>

      {/* Conversion calculator */}
      <div className="p-4 border-b border-[#1a1e2e]">
        <h3 className="text-sm font-semibold text-white mb-3">{bi('گۆڕینی خێرا', 'Quick Conversion')}</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-3">
            <p className="text-[10px] text-[#848e9c] uppercase mb-1">🇺🇸 1 USD =</p>
            <p className="text-lg font-bold text-white tabular-nums">
              {selected.rate >= 1000 
                ? selected.rate.toLocaleString(undefined, { maximumFractionDigits: 2 })
                : selected.rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              <span className="text-sm text-[#848e9c] ml-1">{selected.code}</span>
            </p>
          </div>
          <div className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-3">
            <p className="text-[10px] text-[#848e9c] uppercase mb-1">{meta.flag} 1 {selected.code} =</p>
            <p className="text-lg font-bold text-white tabular-nums">
              {(1 / selected.rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
              <span className="text-sm text-[#848e9c] ml-1">USD</span>
            </p>
          </div>
        </div>
      </div>

      {/* Common amounts */}
      <div className="p-4 border-b border-[#1a1e2e]">
        <h3 className="text-sm font-semibold text-white mb-3">{bi('بڕە باوەکان', 'Common Amounts')} (USD → {selected.code})</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[1, 10, 100, 1000].map(amount => (
            <div key={amount} className="bg-[#0d1117] border border-[#1a1e2e] rounded-lg p-2 text-center">
              <p className="text-[10px] text-[#848e9c]">${amount}</p>
              <p className="text-xs font-semibold text-white tabular-nums">
                {(amount * selected.rate).toLocaleString(undefined, { maximumFractionDigits: 2 })} {selected.code}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Cross rates */}
      <div className="p-4">
        <h3 className="text-sm font-semibold text-white mb-3">{bi('نرخی لاپەڕ', 'Cross Rates')} (1 {selected.code})</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {crossCurrencies.map(cross => {
            const crossRate = cross.rate / selected.rate;
            return (
              <div key={cross.code} className="bg-[#0d1117] border border-[#1a1e2e] rounded-lg p-2 flex items-center gap-2">
                <span className="text-base">{cross.flag}</span>
                <div className="min-w-0">
                  <p className="text-[10px] text-[#848e9c]">{cross.code}</p>
                  <p className="text-xs font-semibold text-white tabular-nums truncate">
                    {crossRate >= 1000 
                      ? crossRate.toLocaleString(undefined, { maximumFractionDigits: 2 }) 
                      : crossRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
