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

export const METALS_META: { code: string; name: string; symbol: string; emoji: string; category: 'metal' | 'oil' | 'gas'; unit: string }[] = [
  { code: 'XAU', name: 'Gold', symbol: 'XAU/USD', emoji: '🥇', category: 'metal', unit: 'oz' },
  { code: 'XAG', name: 'Silver', symbol: 'XAG/USD', emoji: '🥈', category: 'metal', unit: 'oz' },
  { code: 'XPT', name: 'Platinum', symbol: 'XPT/USD', emoji: '⚪', category: 'metal', unit: 'oz' },
  { code: 'XPD', name: 'Palladium', symbol: 'XPD/USD', emoji: '🔘', category: 'metal', unit: 'oz' },
  { code: 'USOIL', name: 'US Oil (WTI)', symbol: 'WTI/USD', emoji: '🛢️', category: 'oil', unit: 'bbl' },
  { code: 'UKOIL', name: 'UK Oil (Brent)', symbol: 'BRENT/USD', emoji: '🛢️', category: 'oil', unit: 'bbl' },
  { code: 'NATGAS', name: 'Natural Gas', symbol: 'NG/USD', emoji: '🔥', category: 'gas', unit: 'MMBtu' },
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
  const prev = loadPrevPrices();
  let livePrices: Record<string, number> = {};

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const res = await fetch(`${supabaseUrl}/functions/v1/commodities-prices`, {
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
      },
    });

    if (res.ok) {
      const data = await res.json();
      livePrices = data.prices || {};
    }
  } catch (e) {
    console.error('Failed to fetch live commodities prices:', e);
  }

  // Never inject fake defaults; fallback only to last known real value if needed
  const effectivePrices: Record<string, number> = {};
  for (const meta of METALS_META) {
    const live = Number(livePrices[meta.code]);
    const lastKnown = Number(prev[meta.code]);
    if (Number.isFinite(live) && live > 0) {
      effectivePrices[meta.code] = live;
    } else if (Number.isFinite(lastKnown) && lastKnown > 0) {
      effectivePrices[meta.code] = lastKnown;
    } else {
      effectivePrices[meta.code] = 0;
    }
  }

  if (Object.values(effectivePrices).some((v) => v > 0)) {
    savePrevPrices(effectivePrices);
  }

  return METALS_META.map((m) => {
    const price = effectivePrices[m.code] || 0;
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
