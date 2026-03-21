import { useState, useCallback, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { KrakenCoin, TRACKED_PAIRS, getSymbolFromPair, getCoinMeta, fetchTicker } from '@/lib/krakenApi';
import { useKrakenWebSocket } from '@/hooks/useKrakenWebSocket';
import { useKrakenOHLC } from '@/hooks/useKrakenOHLC';
import { useForexData } from '@/hooks/useForexData';
import { useMetalsData } from '@/hooks/useMetalsData';
import { CryptoChart } from '@/components/crypto/CryptoChart';
import { CoinList } from '@/components/crypto/CoinList';
import { ForexList } from '@/components/crypto/ForexList';
import { ForexDetail } from '@/components/crypto/ForexDetail';
import { MetalsList } from '@/components/crypto/MetalsList';
import { MetalsDetail } from '@/components/crypto/MetalsDetail';
import { CurrencyConverter } from '@/components/crypto/CurrencyConverter';
import { Menu, Wifi, WifiOff, Bitcoin, DollarSign, CircleDot, ArrowRightLeft, ArrowLeft } from 'lucide-react';

type TrackerTab = 'crypto' | 'forex' | 'metals';

export default function CryptoTracker() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TrackerTab>('crypto');
  const [selectedPair, setSelectedPair] = useState('XBT/USD');
  const [interval, setInterval] = useState(60);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showConverter, setShowConverter] = useState(false);
  const [coinsMap, setCoinsMap] = useState<Map<string, KrakenCoin>>(new Map());
  const [initialLoading, setInitialLoading] = useState(true);
  const [selectedForexCode, setSelectedForexCode] = useState<string | null>(null);
  const [selectedMetalCode, setSelectedMetalCode] = useState<string | null>(null);
  const coinsRef = useRef(coinsMap);
  coinsRef.current = coinsMap;

  const { candles, isLoading: chartLoading, updateLastCandle } = useKrakenOHLC(selectedPair, interval);
  const { currencies: forexCurrencies, isLoading: forexLoading } = useForexData();
  const { metals, isLoading: metalsLoading, marketOpen: metalsMarketOpen } = useMetalsData();

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
            pair, wsName: pair, base: symbol, quote: 'USD', symbol,
            name: meta.name, logo: meta.logo,
            price: ticker?.price || 0, change24h: ticker?.change24h || 0,
            volume24h: ticker?.volume24h || 0, high24h: ticker?.high24h || 0, low24h: ticker?.low24h || 0,
          });
        }
        setCoinsMap(map);
        setInitialLoading(false);
      })
      .catch(() => {
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
        price: update.price, change24h: update.change24h, volume24h: update.volume,
        high24h: update.high24h, low24h: update.low24h,
      });
      return next;
    });
  }, []);

  const handleOHLCUpdate = useCallback((update: { pair: string; time: number; open: number; high: number; low: number; close: number; volume: number }) => {
    if (update.pair === selectedPair) {
      updateLastCandle({
        time: Math.floor(update.time),
        open: update.open, high: update.high, low: update.low, close: update.close, volume: update.volume,
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
        <title>{activeTab === 'crypto' ? 'Crypto Tracker' : activeTab === 'forex' ? 'Forex Rates' : 'Precious Metals'} - Live Prices</title>
        <meta name="description" content="Real-time cryptocurrency and forex price tracker" />
      </Helmet>

      <div className="h-screen flex flex-col bg-[#0a0e17] text-white overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-2 px-3 py-2 border-b border-[#1a1e2e] bg-[#0d1117] shrink-0">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="md:hidden p-1.5 rounded-lg hover:bg-[#1a1e2e] transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Tab switcher */}
          <div className="flex bg-[#1a1e2e] rounded-lg overflow-hidden">
            <button
              onClick={() => setActiveTab('crypto')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === 'crypto' ? 'bg-[#f0b90b] text-black' : 'text-[#848e9c] hover:text-white'
              }`}
            >
              <Bitcoin className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Crypto</span>
            </button>
            <button
              onClick={() => setActiveTab('forex')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === 'forex' ? 'bg-[#2962ff] text-white' : 'text-[#848e9c] hover:text-white'
              }`}
            >
              <DollarSign className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Forex</span>
            </button>
            <button
              onClick={() => setActiveTab('metals')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold transition-colors ${
                activeTab === 'metals' ? 'bg-[#d4af37] text-black' : 'text-[#848e9c] hover:text-white'
              }`}
            >
              <CircleDot className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Metals</span>
            </button>
          </div>

          <div className="flex-1" />

          <button
            onClick={() => setShowConverter(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold bg-[#1a1e2e] hover:bg-[#252a3a] rounded-lg transition-colors text-[#f0b90b]"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Convert</span>
          </button>
          
          {activeTab === 'crypto' && (
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
          )}
          {activeTab === 'forex' && (
            <span className="text-[10px] text-[#0ecb81]">🔴 Live • 2s</span>
          )}
          {activeTab === 'metals' && (
            metalsMarketOpen ? (
              <span className="text-[10px] text-[#0ecb81]">🟢 Live • 5s</span>
            ) : (
              <span className="text-[10px] text-[#f6465d] flex items-center gap-1">
                🔴 Market Closed
              </span>
            )
          )}
        </header>

        <div className="flex flex-1 overflow-hidden relative">
          {/* Sidebar */}
          <div className={`
            w-64 shrink-0 h-full z-20
            md:relative md:block
            ${showSidebar ? 'absolute inset-y-0 left-0 block' : 'hidden md:block'}
          `}>
            {activeTab === 'crypto' ? (
              <CoinList
                coins={coinsMap}
                selectedPair={selectedPair}
                onSelectPair={(pair) => {
                  setSelectedPair(pair);
                  setShowSidebar(false);
                }}
                isLoading={initialLoading}
              />
            ) : activeTab === 'forex' ? (
              <ForexList
                currencies={forexCurrencies}
                selectedCode={selectedForexCode}
                onSelectCurrency={(code) => {
                  setSelectedForexCode(code);
                  setShowSidebar(false);
                }}
                isLoading={forexLoading}
              />
            ) : (
              <MetalsList
                metals={metals}
                selectedCode={selectedMetalCode}
                onSelectMetal={(code) => {
                  setSelectedMetalCode(code);
                  setShowSidebar(false);
                }}
                isLoading={metalsLoading}
                marketOpen={metalsMarketOpen}
              />
            )}
          </div>

          {/* Overlay backdrop on mobile */}
          {showSidebar && (
            <div
              className="fixed inset-0 bg-black/60 z-10 md:hidden"
              onClick={() => setShowSidebar(false)}
            />
          )}

          {/* Main content */}
          {activeTab === 'crypto' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <CryptoChart
                pair={selectedPair}
                candles={candles}
                isLoading={chartLoading}
                currentPrice={currentPrice}
                interval={interval}
                onIntervalChange={setInterval}
              />
              {currentCoin && currentCoin.price > 0 && (
                <div className="flex flex-wrap gap-x-6 gap-y-1 px-3 py-2 border-t border-[#1a1e2e] text-xs text-[#848e9c] shrink-0">
                  <span>24h High: <span className="text-white">${currentCoin.high24h.toLocaleString()}</span></span>
                  <span>24h Low: <span className="text-white">${currentCoin.low24h.toLocaleString()}</span></span>
                  <span>24h Vol: <span className="text-white">{currentCoin.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>
                  <span>24h Change: <span className={currentCoin.change24h >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>{currentCoin.change24h >= 0 ? '+' : ''}{currentCoin.change24h.toFixed(2)}%</span></span>
                </div>
              )}
            </div>
          ) : activeTab === 'forex' ? (
            <ForexDetail
              currencies={forexCurrencies}
              selectedCode={selectedForexCode}
              isLoading={forexLoading}
            />
          ) : (
            <MetalsDetail
              metals={metals}
              selectedCode={selectedMetalCode}
              isLoading={metalsLoading}
            />
          )}
        </div>
      </div>

      {showConverter && (
        <CurrencyConverter
          currencies={forexCurrencies}
          metals={metals}
          onClose={() => setShowConverter(false)}
        />
      )}
    </>
  );
}
