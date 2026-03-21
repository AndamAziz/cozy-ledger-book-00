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
  let currentPrices: Record<string, number> = {};

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    
    const res = await fetch(`${supabaseUrl}/functions/v1/commodities-prices`, {
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
      },
    });
    
    if (res.ok) {
      const data = await res.json();
      currentPrices = data.prices || {};
    }
  } catch (e) {
    console.error('Failed to fetch commodities prices:', e);
  }

  // Fallback prices if API fails
  if (!currentPrices.XAU) currentPrices.XAU = 3045.00;
  if (!currentPrices.XAG) currentPrices.XAG = 33.50;
  if (!currentPrices.XPT) currentPrices.XPT = 985.00;
  if (!currentPrices.XPD) currentPrices.XPD = 965.00;
  if (!currentPrices.USOIL) currentPrices.USOIL = 68.50;
  if (!currentPrices.UKOIL) currentPrices.UKOIL = 72.30;

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
