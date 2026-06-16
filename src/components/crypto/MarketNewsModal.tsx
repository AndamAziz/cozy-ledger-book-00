import { useEffect, useState, useCallback, useRef, useMemo, type ReactNode } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useLanguage } from '@/contexts/LanguageContext';
import { Newspaper, CalendarClock, Loader2, RefreshCw, ExternalLink, AlertCircle, TrendingUp, TrendingDown, Pin, Clock, Share2, Sun, Moon, X, Bell } from 'lucide-react';

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

// Currencies whose data moves gold the most
const GOLD_CURRENCIES = ['USD', 'CHF', 'GBP', 'JPY'];

// localStorage cache
const CACHE_KEY = 'marketNewsCache_v1';
const DISMISS_KEY = 'marketNewsDismissed_v1';
const THEME_KEY = 'marketNewsCalTheme_v1';
const SOUND_KEY = 'marketNewsSound_v1';

// Quick currency filter tabs (gold-relevant focus)
const CURRENCY_FILTERS: { code: string; flag: string }[] = [
  { code: 'All', flag: '🌐' },
  { code: 'USD', flag: '🇺🇸' },
  { code: 'GBP', flag: '🇬🇧' },
  { code: 'JPY', flag: '🇯🇵' },
  { code: 'CHF', flag: '🇨🇭' },
];

// A unique, stable key for an event (used for dismiss + share)
function eventKey(ev: CalendarEvent): string {
  return `${ev.country}|${ev.title}|${ev.date}`;
}

// Subtle "ding" using the Web Audio API (no asset needed)
function playDing() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
    osc.onended = () => ctx.close();
  } catch { /* ignore */ }
}

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

// Predicted/actual gold direction for an event (true = gold up, false = gold down, null = wait)
function goldDirection(ev: CalendarEvent, a: EventAnalysis): boolean | null {
  if (a.usdUp !== null) return !a.usdUp; // weaker USD => gold up
  const f = parseNum(ev.forecast);
  const p = parseNum(ev.previous);
  if (f !== null && p !== null && p !== 0 && f !== p) {
    const inv = INVERSE_KEYWORDS.some((k) => ev.title.toLowerCase().includes(k));
    const usdUp = inv ? f < p : f > p;
    return !usdUp;
  }
  return null;
}

// Gold impact score: 1-3 bars
function goldImpactScore(ev: CalendarEvent): number {
  const imp = (ev.impact || '').toLowerCase();
  const goldRel = GOLD_CURRENCIES.includes(ev.country);
  if (imp === 'high' && ev.country === 'USD') return 3;
  if (imp === 'high' && goldRel) return 2;
  if (imp === 'high') return 1;
  if (imp === 'medium' && goldRel) return 1;
  return 1;
}

function isGoldRelevant(country: string): boolean {
  return GOLD_CURRENCIES.includes(country);
}

const REMIND_KEY = 'marketNewsReminders_v1';

// Day-of-year comparison helper (timezone-safe "is this event today or later")
function dayStamp(d: Date): number {
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
}



