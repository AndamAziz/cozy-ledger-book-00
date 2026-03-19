export interface Metal {
  code: string;
  name: string;
  symbol: string;
  emoji: string;
  price: number;
  prevPrice: number;
  change: number;
  high24h: number;
  low24h: number;
  unit: string;
}

export const METALS_META: { code: string; name: string; symbol: string; emoji: string }[] = [
  { code: 'XAU', name: 'Gold', symbol: 'XAU/USD', emoji: '🥇' },
  { code: 'XAG', name: 'Silver', symbol: 'XAG/USD', emoji: '🥈' },
  { code: 'XPT', name: 'Platinum', symbol: 'XPT/USD', emoji: '⚪' },
  { code: 'XPD', name: 'Palladium', symbol: 'XPD/USD', emoji: '🔘' },
];

interface GoldPriceResponse {
  items: Array<{
    xauPrice: number;
    xagPrice: number;
    xptPrice: number;
    xpdPrice: number;
    curr: string;
  }>;
}

const PREV_KEY = 'metals-prev-prices';

function loadPrevPrices(): Record<string, number> {
  try {
    const stored = localStorage.getItem(PREV_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Date.now() - parsed.timestamp < 25 * 60 * 60 * 1000) {
        return parsed.prices;
      }
    }
  } catch {}
  return {};
}

function savePrevPrices(prices: Record<string, number>) {
  localStorage.setItem(PREV_KEY, JSON.stringify({
    timestamp: Date.now(),
    prices,
  }));
}

export async function fetchMetalsPrices(): Promise<Metal[]> {
  const res = await fetch('https://data-asg.goldprice.org/dbXRates/USD');
  if (!res.ok) throw new Error('Failed to fetch metals prices');

  const data: GoldPriceResponse = await res.json();
  const item = data.items?.[0];
  if (!item) throw new Error('No metals data');

  const currentPrices: Record<string, number> = {
    XAU: item.xauPrice,
    XAG: item.xagPrice,
    XPT: item.xptPrice,
    XPD: item.xpdPrice,
  };

  const prev = loadPrevPrices();
  savePrevPrices(currentPrices);

  return METALS_META.map(m => {
    const price = currentPrices[m.code] || 0;
    const prevPrice = prev[m.code] || price;
    const change = prevPrice !== 0 ? ((price - prevPrice) / prevPrice) * 100 : 0;
    return {
      ...m,
      price,
      prevPrice,
      change,
      high24h: price, // API doesn't provide 24h high/low
      low24h: price,
      unit: 'oz',
    };
  });
}
