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
import { Menu, CandlestickChart, Activity, ChevronDown, LayoutGrid, Crown, Bell } from 'lucide-react';
import { MarketNewsModal } from '@/components/crypto/MarketNewsModal';
import { AIAnalysisPanel } from '@/components/crypto/AIAnalysisPanel';
import { SignalsPanel } from '@/components/crypto/SignalsPanel';
import { DROPDOWN_ASSETS, DropdownAssetKey } from '@/lib/signalData';
import { IndicatorVerify } from '@/components/crypto/IndicatorVerify';
import { BottomNav } from '@/components/crypto/BottomNav';


type TrackerTab = 'crypto' | 'forex' | 'metals' | 'ai';
type CryptoView = 'overview' | 'chart' | 'analysis' | 'pro';
type ForexView = 'overview' | 'pro';
type MetalsView = 'overview' | 'market' | 'analysis' | 'pro';

export default function CryptoTracker() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);
  const [activeTab, setActiveTab] = useState<TrackerTab>(() => {
    try {
      const saved = localStorage.getItem('tracker:lastTab') as TrackerTab | null;
      if (saved === 'crypto' || saved === 'forex' || saved === 'metals' || saved === 'ai') return saved;
    } catch { /* noop */ }
    return 'metals';
  });
  const [cryptoView, setCryptoView] = useState<CryptoView>('overview');
  const [aiView, setAiView] = useState<'signals' | 'confluence'>('signals');
  // The single asset shown in the Confluence view; remembered for the session.
  const [confluenceAsset, setConfluenceAsset] = useState<DropdownAssetKey>(() => {
    try {
      const saved = sessionStorage.getItem('tracker:confluenceAsset') as DropdownAssetKey | null;
      if (saved && DROPDOWN_ASSETS.some((a) => a.key === saved)) return saved;
    } catch { /* noop */ }
    return 'gold';
  });
  // The single asset shown in the Signals view; independent from Confluence.
  const [signalsAsset, setSignalsAsset] = useState<DropdownAssetKey>(() => {
    try {
      const saved = sessionStorage.getItem('tracker:signalsAsset') as DropdownAssetKey | null;
      if (saved && DROPDOWN_ASSETS.some((a) => a.key === saved)) return saved;
    } catch { /* noop */ }
    return 'gold';
  });
  const [forexView, setForexView] = useState<ForexView>('overview');
  const [selectedPair, setSelectedPair] = useState('XBT/USD');
  const [interval, setInterval] = useState(15);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showConverter, setShowConverter] = useState(false);
  const [showNews, setShowNews] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [coinsMap, setCoinsMap] = useState<Map<string, KrakenCoin>>(new Map());
  const [initialLoading, setInitialLoading] = useState(true);
  const [selectedForexCode, setSelectedForexCode] = useState<string | null>(null);
  const [selectedMetalCode, setSelectedMetalCode] = useState<string | null>('XAU');
  const [metalsView, setMetalsView] = useState<MetalsView>('market');
  const coinsRef = useRef(coinsMap);
  coinsRef.current = coinsMap;

  // Persist last visited tab
  useEffect(() => {
    try { localStorage.setItem('tracker:lastTab', activeTab); } catch { /* noop */ }
  }, [activeTab]);

  // Remember the selected Confluence asset for the session.
  useEffect(() => {
    try { sessionStorage.setItem('tracker:confluenceAsset', confluenceAsset); } catch { /* noop */ }
  }, [confluenceAsset]);

  // Remember the selected Signals asset for the session (independent).
  useEffect(() => {
    try { sessionStorage.setItem('tracker:signalsAsset', signalsAsset); } catch { /* noop */ }
  }, [signalsAsset]);


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
        {/* Top bar — clean: logo left, live ticker center, bell right */}
        <header className="flex items-center gap-2 px-3 py-2 border-b border-[#1a1e2e] bg-[#0d1117] shrink-0">
          {/* Logo / app name */}
          <button
            onClick={() => navigate('/')}
            className="shrink-0 flex items-center gap-2 active:scale-95 transition-transform"
            aria-label={bi('گەڕانەوە', 'Home')}
          >
            <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-[#f0b90b] to-[#d4af37] text-black font-black text-sm">C</span>
            <span className="hidden xs:inline text-sm font-extrabold tracking-tight text-white">CENTRAL <span className="text-[#f0b90b]">TECH PLATFORM</span></span>
          </button>

          {/* Spacer — prices are shown in the main price card below (no redundant header ticker) */}
          <div className="flex-1 min-w-0" />


          {/* Notification bell */}
          <button
            onClick={() => setShowNews(true)}
            className="shrink-0 relative p-2 rounded-lg text-[#c7cdd9] hover:text-white hover:bg-[#1a1e2e] active:scale-90 transition min-h-[40px] min-w-[40px] flex items-center justify-center"
            aria-label={bi('ئاگادارکردنەوەکان', 'Notifications')}
          >
            <Bell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#f6465d] ring-2 ring-[#0d1117]" />
          </button>
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

        <div key={activeTab} className="flex flex-1 overflow-hidden relative animate-tab-slide">
          {/* Main content */}
          {activeTab === 'ai' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1a1e2e] shrink-0">
                <div className="flex bg-[#1a1e2e] rounded-lg overflow-hidden">
                  <button
                    onClick={() => setAiView('signals')}
                    className={`px-3 py-1.5 text-xs font-bold transition-colors ${aiView === 'signals' ? 'bg-[#f0b90b] text-black' : 'text-[#848e9c]'}`}
                  >
                    {bi('سیگناڵەکان', 'Signals')}
                  </button>
                  <button
                    onClick={() => setAiView('confluence')}
                    className={`px-3 py-1.5 text-xs font-bold transition-colors ${aiView === 'confluence' ? 'bg-[#f0b90b] text-black' : 'text-[#848e9c]'}`}
                  >
                    {bi('هاوئاهەنگی', 'Confluence')}
                  </button>
                </div>
                {/* Single-asset selector for the Confluence view */}
                {aiView === 'confluence' && (
                  <div className="relative">
                    <select
                      value={confluenceAsset}
                      onChange={(e) => setConfluenceAsset(e.target.value as AssetKey)}
                      aria-label={bi('هەڵبژاردنی ئامراز', 'Select asset')}
                      className="appearance-none bg-[#1a1e2e] text-white text-xs font-bold rounded-lg pl-3 pr-8 py-1.5 border border-[#252a3a] focus:outline-none focus:border-[#f0b90b] cursor-pointer"
                    >
                      {SIGNAL_ASSETS.map((a) => (
                        <option key={a.key} value={a.key} className="bg-[#1a1e2e] text-white">
                          {a.emoji} {a.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#848e9c] pointer-events-none" />
                  </div>
                )}
              </div>
              {aiView === 'signals' ? (
                <SignalsPanel />
              ) : (
                <AIAnalysisPanel
                  btcPrice={coinsMap.get('XBT/USD')?.price ?? 0}
                  goldPrice={metals.find((m) => m.code === 'XAU')?.price ?? 0}
                  asset={confluenceAsset}
                />
              )}
            </div>
          ) : activeTab === 'crypto' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Overview / Chart / Analysis sub-toggle — mobile-friendly */}
              <div className="flex items-center gap-4 px-3 py-2 border-b border-[#1a1e2e] shrink-0 overflow-x-auto no-scrollbar [direction:ltr]">
                {currentPrice > 0 && (
                  <span className="flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[13px] leading-none whitespace-nowrap shrink-0">
                    <span className="font-bold text-[#f0b90b]">{getDisplaySymbol(getSymbolFromPair(selectedPair))}</span>
                    <span className="font-semibold tabular-nums text-white">${currentPrice >= 1000 ? currentPrice.toLocaleString(undefined, { maximumFractionDigits: 1 }) : currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </span>
                )}
                <div className="flex bg-[#1a1e2e] rounded-lg overflow-hidden shrink-0 ml-auto">
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
              <div className="flex items-center gap-4 px-3 py-2 border-b border-[#1a1e2e] shrink-0 overflow-x-auto no-scrollbar [direction:ltr]">
                {(() => {
                  const c = forexCurrencies.find(x => x.code === (selectedForexCode || 'EUR'));
                  if (!c) return null;
                  return (
                    <span className="flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[13px] leading-none whitespace-nowrap shrink-0">
                      <span className="font-bold text-[#2962ff]">{c.code}</span>
                      <span className="font-semibold tabular-nums text-white">{c.rate >= 1000 ? c.rate.toLocaleString(undefined, { maximumFractionDigits: 2 }) : c.rate.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                    </span>
                  );
                })()}
                <div className="flex bg-[#1a1e2e] rounded-lg overflow-hidden shrink-0 ml-auto">
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
              <div className="flex items-center gap-4 px-3 py-2 border-b border-[#1a1e2e] shrink-0 overflow-x-auto no-scrollbar [direction:ltr]">
                {selectedMetalCode && (() => {
                  const m = metals.find(x => x.code === selectedMetalCode);
                  if (!m) return null;
                  return (
                    <span className="flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[13px] leading-none whitespace-nowrap shrink-0">
                      <span className="font-bold text-[#d4af37]">{m.code}</span>
                      <span className="font-semibold tabular-nums text-white">${m.price >= 1000 ? m.price.toLocaleString(undefined, { maximumFractionDigits: 1 }) : m.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </span>
                  );
                })()}
                <div className="flex bg-[#1a1e2e] rounded-lg overflow-hidden shrink-0 ml-auto">
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

        {/* Bottom tab bar navigation */}
        <BottomNav
          activeTab={activeTab}
          onTab={(tab) => { setShowSidebar(false); setActiveTab(tab); }}
          onHome={() => window.location.href = 'https://ctp.kurdcloud.xyz'}
          onNews={() => setShowNews(true)}
          onVerify={() => setShowVerify(true)}
          onBot={() => navigate('/bots')}
          onConvert={() => setShowConverter(true)}
          bi={bi}
        />
      </div>

      {showConverter && (
        <CurrencyConverter
          currencies={forexCurrencies}
          metals={metals}
          onClose={() => setShowConverter(false)}
        />
      )}

      <MarketNewsModal open={showNews} onClose={() => setShowNews(false)} />
      {showVerify && <IndicatorVerify onClose={() => setShowVerify(false)} />}
    </DemoAccountProvider>

  );
}
