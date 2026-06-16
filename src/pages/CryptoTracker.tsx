import { useState, useCallback, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { KrakenCoin, TRACKED_PAIRS, getSymbolFromPair, getDisplaySymbol, getCoinMeta, fetchTicker } from '@/lib/krakenApi';
import { useKrakenWebSocket } from '@/hooks/useKrakenWebSocket';
import { useKrakenOHLC } from '@/hooks/useKrakenOHLC';
import { useForexData } from '@/hooks/useForexData';
import { useMetalsData } from '@/hooks/useMetalsData';
import { useCryptoOverview } from '@/hooks/useCryptoOverview';
import { useMetalsOverview } from '@/hooks/useMetalsOverview';
import { CryptoChart } from '@/components/crypto/CryptoChart';
import { CryptoAnalysis } from '@/components/crypto/CryptoAnalysis';
import { CryptoProPanel } from '@/components/crypto/CryptoProPanel';
import { CoinList } from '@/components/crypto/CoinList';
import { ForexList } from '@/components/crypto/ForexList';
import { ForexDetail } from '@/components/crypto/ForexDetail';
import { ForexProPanel } from '@/components/crypto/ForexProPanel';
import { MetalsList } from '@/components/crypto/MetalsList';
import { MetalsDetail } from '@/components/crypto/MetalsDetail';
import { AssetOverview } from '@/components/crypto/AssetOverview';
import { CurrencyConverter } from '@/components/crypto/CurrencyConverter';
import { METALS_META } from '@/lib/metalsApi';
import { OverviewEntry } from '@/lib/overview';
import { useLanguage } from '@/contexts/LanguageContext';
import { DemoAccountProvider } from '@/contexts/DemoAccountContext';
import { Menu, Wifi, WifiOff, Bitcoin, DollarSign, CircleDot, ArrowRightLeft, ArrowLeft, CandlestickChart, Activity, ChevronDown, LayoutGrid, LineChart, Newspaper, Crown, Brain } from 'lucide-react';
import { MarketNewsModal } from '@/components/crypto/MarketNewsModal';
import { AIAnalysisPanel } from '@/components/crypto/AIAnalysisPanel';
import { IndicatorVerify } from '@/components/crypto/IndicatorVerify';

type TrackerTab = 'crypto' | 'forex' | 'metals' | 'ai';
type CryptoView = 'overview' | 'chart' | 'analysis' | 'pro';
type ForexView = 'overview' | 'pro';
type MetalsView = 'overview' | 'market' | 'analysis' | 'pro';

export default function CryptoTracker() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);
  const [activeTab, setActiveTab] = useState<TrackerTab>('metals');
  const [cryptoView, setCryptoView] = useState<CryptoView>('overview');
  const [forexView, setForexView] = useState<ForexView>('overview');
  const [selectedPair, setSelectedPair] = useState('XBT/USD');
  const [interval, setInterval] = useState(60);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showConverter, setShowConverter] = useState(false);
  const [showNews, setShowNews] = useState(false);
  const [coinsMap, setCoinsMap] = useState<Map<string, KrakenCoin>>(new Map());
  const [initialLoading, setInitialLoading] = useState(true);
  const [selectedForexCode, setSelectedForexCode] = useState<string | null>(null);
  const [selectedMetalCode, setSelectedMetalCode] = useState<string | null>('XAU');
  const [metalsView, setMetalsView] = useState<MetalsView>('market');
  const coinsRef = useRef(coinsMap);
  coinsRef.current = coinsMap;

  const { candles, isLoading: chartLoading, updateLastCandle } = useKrakenOHLC(selectedPair, interval);
  const { currencies: forexCurrencies, isLoading: forexLoading, marketOpen: forexMarketOpen } = useForexData();
  const { metals, isLoading: metalsLoading, marketOpen: metalsMarketOpen } = useMetalsData();
  const cryptoOverview = useCryptoOverview(activeTab === 'crypto' && cryptoView === 'overview');
  const metalsOverview = useMetalsOverview(activeTab === 'metals' && selectedMetalCode === null);

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

  const cryptoEntries: OverviewEntry[] = TRACKED_PAIRS.map((pair) => {
    const coin = coinsMap.get(pair);
    const sym = getSymbolFromPair(pair);
    const meta = getCoinMeta(sym);
    const sig = cryptoOverview.data[pair];
    return {
      key: pair,
      symbol: getDisplaySymbol(sym),
      name: coin?.name ?? meta.name,
      logo: coin?.logo ?? meta.logo,
      price: coin?.price ?? 0,
      change: coin?.change24h ?? 0,
      closes: (sig?.closes ?? []).slice(-40),
      summary: sig?.summary ?? null,
      accentColor: '#f0b90b',
    };
  });

  const metalsEntries: OverviewEntry[] = METALS_META.map((meta) => {
    const m = metals.find((x) => x.code === meta.code);
    const sig = metalsOverview.data[meta.code];
    return {
      key: meta.code,
      symbol: meta.symbol.replace('/USD', ''),
      name: meta.name,
      logo: meta.emoji,
      price: m?.price ?? 0,
      change: m?.change ?? 0,
      closes: (sig?.closes ?? []).slice(-40),
      summary: sig?.summary ?? null,
      accentColor: meta.category === 'oil' ? '#e67e22' : '#d4af37',
    };
  });

  const listTitle =
    activeTab === 'crypto' ? bi('دراوەکان', 'Coins')
    : activeTab === 'forex' ? bi('دراوی نێودەوڵەتی', 'Currencies')
    : bi('کاڵاکان', 'Commodities');

  const selectionLabel =
    activeTab === 'crypto' ? getDisplaySymbol(getSymbolFromPair(selectedPair))
    : activeTab === 'forex' ? (selectedForexCode || bi('هەڵبژێرە', 'Select'))
    : (selectedMetalCode || bi('هەڵبژێرە', 'Select'));

  return (
    <DemoAccountProvider>
      <Helmet>
        <title>{activeTab === 'crypto' ? bi('شوێنکەوتنی کریپتۆ', 'Crypto Tracker') : activeTab === 'forex' ? bi('نرخی دراو', 'Forex Rates') : bi('کانزا بەهادارەکان', 'Precious Metals')} - {bi('نرخی ڕاستەوخۆ', 'Live Prices')}</title>
        <meta name="description" content="Real-time cryptocurrency and forex price tracker" />
      </Helmet>


      <div className="h-[100dvh] flex flex-col bg-[#0a0e17] text-white overflow-hidden">
        {/* Top bar */}
        {/* Mobile: horizontal scrollable top bar with larger touch targets */}
        <header className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 border-b border-[#1a1e2e] bg-[#0d1117] shrink-0 overflow-x-auto no-scrollbar">
          {/* Back button */}
          <button
            onClick={() => navigate('/')}
            className="shrink-0 p-2 sm:p-2 rounded-lg hover:bg-[#1a1e2e] active:bg-[#252a3a] transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
            aria-label={bi('گەڕانەوە بۆ ژمێرکار', 'Back to calculator')}
          >
            <ArrowLeft className="h-5 w-5 sm:h-5 sm:w-5" />
          </button>

          {/* Tab switcher */}
          <div className="flex bg-[#1a1e2e] rounded-lg overflow-hidden shrink-0">
            <button
              onClick={() => setActiveTab('crypto')}
              className={`flex items-center justify-center gap-1 sm:gap-1.5 px-3 sm:px-3 py-2 sm:py-1.5 text-xs sm:text-xs font-bold transition-colors active:scale-95 min-h-[40px] ${
                activeTab === 'crypto' ? 'bg-[#f0b90b] text-black' : 'text-[#848e9c] hover:text-white'
              }`}
            >
              <Bitcoin className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">{bi('کریپتۆ', 'Crypto')}</span>
            </button>
            <button
              onClick={() => setActiveTab('forex')}
              className={`flex items-center justify-center gap-1 sm:gap-1.5 px-3 sm:px-3 py-2 sm:py-1.5 text-xs sm:text-xs font-bold transition-colors active:scale-95 min-h-[40px] ${
                activeTab === 'forex' ? 'bg-[#2962ff] text-white' : 'text-[#848e9c] hover:text-white'
              }`}
            >
              <DollarSign className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">{bi('دراو', 'Forex')}</span>
            </button>
            <button
              onClick={() => setActiveTab('metals')}
              className={`flex items-center justify-center gap-1 sm:gap-1.5 px-3 sm:px-3 py-2 sm:py-1.5 text-xs sm:text-xs font-bold transition-colors active:scale-95 min-h-[40px] ${
                activeTab === 'metals' ? 'bg-[#d4af37] text-black' : 'text-[#848e9c] hover:text-white'
              }`}
            >
              <CircleDot className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">{bi('کانزا', 'Metals')}</span>
            </button>
            <button
              onClick={() => setActiveTab('ai')}
              className={`flex items-center justify-center gap-1 sm:gap-1.5 px-3 sm:px-3 py-2 sm:py-1.5 text-xs sm:text-xs font-bold transition-colors active:scale-95 min-h-[40px] ${
                activeTab === 'ai' ? 'bg-gradient-to-r from-[#7c3aed] to-[#a855f7] text-white' : 'text-[#848e9c] hover:text-white'
              }`}
            >
              <Brain className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              <span className="hidden sm:inline">{bi('شیکاری', 'AI')}</span>
            </button>
          </div>

          <div className="flex-1" />

          <button
            onClick={() => setShowNews(true)}
            className="shrink-0 flex items-center justify-center gap-1 sm:gap-1.5 px-3 sm:px-2.5 py-2 sm:py-1.5 text-xs sm:text-xs font-bold bg-gradient-to-r from-[#f6465d]/20 to-[#f6465d]/5 border border-[#f6465d]/40 hover:border-[#f6465d]/70 rounded-lg transition-colors text-[#f6465d] min-h-[40px] min-w-[40px]"
          >
            <Newspaper className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="hidden sm:inline">{bi('هەواڵ', 'News')}</span>
          </button>

          <button
            onClick={() => navigate('/bots')}
            className="shrink-0 flex items-center justify-center gap-1 sm:gap-1.5 px-3 sm:px-2.5 py-2 sm:py-1.5 text-xs sm:text-xs font-bold bg-gradient-to-r from-[#d4af37]/20 to-[#d4af37]/5 border border-[#d4af37]/40 hover:border-[#d4af37]/70 rounded-lg transition-colors text-[#d4af37] min-h-[40px] min-w-[40px]"
          >
            <LineChart className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="hidden sm:inline">{bi('بوتەکان', 'Bots')}</span>
          </button>

          <button
            onClick={() => setShowConverter(true)}
            className="shrink-0 flex items-center justify-center gap-1 sm:gap-1.5 px-3 sm:px-2.5 py-2 sm:py-1.5 text-xs sm:text-xs font-bold bg-[#1a1e2e] hover:bg-[#252a3a] active:bg-[#303548] rounded-lg transition-colors text-[#f0b90b] min-h-[40px] min-w-[40px]"
          >
            <ArrowRightLeft className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="hidden sm:inline">{bi('گۆڕین', 'Convert')}</span>
          </button>
          
          {activeTab === 'crypto' && (
            <div className="shrink-0 flex items-center gap-1 sm:gap-1.5 text-xs sm:text-xs min-h-[40px]">
              {isConnected ? (
                <>
                  <Wifi className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-[#0ecb81]" />
                  <span className="text-[#0ecb81] hidden sm:inline">{bi('ڕاستەوخۆ', 'Live')}</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-[#f6465d]" />
                  <span className="text-[#f6465d] hidden sm:inline">{bi('پەیوەندیکردنەوە...', 'Reconnecting...')}</span>
                </>
              )}
            </div>
          )}
          {activeTab === 'forex' && (
            forexMarketOpen ? (
              <span className="shrink-0 text-xs sm:text-[10px] text-[#0ecb81] min-h-[40px] flex items-center">🟢 {bi('ڕاستەوخۆ', 'Live')} • 2s</span>
            ) : (
              <span className="shrink-0 text-xs sm:text-[10px] text-[#f6465d] flex items-center gap-1 min-h-[40px]">
                🔴 {bi('داخراو', 'Closed')}
              </span>
            )
          )}
          {activeTab === 'metals' && (
            metalsMarketOpen ? (
              <span className="shrink-0 text-xs sm:text-[10px] text-[#0ecb81] min-h-[40px] flex items-center">🟢 {bi('ڕاستەوخۆ', 'Live')} • 1s</span>
            ) : (
              <span className="shrink-0 text-xs sm:text-[10px] text-[#f6465d] flex items-center gap-1 min-h-[40px]">
                🔴 {bi('داخراو', 'Closed')}
              </span>
            )
          )}
        </header>

        {/* Asset selector dropdown (mobile + desktop) — hidden on AI tab */}
        {activeTab !== 'ai' && (
        <div className="relative shrink-0 z-40 border-b border-[#1a1e2e] bg-[#0d1117]">
          <button
            onClick={() => setShowSidebar(v => !v)}
            className="w-full md:w-auto md:min-w-[280px] flex items-center gap-2 px-3 py-2.5 active:bg-[#131722] md:hover:bg-[#131722] transition-colors"
            aria-expanded={showSidebar}
          >
            <Menu className="h-4 w-4 text-[#f0b90b] shrink-0" />
            <span className="text-[11px] text-[#848e9c]">{listTitle}:</span>
            <span className="text-sm font-bold text-white truncate">{selectionLabel}</span>
            <ChevronDown className={`h-4 w-4 text-[#848e9c] ms-auto shrink-0 transition-transform ${showSidebar ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown panel */}
          {showSidebar && (
            <div className="absolute start-2 end-2 md:end-auto top-full mt-1 md:w-[360px] h-[min(70vh,520px)] flex flex-col rounded-xl border border-[#1a1e2e] bg-[#0d1117] shadow-2xl overflow-hidden">
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
          )}
        </div>
        )}

        {/* Backdrop to close dropdown */}
        {showSidebar && (
          <div
            className="fixed inset-0 bg-black/40 z-30"
            onClick={() => setShowSidebar(false)}
          />
        )}

        <div className="flex flex-1 overflow-hidden relative">
          {/* Main content */}
          {activeTab === 'ai' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <AIAnalysisPanel
                btcPrice={coinsMap.get('XBT/USD')?.price ?? 0}
                goldPrice={metals.find((m) => m.code === 'XAU')?.price ?? 0}
              />
            </div>
          ) : activeTab === 'crypto' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Overview / Chart / Analysis sub-toggle — mobile-friendly */}
              <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1a1e2e] shrink-0 overflow-x-auto no-scrollbar">
                <div className="flex bg-[#1a1e2e] rounded-lg overflow-hidden shrink-0">
                  <button
                    onClick={() => setCryptoView('overview')}
                    className={`flex items-center justify-center gap-1.5 px-3 sm:px-3 py-2 sm:py-1.5 text-xs font-bold transition-colors active:scale-95 min-h-[40px] min-w-[40px] ${
                      cryptoView === 'overview' ? 'bg-[#2a2e3e] text-[#f0b90b]' : 'text-[#848e9c] hover:text-white'
                    }`}
                  >
                    <LayoutGrid className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">{bi('پوختە', 'Overview')}</span>
                  </button>
                  <button
                    onClick={() => setCryptoView('chart')}
                    className={`flex items-center justify-center gap-1.5 px-3 sm:px-3 py-2 sm:py-1.5 text-xs font-bold transition-colors active:scale-95 min-h-[40px] min-w-[40px] ${
                      cryptoView === 'chart' ? 'bg-[#2a2e3e] text-[#f0b90b]' : 'text-[#848e9c] hover:text-white'
                    }`}
                  >
                    <CandlestickChart className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">{bi('چارت', 'Chart')}</span>
                  </button>
                  <button
                    onClick={() => setCryptoView('analysis')}
                    className={`flex items-center justify-center gap-1.5 px-3 sm:px-3 py-2 sm:py-1.5 text-xs font-bold transition-colors active:scale-95 min-h-[40px] min-w-[40px] ${
                      cryptoView === 'analysis' ? 'bg-[#2a2e3e] text-[#f0b90b]' : 'text-[#848e9c] hover:text-white'
                    }`}
                  >
                    <Activity className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">{bi('شیکاری', 'Analysis')}</span>
                  </button>
                  <button
                    onClick={() => setCryptoView('pro')}
                    className={`flex items-center justify-center gap-1.5 px-3 sm:px-3 py-2 sm:py-1.5 text-xs font-bold transition-colors active:scale-95 min-h-[40px] min-w-[40px] ${
                      cryptoView === 'pro' ? 'bg-[#f0b90b] text-black' : 'text-[#848e9c] hover:text-white'
                    }`}
                  >
                    <Crown className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">{bi('پرۆ', 'Pro')}</span>
                  </button>
                </div>
              </div>


              {cryptoView === 'overview' ? (
                <AssetOverview
                  title={bi('پوختەی کریپتۆ', 'Crypto Overview')}
                  subtitle={bi('نرخ، گۆڕان و سیگناڵی کڕین/فرۆشتن', 'Price, change & Buy/Sell signals')}
                  entries={cryptoEntries}
                  isLoading={cryptoOverview.isLoading}
                  onOpen={(pair, mode) => {
                    setSelectedPair(pair);
                    setCryptoView(mode);
                  }}
                />
              ) : cryptoView === 'chart' ? (
                <div className="flex-1 overflow-y-auto">
                  <CryptoChart
                    pair={selectedPair}
                    candles={candles}
                    isLoading={chartLoading}
                    currentPrice={currentPrice}
                    interval={interval}
                    onIntervalChange={setInterval}
                  />
                  {currentCoin && currentCoin.price > 0 && (
                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-x-4 sm:gap-x-6 gap-y-1 px-3 py-2 border-t border-[#1a1e2e] text-[10px] sm:text-xs text-[#848e9c]">
                      <span>{bi('بەرزی ٢٤ک', '24h High')}: <span className="text-white">${currentCoin.high24h.toLocaleString()}</span></span>
                      <span>{bi('نزمی ٢٤ک', '24h Low')}: <span className="text-white">${currentCoin.low24h.toLocaleString()}</span></span>
                      <span>{bi('قەبارەی ٢٤ک', '24h Vol')}: <span className="text-white">{currentCoin.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></span>
                      <span>{bi('گۆڕانی ٢٤ک', '24h Change')}: <span className={currentCoin.change24h >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>{currentCoin.change24h >= 0 ? '+' : ''}{currentCoin.change24h.toFixed(2)}%</span></span>
                    </div>
                  )}
                </div>
              ) : cryptoView === 'pro' ? (
                <CryptoProPanel
                  symbol={getDisplaySymbol(getSymbolFromPair(selectedPair))}
                  candles={candles}
                  price={currentPrice}
                />
              ) : (
                <CryptoAnalysis
                  symbol={getDisplaySymbol(getSymbolFromPair(selectedPair))}
                  candles={candles}
                  currentPrice={currentPrice}
                  change24h={currentCoin?.change24h ?? 0}
                  interval={interval}
                  tradeSymbol={selectedPair}
                  tradeLabel={`${getDisplaySymbol(getSymbolFromPair(selectedPair))}/USD`}
                />
              )}
            </div>
          ) : activeTab === 'forex' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Overview / Pro sub-toggle */}
              <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1a1e2e] shrink-0 overflow-x-auto no-scrollbar">
                <div className="flex bg-[#1a1e2e] rounded-lg overflow-hidden shrink-0">
                  <button
                    onClick={() => setForexView('overview')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 text-xs font-bold transition-colors active:scale-95 min-h-[40px] min-w-[40px] ${
                      forexView === 'overview' ? 'bg-[#2a2e3e] text-[#2962ff]' : 'text-[#848e9c] hover:text-white'
                    }`}
                  >
                    <LayoutGrid className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">{bi('پوختە', 'Overview')}</span>
                  </button>
                  <button
                    onClick={() => setForexView('pro')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 text-xs font-bold transition-colors active:scale-95 min-h-[40px] min-w-[40px] ${
                      forexView === 'pro' ? 'bg-[#2962ff] text-white' : 'text-[#848e9c] hover:text-white'
                    }`}
                  >
                    <Crown className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">{bi('پرۆ', 'Pro')}</span>
                  </button>
                </div>
                {forexView === 'pro' && (
                  <span className="ms-2 text-[11px] text-[#848e9c] shrink-0">
                    {(() => {
                      const c = forexCurrencies.find(x => x.code === (selectedForexCode || 'EUR'));
                      return c ? `${c.flag} USD/${c.code}` : '';
                    })()}
                  </span>
                )}
              </div>

              {forexView === 'pro' ? (
                (() => {
                  const c = forexCurrencies.find(x => x.code === (selectedForexCode || 'EUR'));
                  if (!c) {
                    return (
                      <div className="flex-1 flex items-center justify-center text-sm text-[#848e9c]">
                        {bi('دراوێک هەڵبژێرە', 'Select a currency')}
                      </div>
                    );
                  }
                  return (
                    <ForexProPanel key={c.code} code={c.code} name={c.name} flag={c.flag} rate={c.rate} />
                  );
                })()
              ) : (
                <ForexDetail
                  currencies={forexCurrencies}
                  selectedCode={selectedForexCode}
                  isLoading={forexLoading}
                />
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Overview / Market / Analysis / Pro sub-toggle — mobile-friendly */}
              <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1a1e2e] shrink-0 overflow-x-auto no-scrollbar">
                <div className="flex bg-[#1a1e2e] rounded-lg overflow-hidden shrink-0">
                  <button
                    onClick={() => { setSelectedMetalCode(null); setMetalsView('overview'); }}
                    className={`flex items-center justify-center gap-1.5 px-3 sm:px-3 py-2 sm:py-1.5 text-xs font-bold transition-colors active:scale-95 min-h-[40px] min-w-[40px] ${
                      selectedMetalCode === null && metalsView === 'overview' ? 'bg-[#2a2e3e] text-[#d4af37]' : 'text-[#848e9c] hover:text-white'
                    }`}
                  >
                    <LayoutGrid className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">{bi('پوختە', 'Overview')}</span>
                  </button>
                  <button
                    onClick={() => { if (!selectedMetalCode) setSelectedMetalCode('XAU'); setMetalsView('market'); }}
                    className={`flex items-center justify-center gap-1.5 px-3 sm:px-3 py-2 sm:py-1.5 text-xs font-bold transition-colors active:scale-95 min-h-[40px] min-w-[40px] ${
                      selectedMetalCode !== null && metalsView === 'market' ? 'bg-[#2a2e3e] text-[#d4af37]' : 'text-[#848e9c] hover:text-white'
                    }`}
                  >
                    <CandlestickChart className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">{bi('بازاڕ', 'Market')}</span>
                  </button>
                  <button
                    onClick={() => { if (!selectedMetalCode) setSelectedMetalCode('XAU'); setMetalsView('analysis'); }}
                    className={`flex items-center justify-center gap-1.5 px-3 sm:px-3 py-2 sm:py-1.5 text-xs font-bold transition-colors active:scale-95 min-h-[40px] min-w-[40px] ${
                      selectedMetalCode !== null && metalsView === 'analysis' ? 'bg-[#2a2e3e] text-[#d4af37]' : 'text-[#848e9c] hover:text-white'
                    }`}
                  >
                    <Activity className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">{bi('شیکاری', 'Analysis')}</span>
                  </button>
                  <button
                    onClick={() => { if (!selectedMetalCode) setSelectedMetalCode('XAU'); setMetalsView('pro'); }}
                    className={`flex items-center justify-center gap-1.5 px-3 sm:px-3 py-2 sm:py-1.5 text-xs font-bold transition-colors active:scale-95 min-h-[40px] min-w-[40px] ${
                      selectedMetalCode !== null && metalsView === 'pro' ? 'bg-[#d4af37] text-black' : 'text-[#848e9c] hover:text-white'
                    }`}
                  >
                    <Crown className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                    <span className="hidden sm:inline">{bi('پرۆ', 'Pro')}</span>
                  </button>
                </div>
              </div>

              {selectedMetalCode === null ? (
                <AssetOverview
                  title={bi('پوختەی کاڵاکان', 'Commodities Overview')}
                  subtitle={bi('نرخ، گۆڕان و سیگناڵی کڕین/فرۆشتن', 'Price, change & Buy/Sell signals')}
                  entries={metalsEntries}
                  isLoading={metalsOverview.isLoading}
                  onOpen={(code, mode) => {
                    setMetalsView(mode === 'analysis' ? 'analysis' : 'market');
                    setSelectedMetalCode(code);
                  }}
                />
              ) : (
                <MetalsDetail
                  metals={metals}
                  selectedCode={selectedMetalCode}
                  isLoading={metalsLoading}
                  view={metalsView === 'overview' ? 'market' : metalsView}
                />
              )}
            </div>
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

      <MarketNewsModal open={showNews} onClose={() => setShowNews(false)} />
    </DemoAccountProvider>

  );
}
