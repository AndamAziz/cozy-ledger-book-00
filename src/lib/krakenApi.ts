export interface KrakenCoin {
  pair: string;
  wsName: string;
  base: string;
  quote: string;
  symbol: string;
  name: string;
  logo: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}

export interface OHLCCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Map of crypto symbols to friendly names and logos (emoji fallback)
// Metadata for the pairs we actually track (kept in sync with TRACKED_PAIRS below).
const COIN_META: Record<string, { name: string; logo: string }> = {
  XBT: { name: 'Bitcoin', logo: '₿' },
  ETH: { name: 'Ethereum', logo: 'Ξ' },
  XRP: { name: 'Ripple', logo: '✕' },
  SOL: { name: 'Solana', logo: '◎' },
  ADA: { name: 'Cardano', logo: '₳' },
  DOT: { name: 'Polkadot', logo: '●' },
  LTC: { name: 'Litecoin', logo: 'Ł' },
  LINK: { name: 'Chainlink', logo: '⬡' },
  AVAX: { name: 'Avalanche', logo: '▲' },
  DOGE: { name: 'Dogecoin', logo: 'Ð' },
  ATOM: { name: 'Cosmos', logo: '⚛' },
  UNI: { name: 'Uniswap', logo: '🦄' },
  AAVE: { name: 'Aave', logo: '👻' },
  SHIB: { name: 'Shiba Inu', logo: '🐕' },
  TRX: { name: 'Tron', logo: '⟁' },
  NEAR: { name: 'NEAR Protocol', logo: 'Ⓝ' },
  GRT: { name: 'The Graph', logo: '◆' },
  XLM: { name: 'Stellar', logo: '✦' },
  XTZ: { name: 'Tezos', logo: 'ꜩ' },
  ALGO: { name: 'Algorand', logo: 'Å' },
};

// Pairs we want to track (Kraken uses XBT instead of BTC)
export const TRACKED_PAIRS = [
  'XBT/USD', 'ETH/USD', 'XRP/USD', 'SOL/USD', 'ADA/USD',
  'DOT/USD', 'LTC/USD', 'LINK/USD', 'AVAX/USD', 'DOGE/USD',
  'ATOM/USD', 'UNI/USD', 'AAVE/USD', 'SHIB/USD', 'TRX/USD',
  'NEAR/USD', 'GRT/USD', 'XLM/USD', 'XTZ/USD', 'ALGO/USD',
];

export function getSymbolFromPair(pair: string): string {
  return pair.replace('/USD', '');
}

export function normalizeKrakenPair(pair: string): string {
  return pair === 'XDG/USD' ? 'DOGE/USD' : pair;
}

export function getDisplaySymbol(symbol: string): string {
  return symbol === 'XBT' ? 'BTC' : symbol;
}

export function getCoinMeta(symbol: string): { name: string; logo: string } {
  return COIN_META[symbol] || { name: symbol, logo: '🪙' };
}

// Kraken REST API pair names use different format
const REST_PAIR_MAP: Record<string, string> = {
  'XBT/USD': 'XXBTZUSD',
  'ETH/USD': 'XETHZUSD',
  'XRP/USD': 'XXRPZUSD',
  'DOGE/USD': 'XDGUSD',
  'LTC/USD': 'XLTCZUSD',
  'XLM/USD': 'XXLMZUSD',
  'XTZ/USD': 'XTZUSD',
  'EOS/USD': 'EOSUSD',
  'ZEC/USD': 'XZECZUSD',
  'DASH/USD': 'DASHUSD',
};

export function getRestPairName(wsPair: string): string {
  return REST_PAIR_MAP[wsPair] || wsPair.replace('/', '');
}

// Timeframe map: label -> Kraken interval in minutes
export const TIMEFRAMES: { label: string; interval: number }[] = [
  { label: '1m', interval: 1 },
  { label: '5m', interval: 5 },
  { label: '15m', interval: 15 },
  { label: '1h', interval: 60 },
  { label: '4h', interval: 240 },
  { label: '1D', interval: 1440 },
];

export async function fetchOHLC(pair: string, interval: number): Promise<OHLCCandle[]> {
  const restPair = getRestPairName(pair);
  // Calculate since timestamp (enough candles for chart)
  const candleCount = 300;
  const since = Math.floor(Date.now() / 1000) - candleCount * interval * 60;

  const url = `https://api.kraken.com/0/public/OHLC?pair=${restPair}&interval=${interval}&since=${since}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.error && data.error.length > 0) {
    throw new Error(data.error[0]);
  }
  
  const resultKey = Object.keys(data.result).find(k => k !== 'last');
  if (!resultKey) return [];
  
  const candles: OHLCCandle[] = data.result[resultKey].map((c: number[]) => ({
    time: c[0],
    open: parseFloat(String(c[1])),
    high: parseFloat(String(c[2])),
    low: parseFloat(String(c[3])),
    close: parseFloat(String(c[4])),
    volume: parseFloat(String(c[6])),
  }));
  
  return candles;
}

export async function fetchTicker(pairs: string[]): Promise<Record<string, { price: number; change24h: number; volume24h: number; high24h: number; low24h: number }>> {
  const restPairs = pairs.map(p => getRestPairName(p)).join(',');
  const url = `https://api.kraken.com/0/public/Ticker?pair=${restPairs}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.error && data.error.length > 0) {
    throw new Error(data.error[0]);
  }
  
  const result: Record<string, { price: number; change24h: number; volume24h: number; high24h: number; low24h: number }> = {};
  
  for (const pair of pairs) {
    const restName = getRestPairName(pair);
    // Try both the exact name and possible alternatives
    const tickerData = data.result[restName] || data.result[pair.replace('/', '')];
    if (tickerData) {
      const lastPrice = parseFloat(tickerData.c[0]);
      const openPrice = parseFloat(tickerData.o);
      const change24h = openPrice > 0 ? ((lastPrice - openPrice) / openPrice) * 100 : 0;
      
      result[pair] = {
        price: lastPrice,
        change24h,
        volume24h: parseFloat(tickerData.v[1]),
        high24h: parseFloat(tickerData.h[1]),
        low24h: parseFloat(tickerData.l[1]),
      };
    }
  }
  
  return result;
}
