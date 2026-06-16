import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { TrendingUp, TrendingDown, Minus, Target, Clock, Zap } from 'lucide-react';
import type { CalendarEvent } from '@/components/crypto/EventAlertBanner';

interface Props {
  events: CalendarEvent[];
  price: number;
  loading: boolean;
  /** Epoch ms of the last successful refresh (drives "updated Xm ago"). */
  lastUpdated?: number | null;
}

const C_BULL = '#0ecb81';
const C_BEAR = '#f6465d';
const C_NEUTRAL = '#f0b90b';

// Currencies whose data moves gold the most.
const GOLD_CURRENCIES = ['USD', 'CHF', 'GBP', 'JPY', 'EUR'];

// Indicators where a HIGHER value means a WEAKER economy/USD (inverse logic).
const INVERSE_KEYWORDS = ['unemployment', 'jobless', 'claims', 'misery', 'deficit', 'inventories'];

const FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CHF: '🇨🇭', CAD: '🇨🇦', AUD: '🇦🇺', NZD: '🇳🇿',
};

const fmt = (n: number, d = 2) =>
  n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });

function parseNum(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/,/g, '').replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// Predicted gold direction for an event: +1 = gold up, -1 = gold down, 0 = unclear.
function goldDirection(ev: CalendarEvent): number {
  const actual = parseNum(ev.actual);
  const fcst = parseNum(ev.forecast);
  const prev = parseNum(ev.previous);
  const ref = actual !== null ? (fcst !== null ? fcst : prev) : prev;
  const value = actual !== null ? actual : fcst;
  if (value === null || ref === null || value === ref) return 0;
  const inverse = INVERSE_KEYWORDS.some((k) => ev.title.toLowerCase().includes(k));
  // Hotter-than-reference data => stronger USD (unless inverse) => gold down.
  const hotter = value > ref;
  const usdUp = inverse ? !hotter : hotter;
  return usdUp ? -1 : 1;
}

function impactWeight(impact: string): number {
  const i = (impact || '').toLowerCase();
  return i === 'high' ? 2 : i === 'medium' ? 1 : 0.4;
}

