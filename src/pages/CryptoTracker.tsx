import { useState, useCallback, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { KrakenCoin, TRACKED_PAIRS, getSymbolFromPair, getCoinMeta, fetchTicker } from '@/lib/krakenApi';
import { useKrakenWebSocket } from '@/hooks/useKrakenWebSocket';
import { useKrakenOHLC } from '@/hooks/useKrakenOHLC';
import { CryptoChart } from '@/components/crypto/CryptoChart';
import { CoinList } from '@/components/crypto/CoinList';
import { Menu, Wifi, WifiOff } from 'lucide-react';

export default function CryptoTracker() {
  const [selectedPair, setSelectedPair] = useState('XBT/USD');
  const [interval, setInterval] = useState(60); // 1h default
  const [showSidebar, setShowSidebar] = useState(false);
  const [coinsMap, setCoinsMap] = useState<Map<string, KrakenCoin>>(new Map());
  const [initialLoading, setInitialLoading] = useState(true);
  const coinsRef = useRef(coinsMap);
  coinsRef.current = coinsMap;

  const { candles, isLoading: chartLoading, updateLastCandle } = useKrakenOHLC(selectedPair, interval);

  // Fetch initial ticker data
  useEffect(() => {
    fetchTicker(TRACKED_PAIRS)
      .then(tickers => {
        const map = new Map<string, KrakenCoin>();
        for (const pair of TRACKED_PAIRS) {
          const symbol = getSymbolFromPair(pair);
          const meta = getCoinMeta(symbol);
          const ticker = tickers[pair];
          map.set(pair, {
            pair,
            wsName: pair,
            base: symbol,
            quote: 'USD',
            symbol,
            name: meta.name,
            logo: meta.logo,
            price: ticker?.price || 0,
            change24h: ticker?.change24h || 0,
            volume24h: ticker?.volume24h || 0,
            high24h: ticker?.high24h || 0,
            low24h: ticker?.low24h || 0,
          });
        }
        setCoinsMap(map);
        setInitialLoading(false);
      })
      .catch(() => {
        // Initialize with empty data
        const map = new Map<string, KrakenCoin>();
        for (const pair of TRACKED_PAIRS) {
          const symbol = getSymbolFromPair(pair);
          const meta = getCoinMeta(symbol);
          map.set(pair, {
            pair, wsName: pair, base: symbol, quote: 'USD', symbol,
            name: meta.name, logo: meta.logo,
            price: 0, change24h: 0, volume24h: 0, high24h: 0, low24h: 0,
          });
        }
        setCoinsMap(map);
        setInitialLoading(false);
      });
  }, []);

  const handleTickerUpdate = useCallback((update: { pair: string; price: number; change24h: number; volume: number; high24h: number; low24h: number }) => {
    setCoinsMap(prev => {
      const existing = prev.get(update.pair);
      if (!existing) return prev;
      const next = new Map(prev);
      next.set(update.pair, {
        ...existing,
        price: update.price,
        change24h: update.change24h,
        volume24h: update.volume,
        high24h: update.high24h,
        low24h: update.low24h,
      });
      return next;
    });
  }, []);

  const handleOHLCUpdate = useCallback((update: { pair: string; time: number; open: number; high: number; low: number; close: number; volume: number }) => {
    if (update.pair === selectedPair) {
      updateLastCandle({
        time: Math.floor(update.time),
        open: update.open,
        high: update.high,
        low: update.low,
        close: update.close,
        volume: update.volume,
      });
    }
  }, [selectedPair, updateLastCandle]);

  const { isConnected } = useKrakenWebSocket({
    onTickerUpdate: handleTickerUpdate,
    onOHLCUpdate: handleOHLCUpdate,
    ohlcPair: selectedPair,
    ohlcInterval: interval,
  });

  const currentCoin = coinsMap.get(selectedPair);
  const currentPrice = currentCoin?.price || 0;

  return (
    <>
      <Helmet>
        <title>Crypto Tracker - Live Prices</title>
        <meta name="description" content="Real-time cryptocurrency price tracker with live charts powered by Kraken" />
      </Helmet>

      <div className="h-screen flex flex-col bg-[#0a0e17] text-white overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-3 py-2 border-b border-[#1a1e2e] bg-[#0d1117] shrink-0">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="md:hidden p-1.5 rounded-lg hover:bg-[#1a1e2e] transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-sm font-bold tracking-wide">
            <span className="text-[#f0b90b]">Crypto</span>Tracker
          </h1>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 text-xs">
            {isConnected ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-[#0ecb81]" />
                <span className="text-[#0ecb81] hidden sm:inline">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-[#f6465d]" />
                <span className="text-[#f6465d] hidden sm:inline">Reconnecting...</span>
              </>
            )}
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden relative">
          {/* Sidebar - desktop always visible, mobile overlay */}
          <div className={`
            w-64 shrink-0 h-full z-20
            md:relative md:block
            ${showSidebar ? 'absolute inset-y-0 left-0 block' : 'hidden md:block'}
          `}>
            <CoinList
              coins={coinsMap}
              selectedPair={selectedPair}
              onSelectPair={(pair) => {
                setSelectedPair(pair);
                setShowSidebar(false);
              }}
              isLoading={initialLoading}
            />
          </div>

          {/* Overlay backdrop on mobile */}
          {showSidebar && (
            <div
              className="fixed inset-0 bg-black/60 z-10 md:hidden"
              onClick={() => setShowSidebar(false)}
            />
          )}

          {/* Chart area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <CryptoChart
              pair={selectedPair}
              candles={candles}
              isLoading={chartLoading}
              currentPrice={currentPrice}
              interval={interval}
              onIntervalChange={setInterval}
            />

            {/* Bottom stats bar */}
            {currentCoin && currentCoin.price > 0 && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 px-3 py-2 border-t border-[#1a1e2e] text-xs text-[#848e9c] shrink-0">
                <span>24h High: <span className="text-white">${currentCoin.high24h.toLocaleString()}</span></span>
                <span>24h Low: <span className="text-white">${currentCoin.low24h.toLocaleString()}</span></span>
                <span>24h Vol: <span className="text-white">{currentCoin.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>
                <span>24h Change: <span className={currentCoin.change24h >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>{currentCoin.change24h >= 0 ? '+' : ''}{currentCoin.change24h.toFixed(2)}%</span></span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
