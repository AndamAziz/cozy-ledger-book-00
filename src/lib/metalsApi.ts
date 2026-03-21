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
  category: 'metal' | 'oil';
}

export const METALS_META: { code: string; name: string; symbol: string; emoji: string; category: 'metal' | 'oil'; unit: string }[] = [
  { code: 'XAU', name: 'Gold', symbol: 'XAU/USD', emoji: '🥇', category: 'metal', unit: 'oz' },
  { code: 'XAG', name: 'Silver', symbol: 'XAG/USD', emoji: '🥈', category: 'metal', unit: 'oz' },
  { code: 'XPT', name: 'Platinum', symbol: 'XPT/USD', emoji: '⚪', category: 'metal', unit: 'oz' },
  { code: 'XPD', name: 'Palladium', symbol: 'XPD/USD', emoji: '🔘', category: 'metal', unit: 'oz' },
  { code: 'USOIL', name: 'US Oil (WTI)', symbol: 'WTI/USD', emoji: '🛢️', category: 'oil', unit: 'bbl' },
  { code: 'UKOIL', name: 'UK Oil (Brent)', symbol: 'BRENT/USD', emoji: '🛢️', category: 'oil', unit: 'bbl' },
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

async function fetchOilPrices(): Promise<{ wti: number; brent: number }> {
  try {
    // Try to get cached oil prices first
    const cacheKey = 'oil-prices-cache';
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Use cache if less than 5 minutes old
      if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
        return { wti: parsed.wti, brent: parsed.brent };
      }
    }

    // Fetch from a free oil price source
    const res = await fetch('https://api.commodities-api.com/api/latest?access_key=demo&base=USD&symbols=WTIOIL,BRENTOIL');
    if (res.ok) {
      const data = await res.json();
      if (data.data?.rates) {
        const wti = data.data.rates.WTIOIL ? 1 / data.data.rates.WTIOIL : 68.5;
        const brent = data.data.rates.BRENTOIL ? 1 / data.data.rates.BRENTOIL : 72.3;
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), wti, brent }));
        return { wti, brent };
      }
    }
  } catch {}

  // Fallback: use stored or approximate market prices
  const cacheKey = 'oil-prices-cache';
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      return { wti: parsed.wti, brent: parsed.brent };
    } catch {}
  }
  
  return { wti: 68.50, brent: 72.30 };
}

export async function fetchMetalsPrices(): Promise<Metal[]> {
  const [metalsRes, oilPrices] = await Promise.all([
    fetch('https://data-asg.goldprice.org/dbXRates/USD'),
    fetchOilPrices(),
  ]);

  let metalPrices: Record<string, number> = {};
  
  if (metalsRes.ok) {
    const data: GoldPriceResponse = await metalsRes.json();
    const item = data.items?.[0];
    if (item) {
      metalPrices = {
        XAU: item.xauPrice,
        XAG: item.xagPrice,
        XPT: item.xptPrice,
        XPD: item.xpdPrice,
      };
    }
  }

  const currentPrices: Record<string, number> = {
    ...metalPrices,
    USOIL: oilPrices.wti,
    UKOIL: oilPrices.brent,
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
      high24h: price,
      low24h: price,
      unit: m.unit,
    };
  });
}
