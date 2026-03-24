import { useState, useRef, useEffect } from 'react';
import { Metal } from '@/lib/metalsApi';
import { ArrowUpRight, ArrowDownRight, Minus, RefreshCw } from 'lucide-react';

interface MetalsListProps {
  metals: Metal[];
  selectedCode: string | null;
  onSelectMetal: (code: string) => void;
  isLoading: boolean;
  marketOpen?: boolean;
}

export function MetalsList({ metals, selectedCode, onSelectMetal, isLoading, marketOpen = true }: MetalsListProps) {
  const prevPricesRef = useRef<Map<string, number>>(new Map());
  const [flashMap, setFlashMap] = useState<Map<string, 'up' | 'down'>>(new Map());

  useEffect(() => {
    const newFlash = new Map<string, 'up' | 'down'>();
    metals.forEach(m => {
      const prev = prevPricesRef.current.get(m.code);
      if (prev !== undefined && prev !== m.price) {
        newFlash.set(m.code, m.price > prev ? 'up' : 'down');
      }
      prevPricesRef.current.set(m.code, m.price);
    });
    if (newFlash.size > 0) {
      setFlashMap(newFlash);
      const t = setTimeout(() => setFlashMap(new Map()), 600);
      return () => clearTimeout(t);
    }
  }, [metals]);

  if (isLoading) {
    return (
      <div className="h-full bg-[#0d1117] border-r border-[#1a1e2e] flex items-center justify-center">
        <RefreshCw className="h-5 w-5 text-[#848e9c] animate-spin" />
      </div>
    );
  }

  const metalItems = metals.filter(m => m.category === 'metal');
  const oilItems = metals.filter(m => m.category === 'oil');
  const gasItems = metals.filter(m => m.category === 'gas');

  const renderItem = (m: Metal) => {
    const isSelected = m.code === selectedCode;
    const isPositive = m.change > 0;
    const isNeutral = m.change === 0;
    const flash = flashMap.get(m.code);

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
            <span className={`text-sm font-semibold tabular-nums transition-colors duration-500 ${
              flash === 'up' ? 'text-[#0ecb81]' : flash === 'down' ? 'text-[#f6465d]' : 'text-white'
            }`}>
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
  };

  return (
    <div className="h-full bg-[#0d1117] border-r border-[#1a1e2e] flex flex-col">
      <div className="px-3 py-2 border-b border-[#1a1e2e]">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-[#d4af37] uppercase tracking-wider">Commodities</h3>
          {marketOpen ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#0ecb81]/15 text-[#0ecb81] font-semibold">LIVE</span>
          ) : (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#f6465d]/15 text-[#f6465d] font-semibold animate-pulse">CLOSED</span>
          )}
        </div>
        <p className="text-[10px] text-[#848e9c]">
          {marketOpen ? 'Spot prices • Live' : 'Market closed • Last prices'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Precious Metals section */}
        <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[#d4af37] border-b border-[#1a1e2e] bg-[#d4af37]/5">
          🏆 Precious Metals
        </div>
        {metalItems.map(renderItem)}

        {/* Oil section */}
        <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[#e67e22] border-b border-[#1a1e2e] bg-[#e67e22]/5">
          🛢️ Crude Oil
        </div>
        {oilItems.map(renderItem)}
      </div>
    </div>
  );
}
