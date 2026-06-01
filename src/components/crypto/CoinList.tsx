import { useState, useMemo, useCallback, useEffect } from 'react';
import { KrakenCoin, getDisplaySymbol, getCoinMeta } from '@/lib/krakenApi';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/contexts/LanguageContext';
import { Search, Star } from 'lucide-react';

const FAVORITES_KEY = 'crypto-favorites';

function loadFavorites(): Set<string> {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavorites(favs: Set<string>) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs]));
}

interface CoinListProps {
  coins: Map<string, KrakenCoin>;
  selectedPair: string;
  onSelectPair: (pair: string) => void;
  isLoading: boolean;
}

export function CoinList({ coins, selectedPair, onSelectPair, isLoading }: CoinListProps) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' ? en : ku);
  const [search, setSearch] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);

  useEffect(() => {
    saveFavorites(favorites);
  }, [favorites]);

  const toggleFavorite = useCallback((pair: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(pair)) next.delete(pair);
      else next.add(pair);
      return next;
    });
  }, []);

  const filteredCoins = useMemo(() => {
    const arr = Array.from(coins.values());
    const q = search.toLowerCase().trim();
    const filtered = q
      ? arr.filter(c => {
          const display = getDisplaySymbol(c.symbol).toLowerCase();
          const meta = getCoinMeta(c.symbol);
          return display.includes(q) || meta.name.toLowerCase().includes(q);
        })
      : arr;

    // Sort: favorites first, then original order
    return filtered.sort((a, b) => {
      const aFav = favorites.has(a.pair) ? 0 : 1;
      const bFav = favorites.has(b.pair) ? 0 : 1;
      return aFav - bFav;
    });
  }, [coins, search, favorites]);

  const hasFavorites = filteredCoins.some(c => favorites.has(c.pair));
  const firstNonFavIndex = hasFavorites
    ? filteredCoins.findIndex(c => !favorites.has(c.pair))
    : -1;

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-r border-[#1a1e2e]">
      {/* Search */}
      <div className="p-2 border-b border-[#1a1e2e]">
        <div className="flex items-center gap-2 bg-[#1a1e2e] rounded-lg px-3 py-2">
          <Search className="h-4 w-4 text-[#848e9c] shrink-0" />
          <input
            type="text"
            placeholder={bi('گەڕان بەدوای دراوەکان...', 'Search coins...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm text-white placeholder:text-[#848e9c] outline-none w-full"
          />
        </div>
      </div>

      {/* Header */}
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-[#848e9c] border-b border-[#1a1e2e]">
        <span className="w-5" />
        <span>{bi('دراو', 'Coin')}</span>
        <span className="text-right w-20">{bi('نرخ', 'Price')}</span>
        <span className="text-right w-14">{bi('٢٤ک', '24h')}</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          Array.from({ length: 12 }).map((_, i) => (
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
          filteredCoins.map((coin, idx) => {
            const display = getDisplaySymbol(coin.symbol);
            const meta = getCoinMeta(coin.symbol);
            const isSelected = coin.pair === selectedPair;
            const isPositive = coin.change24h >= 0;
            const isFav = favorites.has(coin.pair);
            const showDivider = firstNonFavIndex === idx && firstNonFavIndex > 0;

            return (
              <div key={coin.pair}>
                {showDivider && (
                  <div className="border-t border-[#f0b90b]/20 mx-3 my-0.5" />
                )}
                <button
                  onClick={() => onSelectPair(coin.pair)}
                  className={`w-full grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center px-3 py-2.5 transition-colors text-left ${
                    isSelected
                      ? 'bg-[#1a1e2e]'
                      : 'hover:bg-[#131722]'
                  }`}
                >
                  <button
                    onClick={(e) => toggleFavorite(coin.pair, e)}
                    className="p-0.5 rounded hover:bg-[#2a2e3e] transition-colors"
                    aria-label={isFav ? bi('لابردن لە دڵخوازەکان', 'Remove from favorites') : bi('زیادکردن بۆ دڵخوازەکان', 'Add to favorites')}
                  >
                    <Star
                      className={`h-3.5 w-3.5 transition-colors ${
                        isFav ? 'fill-[#f0b90b] text-[#f0b90b]' : 'text-[#848e9c] hover:text-[#f0b90b]'
                      }`}
                    />
                  </button>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-[#1a1e2e] flex items-center justify-center text-sm shrink-0">
                      {meta.logo}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{display}</p>
                      <p className="text-[10px] text-[#848e9c] truncate">{meta.name}</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-white text-right w-20 tabular-nums">
                    ${coin.price > 0 ? coin.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: coin.price < 1 ? 6 : 2 }) : '—'}
                  </span>
                  <span className={`text-[11px] font-semibold text-right w-14 tabular-nums ${isPositive ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                    {isPositive ? '+' : ''}{coin.change24h.toFixed(2)}%
                  </span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