function isToday(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// Swipe-left-to-dismiss wrapper for event cards
function SwipeCard({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void; light?: boolean }) {
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const swiping = useRef(false);

  const onStart = (x: number, y: number) => {
    if (!onDismiss) return;
    startX.current = x;
    startY.current = y;
    swiping.current = false;
  };
  const onMove = (x: number, y: number) => {
    if (!onDismiss || startX.current === null || startY.current === null) return;
    const diffX = x - startX.current;
    const diffY = y - startY.current;
    if (!swiping.current && Math.abs(diffX) > 8 && Math.abs(diffX) > Math.abs(diffY)) {
      swiping.current = true;
    }
    if (swiping.current && diffX < 0) setDx(diffX);
  };
  const onEnd = () => {
    if (!onDismiss) return;
    if (dx < -90) {
      setAnimating(true);
      setDx(-window.innerWidth);
      setTimeout(() => onDismiss(), 180);
    } else {
      setAnimating(true);
      setDx(0);
      setTimeout(() => setAnimating(false), 180);
    }
    startX.current = null;
    startY.current = null;
    swiping.current = false;
  };

  return (
    <div className="relative overflow-hidden rounded-lg group">
      {/* Red swipe-to-dismiss backdrop — only visible while actually swiping */}
      {onDismiss && dx < -6 && (
        <div className="absolute inset-0 flex items-center justify-end pr-4 rounded-lg" style={{ backgroundColor: 'rgba(246,70,93,0.18)' }}>
          <X className="h-4 w-4" style={{ color: '#f6465d' }} />
        </div>
      )}
      <div
        style={{ transform: `translateX(${dx}px)`, transition: animating ? 'transform 0.18s ease-out' : 'none', opacity: dx < -90 ? 0.4 : 1 }}
        onTouchStart={(e) => onStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => onMove(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={onEnd}
      >
        {children}
      </div>
      {/* Desktop X — only on hover */}
      {onDismiss && (
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="absolute top-1.5 right-1.5 z-10 p-1 rounded-full bg-black/40 text-[#f6465d] opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
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
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Filter tab (currency), dismissed events, calendar theme, sound toggle, share toast
  const [currency, setCurrency] = useState<string>('All');
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch { return new Set<string>(); }
  });
  const [light, setLight] = useState<boolean>(() => {
    try { return localStorage.getItem(THEME_KEY) === 'light'; } catch { return false; }
  });
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
  });
  const [toast, setToast] = useState<string | null>(null);
  const alertedRef = useRef<Set<string>>(new Set());

  // Event detail popup + reminders
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null);
  const [reminders, setReminders] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(REMIND_KEY);
      return new Set<string>(raw ? JSON.parse(raw) : []);
    } catch { return new Set<string>(); }
  });
  const reminderTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismissEvent = useCallback((key: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(key);
      try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const restoreDismissed = useCallback(() => {
    setDismissed(new Set());
    try { localStorage.removeItem(DISMISS_KEY); } catch { /* ignore */ }
  }, []);

  const toggleTheme = useCallback(() => {
    setLight((p) => {
      const v = !p;
      try { localStorage.setItem(THEME_KEY, v ? 'light' : 'dark'); } catch { /* ignore */ }
      return v;
    });
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((p) => {
      const v = !p;
      try { localStorage.setItem(SOUND_KEY, v ? 'on' : 'off'); } catch { /* ignore */ }
      return v;
    });
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  // 📌 Remind me — schedule a browser notification 15 min before the event
  const remindMe = useCallback(async (ev: CalendarEvent) => {
    const t = Date.parse(ev.date);
    if (Number.isNaN(t)) return;
    const fireAt = t - 15 * 60000;
    const k = eventKey(ev);

    // Toggle off if already set
    if (reminders.has(k)) {
      if (reminderTimers.current[k]) { clearTimeout(reminderTimers.current[k]); delete reminderTimers.current[k]; }
      setReminders((prev) => {
        const next = new Set(prev); next.delete(k);
        try { localStorage.setItem(REMIND_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
        return next;
      });
      showToast(bi('بیرخستنەوە لابرا', 'Reminder removed'));
      return;
    }

    if (fireAt <= Date.now()) {
      showToast(bi('ڕووداوەکە زۆر نزیکە', 'Event is too soon'));
      return;
    }

    if ('Notification' in window) {
      let perm = Notification.permission;
      if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch { /* ignore */ } }
      if (perm !== 'granted') {
        showToast(bi('ئاگادارکردنەوە چالاک بکە', 'Enable notifications first'));
        return;
      }
    }

    setReminders((prev) => {
      const next = new Set(prev); next.add(k);
      try { localStorage.setItem(REMIND_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });

    const delay = fireAt - Date.now();
    reminderTimers.current[k] = setTimeout(() => {
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`⚠️ ${ev.title}`, {
            body: `${ev.country} · ${bi('لە ١٥ خولەکدا', 'in 15 minutes')}${ev.forecast ? ` · Forecast: ${ev.forecast}` : ''}`,
          });
        }
      } catch { /* ignore */ }
      playDing();
      delete reminderTimers.current[k];
    }, delay);

    showToast(bi('بیرخستنەوە دانرا · ١٥ خولەک پێش', 'Reminder set · 15 min before'));
  }, [reminders, bi, showToast]);



  // Theme palette for the calendar section
  const T = light
    ? { bg: '#f5f6fa', card: '#ffffff', cardBorder: '#e2e5ec', text: '#0a0e17', sub: '#5b6472', headBg: '#ffffff' }
    : { bg: '#0a0e17', card: '#0d1117', cardBorder: '#1a1e2e', text: '#ffffff', sub: '#848e9c', headBg: '#0d1117' };

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const todayRef = useRef<HTMLDivElement | null>(null);
  const didScroll = useRef(false);

  // Live clock tick (1s) for countdowns
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  // Load cached data immediately on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const c = JSON.parse(raw) as { events: CalendarEvent[]; news: NewsItem[]; ts: number };
        if (Array.isArray(c.events)) {
          setEvents(c.events);
          setNews(Array.isArray(c.news) ? c.news : []);
          setLastUpdated(c.ts);
          setFromCache(true);
        }
      }
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const MAX = 3;
    for (let attempt = 1; attempt <= MAX; attempt++) {
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-news`, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            'x-retry-count': String(attempt),
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const evs: CalendarEvent[] = Array.isArray(data.events) ? data.events : [];
        const nws: NewsItem[] = Array.isArray(data.news) ? data.news : [];
        // Only accept as fresh success if we actually got events; otherwise keep cache
        if (evs.length > 0) {
          setEvents(evs);
          setNews(nws);
          const ts = Date.now();
          setLastUpdated(ts);
          setFromCache(false);
          setLoaded(true);
          setError(null);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ events: evs, news: nws, ts })); } catch { /* ignore */ }
          setLoading(false);
          return;
        }
        // Empty payload — keep retrying
        if (attempt === MAX) {
          setLoaded(true);
          setLoading(false);
          // fall back to whatever cache we already have; if none, show empty
          return;
        }
      } catch {
        if (attempt === MAX) {
          setLoaded(true);
          setLoading(false);
          // If we have cached events, keep showing them; otherwise show error
          const hasData = events.length > 0;
          if (!hasData) {
            setError(bi('نەتوانرا ڕووداوەکان بهێنرێن — کرتە بکە بۆ هەوڵدانەوە', 'Unable to load events - tap to retry'));
          }
          return;
        }
      }
      // backoff before next attempt
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }, [bi, events.length]);

  // Initial load + auto-refresh every 5 minutes while open
  useEffect(() => {
    if (!open) return;
    if (!loaded) load();
    const id = setInterval(() => load(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [open, loaded, load]);

  const timeAgo = (ms: number | null): string => {
    if (!ms) return '';
    const diff = Date.now() - ms;
    const m = Math.round(diff / 60000);
    if (m < 1) return bi('ئێستا', 'just now');
    if (m < 60) return bi(`${m} خولەک لەمەوبەر`, `${m}m ago`);
    const h = Math.round(m / 60);
    if (h < 24) return bi(`${h} کاتژمێر لەمەوبەر`, `${h}h ago`);
    const d = Math.round(h / 24);
    return bi(`${d} ڕۆژ لەمەوبەر`, `${d}d ago`);
  };

  const newsTimeAgo = (iso: string): string => {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return '';
    return timeAgo(t);
  };

  const eventTime = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(language === 'en' || language === 'tr' ? 'en-US' : 'en-GB', {
      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    });
  };

  // Format a countdown like "2h 35m" / "45m" / "30s"
  const fmtCountdown = (target: number): string => {
    let diff = Math.max(0, target - now);
    const d = Math.floor(diff / 86400000); diff -= d * 86400000;
    const h = Math.floor(diff / 3600000); diff -= h * 3600000;
    const m = Math.floor(diff / 60000); diff -= m * 60000;
    const s = Math.floor(diff / 1000);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
  };

  // Filter to TODAY .. +7 days and sort chronologically
  const visibleEvents = useMemo(() => {
    const todayStamp = dayStamp(new Date());
    const end = now + 7 * 86400000;
    return events
      .filter((e) => {
        const d = new Date(e.date);
        if (Number.isNaN(d.getTime())) return false;
        // Always keep events whose calendar day is today (even if the time already passed),
        // plus anything up to 7 days ahead.
        const isTodayOrLater = dayStamp(d) >= todayStamp;
        return isTodayOrLater && d.getTime() <= end;
      })
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  }, [events, now]);

  // Next upcoming high-impact event (any country)
  const nextHighImpact = useMemo(() => {
    return visibleEvents.find((e) => (e.impact || '').toLowerCase() === 'high' && Date.parse(e.date) > now) || null;
  }, [visibleEvents, now]);

  // Pinned: next high-impact USD (red dot) event
  const pinnedEvent = useMemo(() => {
    return visibleEvents.find((e) => (e.impact || '').toLowerCase() === 'high' && e.country === 'USD' && Date.parse(e.date) > now) || null;
  }, [visibleEvents, now]);

  const todayHighCount = useMemo(
    () => visibleEvents.filter((e) => isToday(e.date) && (e.impact || '').toLowerCase() === 'high').length,
    [visibleEvents],
  );

  // Apply currency filter + dismissed hiding for the rendered list
  const displayEvents = useMemo(() => {
    return visibleEvents.filter((e) => {
      if (dismissed.has(eventKey(e))) return false;
      if (currency !== 'All' && e.country !== currency) return false;
      return true;
    });
  }, [visibleEvents, dismissed, currency]);

  // Group events by day label
  const grouped: { label: string; isToday: boolean; items: CalendarEvent[] }[] = [];
  for (const ev of displayEvents) {
    const d = new Date(ev.date);
    const label = Number.isNaN(d.getTime())
      ? '—'
      : d.toLocaleDateString(language === 'en' || language === 'tr' ? 'en-US' : 'en-GB', { weekday: 'long', month: 'short', day: 'numeric' });
    const last = grouped[grouped.length - 1];
    if (last && last.label === label) last.items.push(ev);
    else grouped.push({ label, isToday: isToday(ev.date), items: [ev] });
  }

  // Share an event as formatted text
  const shareEvent = useCallback(async (ev: CalendarEvent) => {
    const a = analyzeEvent(ev);
    const score = goldImpactScore(ev);
    const bars = '🟡'.repeat(score) + '⚪'.repeat(3 - score);
    const lines = [
      `⚠️ ${ev.title}`,
      `📅 ${eventTime(ev.date)}`,
      ev.forecast ? `💰 Forecast: ${ev.forecast}` : null,
      ev.previous ? `↩️ Previous: ${ev.previous}` : null,
      ev.actual ? `✅ Actual: ${ev.actual}` : null,
      `📊 Gold Impact: ${bars}`,
    ].filter(Boolean);
    const text = lines.join('\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: ev.title, text });
      } else {
        await navigator.clipboard.writeText(text);
        showToast(bi('کۆپی کرا', 'Copied to clipboard'));
      }
    } catch { /* user cancelled */ }
  }, [bi, showToast, eventTime]);

  // Sound alert: ding ~5 min before any red-dot (high-impact USD) event
  useEffect(() => {
    if (!open || !soundOn) return;
    for (const e of visibleEvents) {
      const imp = (e.impact || '').toLowerCase();
      if (imp !== 'high' || e.country !== 'USD') continue;
      const t = Date.parse(e.date);
      if (Number.isNaN(t)) continue;
      const mins = (t - now) / 60000;
      const k = eventKey(e);
      if (mins > 0 && mins <= 5 && !alertedRef.current.has(k)) {
        alertedRef.current.add(k);
        playDing();
        showToast(bi(`⏰ ${e.title} لە ${Math.ceil(mins)} خولەکدا`, `⏰ ${e.title} in ${Math.ceil(mins)} min`));
      }
    }
  }, [now, open, soundOn, visibleEvents, bi, showToast]);


  // Smooth scroll to today's group when calendar opens with data
  useEffect(() => {
    if (open && tab === 'calendar' && grouped.length > 0 && !didScroll.current) {
      const t = setTimeout(() => {
        todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        didScroll.current = true;
      }, 250);
      return () => clearTimeout(t);
    }
    if (!open) didScroll.current = false;
  }, [open, tab, grouped.length]);

  const impactColor = (imp: string) => {
    const i = imp.toLowerCase();
    return i === 'high' ? '#f6465d' : i === 'medium' ? '#f0b90b' : '#848e9c';
  };

  const renderEventCard = (ev: CalendarEvent, key: string, pinned = false) => {
    const a = analyzeEvent(ev);
    const isUSD = ev.country === 'USD';
    const col = dirColor(a.usdUp);
    const pctStr = a.pct === null ? null : `${a.pct >= 0 ? '+' : ''}${a.pct.toFixed(1)}%`;
    const goldUp = goldDirection(ev, a);
    const score = goldImpactScore(ev);
    const goldRel = isGoldRelevant(ev.country);
    const t = Date.parse(ev.date);
    const upcoming = !Number.isNaN(t) && t > now;
    const isHigh = (ev.impact || '').toLowerCase() === 'high';

    // Card background tint: gold up => red, gold down => green
    const cardBg = goldUp === true ? 'rgba(246,70,93,0.10)' : goldUp === false ? 'rgba(14,203,129,0.10)' : T.card;
    const cardBorder = pinned
      ? '#f6465d'
      : goldRel
        ? 'rgba(212,175,55,0.55)'
        : T.cardBorder;

    const goldNote = a.usdUp === true
      ? bi('زێڕ ↓ دادەبەزێت', 'Gold ↓ down')
      : a.usdUp === false
        ? bi('زێڕ ↑ بەرز دەبێتەوە', 'Gold ↑ up')
        : bi('زێڕ ⟷ چاوەڕوان', 'Gold ⟷ wait');

    return (
      <SwipeCard key={key} onDismiss={pinned ? undefined : () => dismissEvent(eventKey(ev))} light={light}>
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 border cursor-pointer select-none"
          style={{ backgroundColor: cardBg, borderColor: cardBorder, borderWidth: goldRel || pinned ? 1.5 : 1 }}
          onClick={() => setDetailEvent(ev)}
          title={bi('کرتە بکە بۆ وردەکاری', 'Tap for details')}
        >
          <span className="text-lg shrink-0">{FLAGS[ev.country] ?? '🏳️'}</span>
          <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: impactColor(ev.impact) }} />
            <span className="text-[11px] font-bold text-[#848e9c]">{ev.country}</span>
            <span className="text-[10px] text-[#848e9c]">{eventTime(ev.date)}</span>
            {/* Gold impact score bars */}
            <span className="inline-flex items-center gap-0.5 shrink-0" title={bi('کاریگەری زێڕ', 'Gold impact')}>
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className="inline-block rounded-sm"
                  style={{ width: 3, height: 9, backgroundColor: n <= score ? '#f0b90b' : '#2a2e3e' }}
                />
              ))}
            </span>
            {upcoming && isHigh && (
              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-[#f6465d]">
                <Clock className="h-3 w-3" />{fmtCountdown(t)}
              </span>
            )}
            {upcoming && isHigh && (
              <button
                onClick={(e) => { e.stopPropagation(); remindMe(ev); }}
                className={`ms-auto inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full transition-colors ${
                  reminders.has(eventKey(ev)) ? 'bg-[#f0b90b] text-black' : 'bg-[#1a1e2e] text-[#f0b90b] hover:bg-[#2a2e3e]'
                }`}
                title={bi('بیرخستنەوە ١٥ خولەک پێش', 'Remind 15 min before')}
              >
                <Pin className="h-3 w-3" />
                {reminders.has(eventKey(ev)) ? bi('دانراوە', 'Set') : bi('بیرم بخەرەوە', 'Remind')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm truncate flex-1" style={{ color: T.text }}>{ev.title}</span>
            {goldUp === true && (
              <span className="inline-flex items-center gap-0.5 shrink-0 text-[9px] font-bold animate-flash-blink" style={{ color: C_UP }}>
                <TrendingUp className="h-4 w-4" /> {bi('زێڕ', 'Gold')}
              </span>
            )}
            {goldUp === false && (
              <span className="inline-flex items-center gap-0.5 shrink-0 text-[9px] font-bold animate-flash-blink" style={{ color: C_DOWN }}>
                <TrendingDown className="h-4 w-4" /> {bi('زێڕ', 'Gold')}
              </span>
            )}
          </div>
          {isUSD && a.hasResult && (
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {pctStr && (
                <span className="text-[10px] font-bold" style={{ color: col }}>
                  {bi('گۆڕان', 'Δ')}: {pctStr}
                </span>
              )}
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                style={{ color: col, backgroundColor: col + '1a' }}
              >
                {a.usdUp === true ? bi('دۆلار ↑', 'USD ↑') : a.usdUp === false ? bi('دۆلار ↓', 'USD ↓') : bi('دۆلار ⟷', 'USD ⟷')} · {goldNote}
                {a.usdUp === false && (
                  <TrendingUp className="h-3.5 w-3.5 animate-flash-blink" style={{ color: C_UP }} />
                )}
                {a.usdUp === true && (
                  <TrendingDown className="h-3.5 w-3.5 animate-flash-blink" style={{ color: C_DOWN }} />
                )}
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
      </SwipeCard>
    );
  };

  const todayLabel = new Date().toLocaleDateString(language === 'en' || language === 'tr' ? 'en-US' : 'en-GB', { weekday: 'long', month: 'short', day: 'numeric' });

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
            <div className="ms-auto flex items-center gap-1">
              <button
                onClick={toggleSound}
                className={`p-1.5 rounded-lg hover:bg-[#1a1e2e] transition-colors ${soundOn ? 'text-[#f0b90b]' : 'text-[#848e9c] hover:text-white'}`}
                aria-label={bi('ئاگادارکردنەوەی دەنگ', 'Sound alerts')}
                title={soundOn ? bi('دەنگ چالاکە', 'Sound on') : bi('دەنگ ناچالاکە', 'Sound off')}
              >
                <Bell className="h-4 w-4" />
              </button>
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded-lg hover:bg-[#1a1e2e] text-[#848e9c] hover:text-white transition-colors"
                aria-label={bi('گۆڕینی ڕووکار', 'Toggle theme')}
                title={light ? bi('دۆخی تاریک', 'Dark mode') : bi('دۆخی ڕووناک', 'Light mode')}
              >
                {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>
              <button
                onClick={load}
                disabled={loading}
                className="p-1.5 rounded-lg hover:bg-[#1a1e2e] text-[#848e9c] hover:text-white transition-colors disabled:opacity-50"
                aria-label={bi('نوێکردنەوە', 'Refresh')}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
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

        {/* Sticky summary header (calendar only) */}
        {tab === 'calendar' && (
          <div className="px-4 py-2 border-b border-[#1a1e2e] shrink-0" style={{ backgroundColor: T.headBg }}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold" style={{ color: T.text }}>{todayLabel}</div>
              <div className="flex items-center gap-2">
                {dismissed.size > 0 && (
                  <button onClick={restoreDismissed} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#1a1e2e] text-[#f0b90b]">
                    {bi(`گەڕاندنەوە (${dismissed.size})`, `Restore (${dismissed.size})`)}
                  </button>
                )}
                <div className="text-[10px] flex items-center gap-1" style={{ color: T.sub }}>
                  <RefreshCw className="h-3 w-3" />
                  {fromCache && lastUpdated ? bi('کاش: ', 'cached: ') : bi('نوێکراوە ', 'updated ')}{timeAgo(lastUpdated)}
                </div>
              </div>
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: T.sub }}>
              {todayHighCount > 0
                ? bi(`${todayHighCount} ڕووداوی کاریگەری بەرز ئەمڕۆ`, `${todayHighCount} high-impact event${todayHighCount > 1 ? 's' : ''} today`)
                : bi('هیچ ڕووداوی کاریگەری بەرز نییە ئەمڕۆ', 'No high-impact events today')}
              {nextHighImpact && (
                <span className="text-[#f0b90b] font-bold">
                  {' · '}{bi('دواتر:', 'next:')} {nextHighImpact.title.length > 16 ? nextHighImpact.title.slice(0, 16) + '…' : nextHighImpact.title} {bi('لە', 'in')} {fmtCountdown(Date.parse(nextHighImpact.date))}
                </span>
              )}
            </div>
            {/* Currency filter tabs */}
            <div className="flex gap-1 mt-2 overflow-x-auto no-scrollbar">
              {CURRENCY_FILTERS.map((c) => (
                <button
                  key={c.code}
                  onClick={() => setCurrency(c.code)}
                  className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-full whitespace-nowrap transition-colors ${
                    currency === c.code ? 'bg-[#f0b90b] text-black' : 'bg-[#1a1e2e] text-[#848e9c] hover:text-white'
                  }`}
                >
                  <span>{c.flag}</span>
                  {c.code === 'All' ? bi('هەموو', 'All') : c.code}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto" ref={scrollRef} style={tab === 'calendar' ? { backgroundColor: T.bg } : undefined}>
          {loading && events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#848e9c] gap-2">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">{bi('هێنانی ڕووداوەکان...', 'Loading events...')}</span>
            </div>
          ) : error && events.length === 0 ? (
            <button onClick={load} className="flex flex-col items-center justify-center py-16 text-[#f6465d] gap-2 px-6 text-center w-full">
              <AlertCircle className="h-6 w-6" />
              <span className="text-sm">{error}</span>
              <span className="mt-2 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#1a1e2e] text-white">
                {bi('دووبارە هەوڵبدە', 'Retry')}
              </span>
            </button>
          ) : tab === 'calendar' ? (
            <div className="p-3 space-y-4">
              <p className="text-[10px] px-1 leading-relaxed">
                <span style={{ color: C_DOWN }} className="font-bold">{bi('سور = زێڕ بەرز (دۆلار نزم)', 'Red card = Gold up (USD down)')}</span>
                {' · '}
                <span style={{ color: C_UP }} className="font-bold">{bi('سەوز = زێڕ نزم (دۆلار بەرز)', 'Green card = Gold down (USD up)')}</span>
              </p>
              <p className="text-[10px] text-[#848e9c] px-1 leading-relaxed">
                <span className="text-[#d4af37] font-bold">{bi('سنووری زێڕین = دراوی پەیوەست بە زێڕ (USD/CHF/GBP/JPY)', 'Gold border = gold-relevant currency (USD/CHF/GBP/JPY)')}</span>
                {' · '}
                <span className="text-[#f0b90b]">🟡 {bi('= ئاستی کاریگەری زێڕ', '= gold impact score')}</span>
              </p>

              {/* Pinned high-impact USD event */}
              {pinnedEvent && (
                <div>
                  <div className="text-[10px] font-bold text-[#f6465d] mb-1.5 px-1 flex items-center gap-1">
                    <Pin className="h-3 w-3" />
                    {bi('گرنگترین ڕووداو', 'Most important event')} · {bi('لە', 'in')} {fmtCountdown(Date.parse(pinnedEvent.date))}
                  </div>
                  {renderEventCard(pinnedEvent, 'pinned', true)}
                </div>
              )}

              {grouped.length === 0 ? (
                <div className="text-center text-sm text-[#848e9c] py-10">
                  {loading ? bi('هێنان...', 'Loading...') : bi('هیچ ڕووداوێک نییە بۆ ٧ ڕۆژی داهاتوو.', 'No events for the next 7 days.')}
                </div>
              ) : grouped.map((g) => (
                <div key={g.label} ref={g.isToday ? todayRef : undefined}>
                  <div
                    className={`text-xs font-bold mb-2 px-2 py-1 rounded-lg flex items-center gap-2 ${g.isToday ? 'text-black' : 'text-[#f0b90b]'}`}
                    style={g.isToday ? { background: 'linear-gradient(90deg,#f0b90b,#d4af37)', boxShadow: '0 0 12px rgba(240,185,11,0.5)' } : undefined}
                  >
                    {g.isToday && <span className="text-[10px] uppercase tracking-wide">{bi('ئەمڕۆ', 'Today')}</span>}
                    {g.label}
                  </div>
                  <div className="space-y-1.5">
                    {g.items.map((ev, i) => renderEventCard(ev, `${ev.title}-${ev.date}-${i}`))}
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
                        {newsTimeAgo(n.pubDate)}
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

        {/* Event detail popup */}
        {detailEvent && (() => {
          const ev = detailEvent;
          const a = analyzeEvent(ev);
          const goldUp = goldDirection(ev, a);
          const score = goldImpactScore(ev);
          const isHigh = (ev.impact || '').toLowerCase() === 'high';
          const t = Date.parse(ev.date);
          const upcoming = !Number.isNaN(t) && t > now;
          const bars = '🟡'.repeat(score) + '⚪'.repeat(3 - score);

          // What this means for gold
          const goldMeaning = goldUp === true
            ? bi('ئەگەری بەرزبوونەوەی نرخی زێڕ هەیە (دۆلار لاواز).', 'Likely bullish for gold — points to a weaker USD, which usually pushes gold higher.')
            : goldUp === false
              ? bi('ئەگەری دابەزینی نرخی زێڕ هەیە (دۆلار بەهێز).', 'Likely bearish for gold — points to a stronger USD, which usually pressures gold lower.')
              : bi('ئاراستەی زێڕ ڕوون نییە تا ئەنجامەکە بڵاودەبێتەوە.', 'Direction unclear until the actual figure is released — wait for the result.');

          // Historical impact note based on impact + currency
          const histImpact = isHigh
            ? (ev.country === 'USD'
                ? bi('ئەم جۆرە ڕووداوە بە شێوەیەکی مێژوویی جووڵەی خێرا و گەورە لە زێڕ دروست دەکات (٥٠ تا ٢٠٠+ خاڵ).', 'Historically triggers fast, large gold moves (often 50–200+ points) within minutes of release.')
                : bi('کاریگەری بەرز، بەڵام کەمتر لە ڕووداوەکانی دۆلار. جووڵەی مامناوەند.', 'High impact, but typically smaller for gold than USD events — expect a moderate move.'))
            : bi('کاریگەری کەم بۆ مامناوەند. زۆرجار جووڵەیەکی بچووک دروست دەکات.', 'Low-to-moderate impact — usually produces only a small, short-lived move.');

          // Suggested action
          const action = goldUp === true
            ? { label: bi('کڕین (Buy Gold)', 'Buy Gold'), color: C_UP, note: bi('ئامادەبە بۆ هەلی کڕین لەسەر ئەنجامی لاوازی دۆلار.', 'Watch for buy setups if the result confirms USD weakness.') }
            : goldUp === false
              ? { label: bi('فرۆشتن (Sell Gold)', 'Sell Gold'), color: C_DOWN, note: bi('ئامادەبە بۆ هەلی فرۆشتن لەسەر ئەنجامی بەهێزی دۆلار.', 'Watch for sell setups if the result confirms USD strength.') }
              : { label: bi('چاوەڕوانبە (Wait)', 'Wait'), color: C_FLAT, note: bi('مەکڕە و مەفرۆشە پێش بڵاوبوونەوەی ئەنجامەکە.', 'Stay flat until the actual number prints, then react.') };

          return (
            <div className="absolute inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 animate-fade-in" onClick={() => setDetailEvent(null)}>
              <div
                className="w-full sm:max-w-sm m-0 sm:m-4 rounded-t-2xl sm:rounded-2xl border max-h-[85%] overflow-y-auto"
                style={{ backgroundColor: T.card, borderColor: T.cardBorder }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-start gap-2 p-4 border-b" style={{ borderColor: T.cardBorder }}>
                  <span className="text-2xl shrink-0">{FLAGS[ev.country] ?? '🏳️'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: impactColor(ev.impact) }} />
                      <span className="text-[11px] font-bold text-[#848e9c]">{ev.country}</span>
                      <span className="text-[11px] text-[#848e9c]">{bi('کاریگەری زێڕ', 'Gold impact')}: {bars}</span>
                    </div>
                    <div className="text-sm font-bold leading-snug" style={{ color: T.text }}>{ev.title}</div>
                    <div className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: T.sub }}>
                      <Clock className="h-3 w-3" />{eventTime(ev.date)}
                      {upcoming && <span className="text-[#f6465d] font-bold">· {bi('لە', 'in')} {fmtCountdown(t)}</span>}
                    </div>
                  </div>
                  <button onClick={() => setDetailEvent(null)} className="p-1 rounded-full text-[#848e9c] hover:text-white shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Figures */}
                <div className="grid grid-cols-3 gap-2 p-4 text-center">
                  {[
                    { l: bi('پێشتر', 'Previous'), v: ev.previous },
                    { l: bi('پێشبینی', 'Forecast'), v: ev.forecast },
                    { l: bi('ئەنجام', 'Actual'), v: ev.actual || '—' },
                  ].map((f) => (
                    <div key={f.l} className="rounded-lg py-2 px-1" style={{ backgroundColor: T.bg }}>
                      <div className="text-[9px] uppercase tracking-wide" style={{ color: T.sub }}>{f.l}</div>
                      <div className="text-sm font-bold" style={{ color: T.text }}>{f.v || '—'}</div>
                    </div>
                  ))}
                </div>

                {/* Sections */}
                <div className="px-4 pb-4 space-y-3">
                  <div>
                    <div className="text-[11px] font-bold mb-1" style={{ color: T.text }}>🥇 {bi('مانای بۆ زێڕ', 'What this means for gold')}</div>
                    <p className="text-[12px] leading-relaxed" style={{ color: T.sub }}>{goldMeaning}</p>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold mb-1" style={{ color: T.text }}>📈 {bi('کاریگەری مێژوویی', 'Historical impact')}</div>
                    <p className="text-[12px] leading-relaxed" style={{ color: T.sub }}>{histImpact}</p>
                  </div>
                  <div className="rounded-lg p-3 border" style={{ backgroundColor: action.color + '14', borderColor: action.color + '55' }}>
                    <div className="text-[11px] font-bold mb-1" style={{ color: T.text }}>🎯 {bi('پێشنیاری کردار', 'Suggested action')}</div>
                    <div className="text-sm font-extrabold mb-0.5" style={{ color: action.color }}>{action.label}</div>
                    <p className="text-[12px] leading-relaxed" style={{ color: T.sub }}>{action.note}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 p-4 border-t" style={{ borderColor: T.cardBorder }}>
                  {upcoming && isHigh && (
                    <button
                      onClick={() => remindMe(ev)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-colors ${
                        reminders.has(eventKey(ev)) ? 'bg-[#f0b90b] text-black' : 'bg-[#1a1e2e] text-[#f0b90b] hover:bg-[#2a2e3e]'
                      }`}
                    >
                      <Pin className="h-4 w-4" />
                      {reminders.has(eventKey(ev)) ? bi('بیرخستنەوە دانراوە', 'Reminder set') : bi('📌 بیرم بخەرەوە', '📌 Remind me')}
                    </button>
                  )}
                  <button
                    onClick={() => shareEvent(ev)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold bg-[#1a1e2e] text-white hover:bg-[#2a2e3e] transition-colors"
                  >
                    <Share2 className="h-4 w-4" />
                    {bi('هاوبەشکردن', 'Share')}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}



        {/* Toast (share / sound alert feedback) */}
        {toast && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[#f0b90b] text-black text-xs font-bold shadow-lg flex items-center gap-1.5 animate-fade-in">
            <Share2 className="h-3.5 w-3.5" />
            {toast}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
