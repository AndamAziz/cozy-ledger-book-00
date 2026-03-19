import { Metal, METALS_META } from '@/lib/metalsApi';
import { ArrowUpRight, ArrowDownRight, Minus, RefreshCw } from 'lucide-react';

interface MetalsDetailProps {
  metals: Metal[];
  selectedCode: string | null;
  isLoading: boolean;
}

export function MetalsDetail({ metals, selectedCode, isLoading }: MetalsDetailProps) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0a0e17]">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 text-[#848e9c] mx-auto mb-3 animate-spin" />
          <p className="text-sm text-[#848e9c]">Loading metals prices...</p>
        </div>
      </div>
    );
  }

  const selected = selectedCode ? metals.find(m => m.code === selectedCode) : null;
  const meta = selectedCode ? METALS_META.find(m => m.code === selectedCode) : null;

  if (!selected || !meta) {
    // Overview grid
    return (
      <div className="flex-1 flex flex-col bg-[#0a0e17]">
        <div className="p-4 border-b border-[#1a1e2e]">
          <h2 className="text-lg font-bold text-white mb-1">🏆 Precious Metals — Spot Prices</h2>
          <p className="text-xs text-[#848e9c]">Select a metal for details • Prices update every 30s</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {metals.map(m => {
              const isPositive = m.change > 0;
              const isNeutral = m.change === 0;
              return (
                <div key={m.code} className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-4 hover:border-[#d4af37]/30 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">{m.emoji}</span>
                    <div>
                      <h3 className="text-base font-bold text-white">{m.name}</h3>
                      <p className="text-xs text-[#848e9c]">{m.symbol}</p>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-[#d4af37] tabular-nums mb-1">
                    ${m.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] text-[#848e9c] mb-2">per troy ounce</p>
                  <div className={`flex items-center gap-1 text-xs font-medium ${
                    isNeutral ? 'text-[#848e9c]' : isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
                  }`}>
                    {isNeutral ? <Minus className="h-3.5 w-3.5" /> : isPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                    {isNeutral ? 'No change' : `${isPositive ? '+' : ''}${m.change.toFixed(2)}%`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Detail view
  const isPositive = selected.change > 0;
  const isNeutral = selected.change === 0;
  const otherMetals = metals.filter(m => m.code !== selectedCode);

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
          <span className="text-3xl font-bold text-[#d4af37] tabular-nums">
            ${selected.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs text-[#848e9c]">/ troy oz</span>
          <span className={`flex items-center gap-1 text-sm font-semibold ${
            isNeutral ? 'text-[#848e9c]' : isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
          }`}>
            {isNeutral ? <Minus className="h-4 w-4" /> : isPositive ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            {isNeutral ? '0.00%' : `${isPositive ? '+' : ''}${selected.change.toFixed(2)}%`}
          </span>
        </div>
      </div>

      {/* Weight conversions */}
      <div className="p-4 border-b border-[#1a1e2e]">
        <h3 className="text-sm font-semibold text-white mb-3">Price by Weight</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
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

      {/* Quantity calculator */}
      <div className="p-4 border-b border-[#1a1e2e]">
        <h3 className="text-sm font-semibold text-white mb-3">Investment Amounts</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[100, 500, 1000, 5000].map(amount => (
            <div key={amount} className="bg-[#0d1117] border border-[#1a1e2e] rounded-lg p-2 text-center">
              <p className="text-[10px] text-[#848e9c]">${amount.toLocaleString()}</p>
              <p className="text-xs font-semibold text-white tabular-nums">
                {(amount / selected.price).toFixed(4)} oz
              </p>
              <p className="text-[9px] text-[#848e9c]">
                {((amount / selected.price) * 31.1035).toFixed(2)} g
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Other metals comparison */}
      <div className="p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Other Precious Metals</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {otherMetals.map(m => {
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
    </div>
  );
}
