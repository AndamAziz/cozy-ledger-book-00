import { useEffect, useState, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useLanguage } from '@/contexts/LanguageContext';
import { Newspaper, CalendarClock, Loader2, RefreshCw, ExternalLink, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';

interface CalendarEvent {
  title: string;
  country: string;
  impact: string;
  date: string;
  forecast: string;
  previous: string;
  actual: string;
}

interface NewsItem {
  title: string;
  link: string;
  source: string;
  category: string;
  pubDate: string;
  summary: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CHF: '🇨🇭', CAD: '🇨🇦',
  AUD: '🇦🇺', NZD: '🇳🇿', CNY: '🇨🇳', All: '🌐',
};

const CAT_LABEL: Record<string, { ku: string; en: string; color: string }> = {
  forex: { ku: 'دراو', en: 'Forex', color: '#2962ff' },
  crypto: { ku: 'کریپتۆ', en: 'Crypto', color: '#f0b90b' },
  commodities: { ku: 'کاڵا', en: 'Commodities', color: '#d4af37' },
  economy: { ku: 'ئابووری', en: 'Economy', color: '#0ecb81' },
  markets: { ku: 'بازاڕ', en: 'Markets', color: '#a78bfa' },
};

// Direction colors
const C_UP = '#0ecb81';   // stronger USD => green
const C_DOWN = '#f6465d';  // weaker USD => red
const C_FLAT = '#f0b90b';  // undecided => orange

// Indicators where a HIGHER value means a WEAKER economy/USD (inverse logic)
const INVERSE_KEYWORDS = ['unemployment', 'jobless', 'claims', 'misery', 'deficit', 'inventories'];

function parseNum(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/,/g, '').replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

interface EventAnalysis {
  pct: number | null;       // % change of actual vs previous
  usdUp: boolean | null;    // true = stronger USD, false = weaker, null = undecided
  hasResult: boolean;       // actual figure is published
}

function analyzeEvent(ev: CalendarEvent): EventAnalysis {
  const actual = parseNum(ev.actual);
  const prev = parseNum(ev.previous);
  const fcst = parseNum(ev.forecast);

  let pct: number | null = null;
  if (actual !== null && prev !== null && prev !== 0) {
    pct = ((actual - prev) / Math.abs(prev)) * 100;
  }

  const ref = fcst !== null ? fcst : prev;
  let usdUp: boolean | null = null;
  if (actual !== null && ref !== null) {
    if (actual === ref) usdUp = null;
    else {
      const hotter = actual > ref;
      const inverse = INVERSE_KEYWORDS.some((k) => ev.title.toLowerCase().includes(k));
      usdUp = inverse ? !hotter : hotter;
    }
  }

  return { pct, usdUp, hasResult: actual !== null };
}

function dirColor(usdUp: boolean | null): string {
  return usdUp === true ? C_UP : usdUp === false ? C_DOWN : C_FLAT;
}

export function MarketNewsModal({ open, onClose }: Props) {
  const { language } = useLanguage();
  const bi = (ku: string, en: string) => (language === 'en' || language === 'tr' ? en : ku);
  const [tab, setTab] = useState<'calendar' | 'news'>('calendar');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-news`, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(Array.isArray(data.events) ? data.events : []);
      setNews(Array.isArray(data.news) ? data.news : []);
      setLoaded(true);
    } catch (e) {
      setError(bi('نەتوانرا هەواڵەکان بهێنرێن. دووبارە هەوڵبدەرەوە.', 'Could not load the news. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [bi]);

  useEffect(() => {
    if (open && !loaded) load();
  }, [open, loaded, load]);

  const timeAgo = (iso: string): string => {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '';
    const diff = Date.now() - t;
    const m = Math.round(diff / 60000);
    if (m < 1) return bi('ئێستا', 'now');
    if (m < 60) return bi(`${m} خ`, `${m}m`);
    const h = Math.round(m / 60);
    if (h < 24) return bi(`${h} ک`, `${h}h`);
    const d = Math.round(h / 24);
    return bi(`${d} ڕ`, `${d}d`);
  };

  const eventTime = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(language === 'en' || language === 'tr' ? 'en-US' : 'en-GB', {
      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    });
  };

  // Group events by day label
  const grouped: { label: string; items: CalendarEvent[] }[] = [];
  for (const ev of events) {
    const d = new Date(ev.date);
    const label = Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString(language === 'en' || language === 'tr' ? 'en-US' : 'en-GB', { weekday: 'long', month: 'short', day: 'numeric' });
    const last = grouped[grouped.length - 1];
    if (last && last.label === label) last.items.push(ev);
    else grouped.push({ label, items: [ev] });
  }

  const impactColor = (imp: string) => {
    const i = imp.toLowerCase();
    return i === 'high' ? '#f6465d' : i === 'medium' ? '#f0b90b' : '#848e9c';
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 bg-[#0a0e17] border-[#1a1e2e] text-white flex flex-col"
      >
        <SheetHeader className="px-4 py-3 border-b border-[#1a1e2e] shrink-0">
          <SheetTitle className="flex items-center gap-2 text-white">
            <Newspaper className="h-5 w-5 text-[#f0b90b]" />
            {bi('هەواڵی بازاڕ', 'Market News')}
            <button
              onClick={load}
              disabled={loading}
              className="ms-auto p-1.5 rounded-lg hover:bg-[#1a1e2e] text-[#848e9c] hover:text-white transition-colors disabled:opacity-50"
              aria-label={bi('نوێکردنەوە', 'Refresh')}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </SheetTitle>
        </SheetHeader>

        {/* Tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-[#1a1e2e] shrink-0">
          <button
            onClick={() => setTab('calendar')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              tab === 'calendar' ? 'bg-[#f0b90b] text-black' : 'bg-[#1a1e2e] text-[#848e9c] hover:text-white'
            }`}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            {bi('ساڵنامەی ئابووری', 'Calendar')}
          </button>
          <button
            onClick={() => setTab('news')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              tab === 'news' ? 'bg-[#f0b90b] text-black' : 'bg-[#1a1e2e] text-[#848e9c] hover:text-white'
            }`}
          >
            <Newspaper className="h-3.5 w-3.5" />
            {bi('هەواڵ', 'News')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && !loaded ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#848e9c] gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">{bi('هێنانی هەواڵەکان...', 'Loading news...')}</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#f6465d] gap-2 px-6 text-center">
              <AlertCircle className="h-6 w-6" />
              <span className="text-sm">{error}</span>
              <button onClick={load} className="mt-2 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#1a1e2e] text-white">
                {bi('دووبارە هەوڵبدە', 'Retry')}
              </button>
            </div>
          ) : tab === 'calendar' ? (
            <div className="p-3 space-y-4">
              <p className="text-[10px] text-[#848e9c] px-1">
                {bi('ڕووداوە گرنگەکانی ئابووری (سەرچاوە: ForexFactory). کاریگەری زۆر = ', 'High-impact economic events (source: ForexFactory). High impact = ')}
                <span className="text-[#f6465d] font-bold">🔴</span>
              </p>
              <p className="text-[10px] px-1 leading-relaxed">
                <span style={{ color: C_UP }} className="font-bold">{bi('سەوز = دۆلار بەرز (زێڕ دادەبەزێت)', 'Green = USD up (gold down)')}</span>
                {' · '}
                <span style={{ color: C_DOWN }} className="font-bold">{bi('سور = دۆلار نزم (زێڕ بەرز)', 'Red = USD down (gold up)')}</span>
                {' · '}
                <span style={{ color: C_FLAT }} className="font-bold">{bi('پرتەقاڵی = نادیار', 'Orange = undecided')}</span>
              </p>
              {grouped.length === 0 ? (
                <div className="text-center text-sm text-[#848e9c] py-10">{bi('هیچ ڕووداوێک نییە.', 'No events.')}</div>
              ) : grouped.map((g) => (
                <div key={g.label}>
                  <div className="text-xs font-bold text-[#f0b90b] mb-2 px-1">{g.label}</div>
                  <div className="space-y-1.5">
                    {g.items.map((ev, i) => {
                      const a = analyzeEvent(ev);
                      const isUSD = ev.country === 'USD';
                      const col = dirColor(a.usdUp);
                      const pctStr = a.pct === null ? null : `${a.pct >= 0 ? '+' : ''}${a.pct.toFixed(1)}%`;
                      const goldNote = a.usdUp === true
                        ? bi('زێڕ ↓ دادەبەزێت', 'Gold ↓ down')
                        : a.usdUp === false
                          ? bi('زێڕ ↑ بەرز دەبێتەوە', 'Gold ↑ up')
                          : bi('زێڕ ⟷ چاوەڕوان', 'Gold ⟷ wait');
                      return (
                      <div key={`${ev.title}-${i}`} className="flex items-center gap-2 bg-[#0d1117] border border-[#1a1e2e] rounded-lg px-3 py-2">
                        <span className="text-lg shrink-0">{FLAGS[ev.country] ?? '🏳️'}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: impactColor(ev.impact) }} />
                            <span className="text-[11px] font-bold text-[#848e9c]">{ev.country}</span>
                            <span className="text-[10px] text-[#848e9c]">{eventTime(ev.date)}</span>
                          </div>
                          <div className="text-sm text-white truncate">{ev.title}</div>
                          {isUSD && a.hasResult && (
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {pctStr && (
                                <span className="text-[10px] font-bold" style={{ color: col }}>
                                  {bi('گۆڕان', 'Δ')}: {pctStr}
                                </span>
                              )}
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                style={{ color: col, backgroundColor: col + '1a' }}
                              >
                                {a.usdUp === true ? bi('دۆلار ↑', 'USD ↑') : a.usdUp === false ? bi('دۆلار ↓', 'USD ↓') : bi('دۆلار ⟷', 'USD ⟷')} · {goldNote}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0 text-[10px] leading-tight">
                          {ev.actual && <div className="font-bold" style={{ color: isUSD ? col : '#ffffff' }}>{bi('ئەنجام', 'Act')}: {ev.actual}</div>}
                          {ev.forecast && (
                            <div style={{ color: (() => {
                              const f = parseNum(ev.forecast);
                              const p = parseNum(ev.previous);
                              if (f === null || p === null || p === 0) return '#848e9c';
                              const up = f > p;
                              const inv = INVERSE_KEYWORDS.some((k) => ev.title.toLowerCase().includes(k));
                              const usdUp = inv ? !up : up;
                              return usdUp === true ? C_UP : usdUp === false ? C_DOWN : C_FLAT;
                            })() }}>
                              {bi('پێشبینی', 'Fcst')}: {ev.forecast}
                            </div>
                          )}
                          {ev.previous && <div className="text-[#848e9c]">{bi('پێشتر', 'Prev')}: {ev.previous}</div>}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 space-y-2">
              <p className="text-[10px] text-[#848e9c] px-1">
                {bi('هەواڵی بازاڕ لە سەرچاوە متمانەپێکراوەکان (Investing.com، CNBC، MarketWatch).', 'Market news from trusted sources (Investing.com, CNBC, MarketWatch).')}
              </p>
              {news.length === 0 ? (
                <div className="text-center text-sm text-[#848e9c] py-10">{bi('هیچ هەواڵێک نییە.', 'No news.')}</div>
              ) : news.map((n, i) => {
                const cat = CAT_LABEL[n.category];
                return (
                  <a
                    key={`${n.link}-${i}`}
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-[#0d1117] border border-[#1a1e2e] hover:border-[#2a2e3e] rounded-lg px-3 py-2.5 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {cat && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ color: cat.color, backgroundColor: cat.color + '1a' }}>
                          {bi(cat.ku, cat.en)}
                        </span>
                      )}
                      <span className="text-[10px] text-[#848e9c]">{n.source}</span>
                      <span className="text-[10px] text-[#848e9c] ms-auto flex items-center gap-1">
                        {timeAgo(n.pubDate)}
                        <ExternalLink className="h-3 w-3" />
                      </span>
                    </div>
                    <div className="text-sm font-medium text-white leading-snug">{n.title}</div>
                    {n.summary && <div className="text-[11px] text-[#848e9c] mt-1 line-clamp-2">{n.summary}</div>}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