export function GoldSignalPanel({ events, price, loading, lastUpdated }: Props) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);

  // Tick once a minute so the "updated Xm ago" + countdowns stay fresh.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Today's gold-relevant events.
  const todayEvents = useMemo(() => {
    return events
      .filter((e) => isToday(e.date))
      .filter((e) => GOLD_CURRENCIES.includes(e.country) || e.country === 'All')
      .filter((e) => {
        const imp = (e.impact || '').toLowerCase();
        return imp === 'high' || imp === 'medium';
      })
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  }, [events]);

  const signal = useMemo(() => {
    let score = 0;
    let totalWeight = 0;
    let decided = 0;
    let highCount = 0;
    for (const e of todayEvents) {
      const w = impactWeight(e.impact);
      // USD events get extra pull on gold.
      const mult = e.country === 'USD' ? 1.3 : 1;
      const dir = goldDirection(e);
      if ((e.impact || '').toLowerCase() === 'high') highCount += 1;
      totalWeight += w * mult;
      if (dir !== 0) {
        score += dir * w * mult;
        decided += 1;
      }
    }

    const bias: 'bullish' | 'bearish' | 'neutral' =
      score > 0.5 ? 'bullish' : score < -0.5 ? 'bearish' : 'neutral';

    // Confidence: how strongly the decided events agree, scaled by high-impact presence.
    const agreement = totalWeight > 0 ? Math.abs(score) / totalWeight : 0;
    let confidence: 'low' | 'medium' | 'high' = 'low';
    if (decided === 0) {
      confidence = 'low';
    } else if (agreement >= 0.6 && highCount >= 1) {
      confidence = 'high';
    } else if (agreement >= 0.35) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return { bias, confidence, score: Math.round(score * 10) / 10, decided, total: todayEvents.length, highCount };
  }, [todayEvents]);

  // Suggested entry zones derived from current price + bias.
  const zones = useMemo(() => {
    if (!price || price <= 0 || signal.bias === 'neutral') return null;
    if (signal.bias === 'bullish') {
      return {
        primary: { label: bi('ناوچەی کڕین', 'Buy zone'), lo: price * 0.997, hi: price * 0.999, color: C_BULL },
        deep: { label: bi('کڕینی قووڵ', 'Deep buy'), lo: price * 0.992, hi: price * 0.995, color: C_BULL },
        target: price * 1.006,
        stop: price * 0.989,
      };
    }
    return {
      primary: { label: bi('ناوچەی فرۆشتن', 'Sell zone'), lo: price * 1.001, hi: price * 1.003, color: C_BEAR },
      deep: { label: bi('فرۆشتنی بەرز', 'High sell'), lo: price * 1.005, hi: price * 1.008, color: C_BEAR },
      target: price * 0.994,
      stop: price * 1.011,
    };
  }, [price, signal.bias, language]);

  const biasColor = signal.bias === 'bullish' ? C_BULL : signal.bias === 'bearish' ? C_BEAR : C_NEUTRAL;
  const BiasIcon = signal.bias === 'bullish' ? TrendingUp : signal.bias === 'bearish' ? TrendingDown : Minus;
  const biasLabel =
    signal.bias === 'bullish' ? bi('بەرزبوونەوە (BULLISH)', 'BULLISH') :
    signal.bias === 'bearish' ? bi('دابەزین (BEARISH)', 'BEARISH') :
    bi('بێلایەن (NEUTRAL)', 'NEUTRAL');

  const confColor = signal.confidence === 'high' ? C_BULL : signal.confidence === 'medium' ? C_NEUTRAL : '#848e9c';
  const confLabel =
    signal.confidence === 'high' ? bi('بەرز', 'High') :
    signal.confidence === 'medium' ? bi('مامناوەند', 'Medium') :
    bi('نزم', 'Low');

  const eventTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(language === 'en' || language === 'tr' ? 'en-US' : 'en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false,
    });

  const updatedAgo = (() => {
    if (!lastUpdated) return '';
    const m = Math.max(0, Math.round((now - lastUpdated) / 60000));
    if (m < 1) return bi('ئێستا', 'just now');
    return bi(`${m} خولەک لەمەوبەر`, `${m}m ago`);
  })();

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: biasColor + '55', backgroundColor: biasColor + '0d' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[#d4af37]" />
          <h3 className="text-sm font-bold text-white">{bi('سیگناڵی زێڕ — ئەمڕۆ', 'Gold Signal — Today')}</h3>
        </div>
        <span className="text-[10px] text-[#848e9c]">{bi('نوێدەبێتەوە هەر ٣٠ خولەک', 'auto · 30 min')}{updatedAgo ? ` · ${updatedAgo}` : ''}</span>
      </div>

      {loading && events.length === 0 ? (
        <div className="m-4 h-24 animate-pulse bg-[#1a1e2e] rounded-lg" />
      ) : (
        <div className="p-4 space-y-3">
          {/* Bias + confidence */}
          <div className="flex items-center justify-between rounded-lg bg-[#0a0e17] p-3">
            <div className="flex items-center gap-2">
              <BiasIcon className={`h-7 w-7 ${signal.bias !== 'neutral' ? 'animate-flash-blink' : ''}`} style={{ color: biasColor }} />
              <div>
                <div className="text-lg font-extrabold leading-none" style={{ color: biasColor }}>{biasLabel}</div>
                <div className="text-[10px] text-[#848e9c] mt-1">{bi('لایەنی ئەمڕۆ', "Today's bias")}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-base font-bold" style={{ color: confColor }}>{confLabel}</div>
              <div className="text-[10px] text-[#848e9c]">{bi('ئاستی متمانە', 'Confidence')}</div>
            </div>
          </div>

          {/* Key events to watch */}
          <div>
            <div className="text-[11px] font-bold text-white mb-1.5 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-[#f0b90b]" />
              {bi('ڕووداوە گرنگەکانی ئەمڕۆ', "Key events to watch")}
            </div>
            {todayEvents.length === 0 ? (
              <p className="text-[11px] text-[#848e9c]">{bi('هیچ ڕووداوێکی کاریگەری زێڕ نییە ئەمڕۆ.', 'No gold-moving events scheduled today.')}</p>
            ) : (
              <div className="space-y-1">
                {todayEvents.slice(0, 6).map((e, i) => {
                  const dir = goldDirection(e);
                  const high = (e.impact || '').toLowerCase() === 'high';
                  const t = Date.parse(e.date);
                  const upcoming = !Number.isNaN(t) && t > now;
                  const dColor = dir > 0 ? C_BULL : dir < 0 ? C_BEAR : '#848e9c';
                  return (
                    <div key={`${e.title}-${i}`} className="flex items-center gap-2 rounded-lg bg-[#0a0e17] px-2.5 py-1.5">
                      <span className="text-sm shrink-0">{FLAGS[e.country] ?? '🌐'}</span>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: high ? C_BEAR : C_NEUTRAL }} />
                      <span className="text-[11px] text-white truncate flex-1">{e.title}</span>
                      {dir !== 0 && (
                        <span className="shrink-0">
                          {dir > 0 ? <TrendingUp className="h-3.5 w-3.5" style={{ color: dColor }} /> : <TrendingDown className="h-3.5 w-3.5" style={{ color: dColor }} />}
                        </span>
                      )}
                      <span className={`text-[10px] font-bold tabular-nums shrink-0 ${upcoming ? 'text-white' : 'text-[#848e9c] line-through'}`}>{eventTime(e.date)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Suggested entry zones */}
          <div>
            <div className="text-[11px] font-bold text-white mb-1.5 flex items-center gap-1">
              <Target className="h-3.5 w-3.5 text-[#d4af37]" />
              {bi('ناوچەکانی داخڵبوون', 'Suggested entry zones')}
            </div>
            {zones && price > 0 ? (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-2">
                  {[zones.primary, zones.deep].map((z, i) => (
                    <div key={i} className="rounded-lg bg-[#0a0e17] p-2 border" style={{ borderColor: z.color + '40' }}>
                      <div className="text-[9px] uppercase tracking-wide" style={{ color: z.color }}>{z.label}</div>
                      <div className="text-xs font-bold text-white tabular-nums">${fmt(z.lo)} – ${fmt(z.hi)}</div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-[#0a0e17] p-2 text-center">
                    <div className="text-[9px] text-[#848e9c]">Take Profit</div>
                    <div className="text-xs font-bold tabular-nums" style={{ color: C_BULL }}>${fmt(zones.target)}</div>
                  </div>
                  <div className="rounded-lg bg-[#0a0e17] p-2 text-center">
                    <div className="text-[9px] text-[#848e9c]">Stop Loss</div>
                    <div className="text-xs font-bold tabular-nums" style={{ color: C_BEAR }}>${fmt(zones.stop)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-[#848e9c]">
                {bi('لایەن بێلایەنە — چاوەڕێی ڕووداوی گرنگ بکە پێش داخڵبوون.', 'Bias is neutral — wait for a key event before taking a position.')}
              </p>
            )}
          </div>

          <p className="text-[10px] text-[#848e9c] leading-relaxed">
            {bi('بنەما: ساڵنامەی ئابووری ئەمڕۆ (پێشبینی بەرامبەر پێشتر). یارمەتیدەرە نەک ڕاوێژی دارایی.', 'Derived from today\'s economic calendar (forecast vs previous). Guidance, not financial advice.')}
          </p>
        </div>
      )}
    </div>
  );
}
