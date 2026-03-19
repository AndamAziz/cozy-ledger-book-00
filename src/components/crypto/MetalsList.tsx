import { Metal } from '@/lib/metalsApi';
import { ArrowUpRight, ArrowDownRight, Minus, RefreshCw } from 'lucide-react';

interface MetalsListProps {
  metals: Metal[];
  selectedCode: string | null;
  onSelectMetal: (code: string) => void;
  isLoading: boolean;
}

export function MetalsList({ metals, selectedCode, onSelectMetal, isLoading }: MetalsListProps) {
  if (isLoading) {
    return (
      <div className="h-full bg-[#0d1117] border-r border-[#1a1e2e] flex items-center justify-center">
        <RefreshCw className="h-5 w-5 text-[#848e9c] animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full bg-[#0d1117] border-r border-[#1a1e2e] flex flex-col">
      <div className="px-3 py-2 border-b border-[#1a1e2e]">
        <h3 className="text-xs font-bold text-[#d4af37] uppercase tracking-wider">Precious Metals</h3>
        <p className="text-[10px] text-[#848e9c]">Spot prices vs USD / troy oz</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {metals.map(m => {
          const isSelected = m.code === selectedCode;
          const isPositive = m.change > 0;
          const isNeutral = m.change === 0;

          return (
            <button
              key={m.code}
              onClick={() => onSelectMetal(m.code)}
              className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-b border-[#1a1e2e]/50
                ${isSelected ? 'bg-[#d4af37]/10 border-l-2 border-l-[#d4af37]' : 'hover:bg-[#1a1e2e]/50'}`}
            >
              <span className="text-2xl">{m.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white">{m.code}</span>
                  <span className="text-sm font-semibold text-white tabular-nums">
                    ${m.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[11px] text-[#848e9c]">{m.name}</span>
                  <span className={`flex items-center gap-0.5 text-[11px] font-medium ${
                    isNeutral ? 'text-[#848e9c]' : isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
                  }`}>
                    {isNeutral ? <Minus className="h-3 w-3" /> : isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {isNeutral ? '0.00%' : `${isPositive ? '+' : ''}${m.change.toFixed(2)}%`}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
