import { useState, useMemo, useRef, useEffect } from 'react';
import { ForexCurrency } from '@/lib/forexApi';
import { Skeleton } from '@/components/ui/skeleton';
import { Search } from 'lucide-react';

interface ForexListProps {
  currencies: ForexCurrency[];
  selectedCode: string | null;
  onSelectCurrency: (code: string) => void;
  isLoading: boolean;
}

export function ForexList({ currencies, selectedCode, onSelectCurrency, isLoading }: ForexListProps) {
  const [search, setSearch] = useState('');
  const prevRatesRef = useRef<Map<string, number>>(new Map());
  const [flashMap, setFlashMap] = useState<Map<string, 'up' | 'down'>>(new Map());

  // Track price changes for flash effect
  useEffect(() => {
    const newFlash = new Map<string, 'up' | 'down'>();
    currencies.forEach(c => {
      const prev = prevRatesRef.current.get(c.code);
      if (prev !== undefined && prev !== c.rate) {
        newFlash.set(c.code, c.rate > prev ? 'up' : 'down');
      }
      prevRatesRef.current.set(c.code, c.rate);
    });
    if (newFlash.size > 0) {
      setFlashMap(newFlash);
      const t = setTimeout(() => setFlashMap(new Map()), 600);
      return () => clearTimeout(t);
    }
  }, [currencies]);

  const filtered = useMemo(() => {
    if (!search.trim()) return currencies;
    const q = search.toLowerCase();
    return currencies.filter(c =>
      c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [currencies, search]);

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-r border-[#1a1e2e]">
      {/* Search */}
      <div className="p-2 border-b border-[#1a1e2e]">
        <div className="flex items-center gap-2 bg-[#1a1e2e] rounded-lg px-3 py-2">
          <Search className="h-4 w-4 text-[#848e9c] shrink-0" />
          <input
            type="text"
            placeholder="Search currencies..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm text-white placeholder:text-[#848e9c] outline-none w-full"
          />
        </div>
      </div>

      {/* USD base header */}
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-[#f0b90b] border-b border-[#1a1e2e] bg-[#f0b90b]/5">
        Base: 🇺🇸 1 USD
      </div>

      {/* Header */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-[#848e9c] border-b border-[#1a1e2e]">
        <span>Currency</span>
        <span className="text-right w-20">Rate</span>
        <span className="text-right w-14">Chg</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2.5">
              <Skeleton className="h-7 w-7 rounded-full bg-[#1a1e2e]" />
              <div className="flex-1">
                <Skeleton className="h-3 w-12 bg-[#1a1e2e] mb-1" />
                <Skeleton className="h-2.5 w-16 bg-[#1a1e2e]" />
              </div>
              <Skeleton className="h-3 w-16 bg-[#1a1e2e]" />
            </div>
          ))
        ) : (
          filtered.map(currency => {
            const isSelected = currency.code === selectedCode;
            const isPositive = currency.change >= 0;
            const flash = flashMap.get(currency.code);

            const formatRate = (rate: number) => {
              if (rate >= 1000) return rate.toLocaleString(undefined, { maximumFractionDigits: 2 });
              if (rate >= 1) return rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
              return rate.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
            };

            return (
              <button
                key={currency.code}
                onClick={() => onSelectCurrency(currency.code)}
                className={`w-full grid grid-cols-[1fr_auto_auto] gap-2 items-center px-3 py-2.5 transition-colors text-left ${
                  isSelected
                    ? 'bg-[#1a1e2e]'
                    : 'hover:bg-[#131722]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-[#1a1e2e] flex items-center justify-center text-base shrink-0">
                    {currency.flag}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{currency.code}</p>
                    <p className="text-[10px] text-[#848e9c] truncate">{currency.name}</p>
                  </div>
                </div>
                <span className={`text-xs font-medium text-right w-20 tabular-nums transition-colors duration-500 ${
                  flash === 'up' ? 'text-[#0ecb81]' : flash === 'down' ? 'text-[#f6465d]' : 'text-white'
                }`}>
                  {formatRate(currency.rate)}
                </span>
                <span className={`text-[11px] font-semibold text-right w-14 tabular-nums ${
                  currency.change === 0 ? 'text-[#848e9c]' : isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'
                }`}>
                  {currency.change === 0 ? '—' : `${isPositive ? '+' : ''}${currency.change.toFixed(2)}%`}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
