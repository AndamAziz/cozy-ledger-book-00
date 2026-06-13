export interface ForexCurrency {
  code: string;
  name: string;
  flag: string;
  rate: number;        // rate vs USD
  prevRate: number;    // previous day rate
  change: number;      // % change
}

// Major + regional currencies with flags
export const CURRENCIES: { code: string; name: string; flag: string }[] = [
  { code: 'EUR', name: 'Euro', flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound', flag: '🇬🇧' },
  { code: 'JPY', name: 'Japanese Yen', flag: '🇯🇵' },
  { code: 'CHF', name: 'Swiss Franc', flag: '🇨🇭' },
  { code: 'CAD', name: 'Canadian Dollar', flag: '🇨🇦' },
  { code: 'AUD', name: 'Australian Dollar', flag: '🇦🇺' },
  { code: 'NZD', name: 'New Zealand Dollar', flag: '🇳🇿' },
  { code: 'CNY', name: 'Chinese Yuan', flag: '🇨🇳' },
  { code: 'INR', name: 'Indian Rupee', flag: '🇮🇳' },
  { code: 'TRY', name: 'Turkish Lira', flag: '🇹🇷' },
  { code: 'SAR', name: 'Saudi Riyal', flag: '🇸🇦' },
  { code: 'AED', name: 'UAE Dirham', flag: '🇦🇪' },
  { code: 'IQD', name: 'Iraqi Dinar', flag: '🇮🇶' },
  { code: 'IRR', name: 'Iranian Rial', flag: '🇮🇷' },
  { code: 'KWD', name: 'Kuwaiti Dinar', flag: '🇰🇼' },
  { code: 'BHD', name: 'Bahraini Dinar', flag: '🇧🇭' },
  { code: 'QAR', name: 'Qatari Riyal', flag: '🇶🇦' },
  { code: 'OMR', name: 'Omani Rial', flag: '🇴🇲' },
  { code: 'JOD', name: 'Jordanian Dinar', flag: '🇯🇴' },
  { code: 'EGP', name: 'Egyptian Pound', flag: '🇪🇬' },
  { code: 'KRW', name: 'South Korean Won', flag: '🇰🇷' },
  { code: 'SGD', name: 'Singapore Dollar', flag: '🇸🇬' },
  { code: 'HKD', name: 'Hong Kong Dollar', flag: '🇭🇰' },
  { code: 'SEK', name: 'Swedish Krona', flag: '🇸🇪' },
  { code: 'NOK', name: 'Norwegian Krone', flag: '🇳🇴' },
  { code: 'DKK', name: 'Danish Krone', flag: '🇩🇰' },
  { code: 'PLN', name: 'Polish Zloty', flag: '🇵🇱' },
  { code: 'CZK', name: 'Czech Koruna', flag: '🇨🇿' },
  { code: 'HUF', name: 'Hungarian Forint', flag: '🇭🇺' },
  { code: 'RUB', name: 'Russian Ruble', flag: '🇷🇺' },
  { code: 'BRL', name: 'Brazilian Real', flag: '🇧🇷' },
  { code: 'MXN', name: 'Mexican Peso', flag: '🇲🇽' },
  { code: 'ZAR', name: 'South African Rand', flag: '🇿🇦' },
  { code: 'THB', name: 'Thai Baht', flag: '🇹🇭' },
  { code: 'MYR', name: 'Malaysian Ringgit', flag: '🇲🇾' },
  { code: 'IDR', name: 'Indonesian Rupiah', flag: '🇮🇩' },
  { code: 'PHP', name: 'Philippine Peso', flag: '🇵🇭' },
  { code: 'PKR', name: 'Pakistani Rupee', flag: '🇵🇰' },
  { code: 'NGN', name: 'Nigerian Naira', flag: '🇳🇬' },
  { code: 'GEL', name: 'Georgian Lari', flag: '🇬🇪' },
  { code: 'XAG', name: 'Silver (Troy Oz)', flag: '🥈' },
];

interface ERApiResponse {
  result: string;
  rates: Record<string, number>;
}

interface LiveRate {
  price: number;
  prev: number;
  change: number;
  high: number;
  low: number;
}

export interface ForexResult {
  currencies: ForexCurrency[];
  marketOpen: boolean;
}

const FOREX_FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/forex-prices`;
const FX_HEADERS = {
  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
};

/** Fetch live (Yahoo-backed) forex rates from the edge function, with er-api fallback. */
export async function fetchForexRates(): Promise<ForexResult> {
  // Primary: real-time edge function (Yahoo spot, refreshes every ~2s server-side)
  try {
    const res = await fetch(FOREX_FN, { headers: FX_HEADERS });
    if (res.ok) {
      const data = await res.json();
      const rates: Record<string, LiveRate> = data?.rates ?? {};
      const currencies = CURRENCIES.filter(c => rates[c.code]?.price > 0).map(c => {
        const r = rates[c.code];
        return {
          ...c,
          rate: r.price,
          prevRate: r.prev,
          change: r.change,
        } as ForexCurrency;
      });
      if (currencies.length > 0) {
        return { currencies, marketOpen: !!data?.marketOpen };
      }
    }
  } catch { /* fall through to er-api */ }

  // Fallback: open.er-api.com daily snapshot (no key)
  const latestRes = await fetch('https://open.er-api.com/v6/latest/USD');
  if (!latestRes.ok) throw new Error('Failed to fetch forex rates');
  const latest: ERApiResponse = await latestRes.json();

  const prevKey = 'forex-prev-rates';
  const prevStored = localStorage.getItem(prevKey);
  let prevRates: Record<string, number> = {};
  try {
    if (prevStored) {
      const parsed = JSON.parse(prevStored);
      if (Date.now() - parsed.timestamp < 25 * 60 * 60 * 1000) {
        prevRates = parsed.rates;
      }
    }
  } catch {}

  localStorage.setItem(prevKey, JSON.stringify({ timestamp: Date.now(), rates: latest.rates }));

  const currencies = CURRENCIES
    .filter(c => latest.rates[c.code] != null)
    .map(c => {
      const rate = latest.rates[c.code];
      const prev = prevRates[c.code] || rate;
      const change = prev !== 0 ? ((rate - prev) / prev) * 100 : 0;
      return {
        ...c,
        rate,
        prevRate: prev,
        change,
      };
    });
}
