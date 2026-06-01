import { useMemo, useState, useRef, useEffect } from 'react';
import { OHLCCandle, TIMEFRAMES } from '@/lib/krakenApi';
import { computeIndicators, summarizeSignals, SignalType } from '@/lib/indicators';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Sparkles, TrendingUp, TrendingDown, Minus, Loader2, AlertCircle, Target, ShieldAlert, LogIn, OctagonX, CalendarClock, Gauge, Lightbulb, BarChart3, Image as ImageIcon, Upload, Send, X, ChevronRight, ChevronLeft, Copy, Check } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface CryptoAnalysisProps {
  symbol: string;
  candles: OHLCCandle[];
  currentPrice: number;
  change24h: number;
  interval?: number;
  timeframeLabel?: string;
}

type Recommendation = 'buy' | 'sell' | 'hold';
type RiskLevel = 'low' | 'medium' | 'high';
type Influence = 'high' | 'medium' | 'low';

interface KeyDriver {
  indicator: string;
  effect: SignalType;
  influence: Influence;
  note: string;
  noteEn?: string;
}

interface TradeSummary {
  recommendation: Recommendation;
  confidence: number;
  headline: string;
  headlineEn?: string;
  entry: string;
  entryTiming?: string;
  entryTimingEn?: string;
  exitTiming?: string;
  exitTimingEn?: string;
  targets: string[];
  stopLoss: string;
  stopLossIndicator?: string;
  stopLossIndicatorValue?: string;
  stopLossBasis?: string;
  stopLossBasisEn?: string;
  horizonDays: number;
  riskLevel: RiskLevel;
  riskNote: string;
  riskNoteEn?: string;
  reasoning: string;
  reasoningEn?: string;
  keyDrivers: KeyDriver[];
}

interface SentSignal {
  id: string;
  symbol: string | null;
  recommendation: 'buy' | 'sell' | 'hold' | null;
  confidence: number | null;
  price: number | null;
  entry: string | null;
  targets: string[] | null;
  stop_loss: string | null;
  horizon_days: number | null;
  risk_level: 'low' | 'medium' | 'high' | null;
  headline: string | null;
  timeframe: string | null;
  telegram_message_id: number | null;
  status: string;
  error: string | null;
  created_at: string;
}

type LangMode = 'ku' | 'en' | 'both';

// Module-level bilingual helper: pick text for the active display language.
const bi = (ku: string, en: string, lang: LangMode) =>
  lang === 'en' ? en : lang === 'ku' ? ku : `${ku} · ${en}`;

const signalColor = (s: SignalType) =>
  s === 'buy' ? '#0ecb81' : s === 'sell' ? '#f6465d' : '#848e9c';

const signalLabel = (s: SignalType, lang: LangMode) =>
  s === 'buy' ? bi('کڕین', 'Buy', lang) : s === 'sell' ? bi('فرۆشتن', 'Sell', lang) : bi('بێلایەن', 'Neutral', lang);

const recColor = (r: Recommendation) =>
  r === 'buy' ? '#0ecb81' : r === 'sell' ? '#f6465d' : '#f0b90b';

const recLabel = (r: Recommendation, lang: LangMode) =>
  r === 'buy' ? bi('کڕین', 'Buy', lang) : r === 'sell' ? bi('فرۆشتن', 'Sell', lang) : bi('هەڵگرتن', 'Hold', lang);

const riskColor = (r: RiskLevel) =>
  r === 'low' ? '#0ecb81' : r === 'high' ? '#f6465d' : '#f0b90b';

const riskLabel = (r: RiskLevel, lang: LangMode) =>
  r === 'low' ? bi('نزم', 'Low', lang) : r === 'high' ? bi('بەرز', 'High', lang) : bi('مامناوەند', 'Medium', lang);

const influenceLabel = (i: Influence, lang: LangMode) =>
  i === 'high' ? bi('کاریگەری بەرز', 'High impact', lang) : i === 'low' ? bi('کاریگەری نزم', 'Low impact', lang) : bi('کاریگەری مامناوەند', 'Medium impact', lang);

const influenceWidth = (i: Influence) =>
  i === 'high' ? '100%' : i === 'medium' ? '60%' : '30%';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d: Date): string {
  return `${d.getDate()}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

function fmt(n: number | null, digits = 2): string {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function CryptoAnalysis({ symbol, candles, currentPrice, change24h, interval, timeframeLabel }: CryptoAnalysisProps) {
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [tradeSummary, setTradeSummary] = useState<TradeSummary | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  // Display/analysis language follows the global app language (English vs RTL languages).
  const { language } = useLanguage();
  const [langMode, setLangMode] = useState<LangMode>(language === 'en' ? 'en' : 'ku');
  useEffect(() => {
    setLangMode(language === 'en' ? 'en' : 'ku');
  }, [language]);

  // Chart image analysis state
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageText, setImageText] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [chartTimeframe, setChartTimeframe] = useState('1H');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Admin-only Telegram signal sending
  const [isAdmin, setIsAdmin] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);
  const [sentSignals, setSentSignals] = useState<SentSignal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [showSignals, setShowSignals] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<SentSignal | null>(null);

  const fetchSentSignals = async () => {
    setSignalsLoading(true);
    const { data } = await supabase
      .from('telegram_signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setSentSignals((data ?? []) as SentSignal[]);
    setSignalsLoading(false);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (active) setIsAdmin(false); return; }
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      if (active && data?.role === 'admin') {
        setIsAdmin(true);
        fetchSentSignals();
      }
    })();
    return () => { active = false; };
  }, []);

  const sendSignal = async () => {
    if (!tradeSummary) return;
    setSending(true);
    setSentOk(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-telegram-signal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          symbol,
          recommendation: tradeSummary.recommendation,
          confidence: tradeSummary.confidence,
          price: currentPrice,
          entry: tradeSummary.entry,
          targets: tradeSummary.targets,
          stopLoss: tradeSummary.stopLoss,
          horizonDays: tradeSummary.horizonDays,
          riskLevel: tradeSummary.riskLevel,
          headline: tradeSummary.headlineEn || tradeSummary.headline,
          timeframe: timeframeLabel,
        }),
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(j?.error || 'Failed to send');
      setSentOk(true);
      toast({ title: biLabel('نێردرا بۆ تەلەگرام ✅', 'Sent to Telegram ✅') });
      setShowSignals(true);
      fetchSentSignals();
      setTimeout(() => setSentOk(false), 3000);
    } catch (e) {
      toast({
        title: biLabel('ناردن سەرکەوتوو نەبوو', 'Failed to send'),
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const CHART_TIMEFRAMES = ['1H', '4H', '1D'];

  const indicators = useMemo(() => computeIndicators(candles), [candles]);
  const summary = useMemo(() => summarizeSignals(indicators, currentPrice), [indicators, currentPrice]);

  // Highest / lowest price over the last 24h (1 day)
  const { dayHigh, dayLow } = useMemo(() => {
    if (!candles.length) return { dayHigh: null as number | null, dayLow: null as number | null };
    const latest = candles[candles.length - 1].time;
    const cutoff = latest - 86400; // 24h in seconds
    const recent = candles.filter(c => c.time >= cutoff);
    const use = recent.length ? recent : candles.slice(-24);
    return {
      dayHigh: Math.max(...use.map(c => c.high)),
      dayLow: Math.min(...use.map(c => c.low)),
    };
  }, [candles]);

  const tfLabel = timeframeLabel ?? TIMEFRAMES.find(t => t.interval === interval)?.label ?? `${interval}m`;

  // Language display helpers
  const showKu = langMode === 'ku' || langMode === 'both';
  const showEn = langMode === 'en' || langMode === 'both';
  const biLabel = (ku: string, en: string) => (langMode === 'en' ? en : langMode === 'ku' ? ku : `${ku} · ${en}`);

  // Bilingual text block: Kurdish (rtl) and/or English (ltr) depending on langMode
  const BiText = ({ ku, en, className = '' }: { ku?: string; en?: string; className?: string }) => (
    <>
      {showKu && ku && <p className={`leading-relaxed ${className}`} dir="rtl">{ku}</p>}
      {showEn && en && (
        <p className={`leading-relaxed ${className} ${showKu && ku ? 'mt-1 text-[#9aa4b2]' : ''}`} dir="ltr">{en}</p>
      )}
    </>
  );

  // Reusable language toggle (ku / both / en)
  const LangToggle = () => (
    <div
      role="group"
      aria-label="Select display language"
      className="inline-flex items-center gap-0.5 bg-[#1a1e2e] rounded-lg p-0.5"
    >
      {(['ku', 'both', 'en'] as LangMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setLangMode(m)}
          aria-pressed={langMode === m}
          aria-label={m === 'ku' ? 'Kurdish only' : m === 'en' ? 'English only' : 'Both languages'}
          className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all duration-200 min-h-[28px] outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0d1117] ${
            langMode === m
              ? 'bg-[#0d1117] text-white shadow-sm ring-1 ring-[#2d2d2d]'
              : 'text-[#848e9c] hover:text-white'
          }`}
        >
          {m === 'ku' ? 'کوردی' : m === 'en' ? 'English' : biLabel('هەردووکی', 'Both')}
        </button>
      ))}
    </div>
  );

  const rows: { label: string; value: string; signal: SignalType; hint?: string }[] = [];
  if (indicators.rsi != null) {
    rows.push({
      label: 'RSI (14)',
      value: fmt(indicators.rsi),
      signal: indicators.rsi < 30 ? 'buy' : indicators.rsi > 70 ? 'sell' : 'neutral',
      hint: indicators.rsi < 30 ? bi('زۆر فرۆشراو', 'Oversold', langMode) : indicators.rsi > 70 ? bi('زۆر کڕراو', 'Overbought', langMode) : bi('ناوەند', 'Neutral', langMode),
    });
  }
  if (indicators.macd) {
    rows.push({
      label: 'MACD',
      value: fmt(indicators.macd.histogram, 4),
      signal: indicators.macd.histogram > 0 ? 'buy' : indicators.macd.histogram < 0 ? 'sell' : 'neutral',
      hint: indicators.macd.histogram > 0 ? bi('هێزی کڕین', 'Bullish momentum', langMode) : bi('هێزی فرۆشتن', 'Bearish momentum', langMode),
    });
  }
  if (indicators.bollinger) {
    rows.push({
      label: 'Bollinger %B',
      value: fmt(indicators.bollinger.percentB * 100) + '%',
      signal: indicators.bollinger.percentB < 0.1 ? 'buy' : indicators.bollinger.percentB > 0.9 ? 'sell' : 'neutral',
    });
  }
  if (indicators.sma20 != null) {
    rows.push({
      label: 'SMA 20',
      value: '$' + fmt(indicators.sma20),
      signal: currentPrice > indicators.sma20 ? 'buy' : currentPrice < indicators.sma20 ? 'sell' : 'neutral',
    });
  }
  if (indicators.sma50 != null) {
    rows.push({
      label: 'SMA 50',
      value: '$' + fmt(indicators.sma50),
      signal: currentPrice > indicators.sma50 ? 'buy' : currentPrice < indicators.sma50 ? 'sell' : 'neutral',
    });
  }
  if (indicators.ema12 != null && indicators.ema26 != null) {
    rows.push({
      label: 'EMA 12/26',
      value: indicators.ema12 > indicators.ema26 ? 'Bullish' : 'Bearish',
      signal: indicators.ema12 > indicators.ema26 ? 'buy' : 'sell',
    });
  }

  const buildBody = () => ({
    symbol,
    price: currentPrice,
    change24h: change24h.toFixed(2),
    timeframe: tfLabel,
    dayHigh: dayHigh != null ? Number(dayHigh.toFixed(2)) : null,
    dayLow: dayLow != null ? Number(dayLow.toFixed(2)) : null,
    lang: langMode,
    summary,
    indicators: {
      rsi: indicators.rsi,
      macd: indicators.macd,
      bollinger: indicators.bollinger,
      sma20: indicators.sma20,
      sma50: indicators.sma50,
      ema12: indicators.ema12,
      ema26: indicators.ema26,
    },
  });

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crypto-analysis`;
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  };

  const fetchSummary = async () => {
    const resp = await fetch(fnUrl, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ ...buildBody(), mode: 'summary' }),
    });
    if (!resp.ok) {
      let msg = biLabel('هەڵەیەک ڕوویدا لە دروستکردنی پوختە.', 'Failed to generate the summary.');
      try {
        const j = await resp.json();
        if (j?.error) msg = j.error;
      } catch { /* ignore */ }
      throw new Error(msg);
    }
    const j = await resp.json();
    setTradeSummary(j.summary as TradeSummary);
    setGeneratedAt(j.generatedAt as string);
  };

  const streamNarrative = async () => {
    const resp = await fetch(fnUrl, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(buildBody()),
    });

    if (!resp.ok || !resp.body) {
      let msg = biLabel('هەڵەیەک ڕوویدا لە شیکاری AI.', 'AI analysis failed.');
      try {
        const j = await resp.json();
        if (j?.error) msg = j.error;
      } catch { /* ignore */ }
      throw new Error(msg);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let acc = '';
    let done = false;
    while (!done) {
      const { done: d, value } = await reader.read();
      if (d) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.startsWith(':') || line.trim() === '') continue;
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') { done = true; break; }
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) { acc += content; setAiText(acc); }
        } catch {
          buffer = line + '\n' + buffer;
          break;
        }
      }
    }
  };

  const runAiAnalysis = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiText('');
    setTradeSummary(null);
    setGeneratedAt(null);
    try {
      // First the fast structured summary, then the detailed narrative
      await fetchSummary();
      await streamNarrative();
    } catch (e) {
      setAiError(e instanceof Error ? e.message : biLabel('هەڵەیەک ڕوویدا.', 'Something went wrong.'));
    } finally {
      setAiLoading(false);
    }
  };

  // ---- Chart image analysis ----
  const consumeStream = async (resp: Response, onChunk: (s: string) => void) => {
    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let acc = '';
    let done = false;
    while (!done) {
      const { done: d, value } = await reader.read();
      if (d) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.startsWith(':') || line.trim() === '') continue;
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') { done = true; break; }
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) { acc += content; onChunk(acc); }
        } catch {
          buffer = line + '\n' + buffer;
          break;
        }
      }
    }
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const images = files.filter(f => f.type.startsWith('image/'));
    if (images.length === 0) {
      setImageError(biLabel('تکایە تەنها وێنە هەڵبژێرە.', 'Please select images only.'));
      return;
    }
    if (images.some(f => f.size > 8 * 1024 * 1024)) {
      setImageError(biLabel('قەبارەی هەندێک وێنە زۆر گەورەیە (زۆرترین 8MB).', 'Some images are too large (max 8MB).'));
      return;
    }
    if (images.length > 6) {
      setImageError(biLabel('زۆرترین 6 وێنە لە یەک کاتدا.', 'Maximum 6 images at a time.'));
      return;
    }

    Promise.all(
      images.map(
        file =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error('read'));
            reader.readAsDataURL(file);
          }),
      ),
    )
      .then(dataUrls => {
        setImagePreviews(dataUrls);
        setImageError(null);
        setImageText('');
        analyzeImages(dataUrls);
      })
      .catch(() => setImageError(biLabel('نەتوانرا وێنەکان بخوێنرێنەوە.', 'Could not read the images.')));
  };

  const analyzeImages = async (dataUrls: string[]) => {
    setImageLoading(true);
    setImageError(null);
    setImageText('');
    try {
      const resp = await fetch(fnUrl, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ mode: 'image', symbol, images: dataUrls, chartTimeframe, lang: langMode }),
      });
      if (!resp.ok || !resp.body) {
        let msg = biLabel('هەڵەیەک ڕوویدا لە شیکاری وێنە.', 'Image analysis failed.');
        try {
          const j = await resp.json();
          if (j?.error) msg = j.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      await consumeStream(resp, setImageText);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : biLabel('هەڵەیەک ڕوویدا.', 'Something went wrong.'));
    } finally {
      setImageLoading(false);
    }
  };

  const clearImage = () => {
    setImagePreviews([]);
    setImageText('');
    setImageError(null);
  };

  const hasData = candles.length > 0;
  const gaugePct = (summary.score + 100) / 2; // 0..100

  const targetDate = generatedAt && tradeSummary
    ? fmtDate(new Date(new Date(generatedAt).getTime() + tradeSummary.horizonDays * 86400000))
    : null;

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
      {/* Overall signal */}
      <div className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm text-[#848e9c]">{biLabel('پوختەی نیشاندەرە تەکنیکییەکان', 'Technical indicators summary')}</div>
            <div className="text-lg font-bold text-white">{symbol}/USD · {tfLabel}</div>
          </div>
          <div className="flex items-center gap-2" style={{ color: signalColor(summary.signal) }}>
            {summary.signal === 'buy' ? <TrendingUp className="h-6 w-6" /> : summary.signal === 'sell' ? <TrendingDown className="h-6 w-6" /> : <Minus className="h-6 w-6" />}
            <span className="text-xl font-extrabold">{signalLabel(summary.signal, langMode)}</span>
          </div>
        </div>

        {/* Gauge bar */}
        <div className="relative h-2.5 rounded-full overflow-hidden bg-gradient-to-r from-[#f6465d] via-[#848e9c] to-[#0ecb81]">
          <div
            className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-white rounded-full shadow"
            style={{ left: `calc(${gaugePct}% - 2px)` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-[#848e9c] mt-1">
          <span>{biLabel('فرۆشتن', 'Sell')}</span><span>{biLabel('بێلایەن', 'Neutral')}</span><span>{biLabel('کڕین', 'Buy')}</span>
        </div>

        <div className="flex gap-2 mt-3 text-xs">
          <span className="px-2 py-1 rounded bg-[#0ecb81]/10 text-[#0ecb81]">{biLabel('کڕین', 'Buy')} {summary.buyCount}</span>
          <span className="px-2 py-1 rounded bg-[#848e9c]/10 text-[#848e9c]">{biLabel('بێلایەن', 'Neutral')} {summary.neutralCount}</span>
          <span className="px-2 py-1 rounded bg-[#f6465d]/10 text-[#f6465d]">{biLabel('فرۆشتن', 'Sell')} {summary.sellCount}</span>
        </div>
      </div>

      {/* 24h High / Low (highest & lowest price in 1 day) */}
      {hasData && dayHigh != null && dayLow != null && (
        <div className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-sm font-bold text-white mb-3">
            <BarChart3 className="h-4 w-4 text-[#f0b90b]" />
            {biLabel('بەرزترین و نزمترین (٢٤ کاتژمێر)', '24h High & Low')}
          </div>
          <div className="grid grid-cols-2 gap-px bg-[#1a1e2e] rounded-lg overflow-hidden">
            <div className="bg-[#0d1117] px-4 py-3">
              <div className="flex items-center gap-1.5 text-[10px] text-[#848e9c]">
                <TrendingUp className="h-3 w-3 text-[#0ecb81]" />
                {biLabel('بەرزترین نرخ', 'Highest')}
              </div>
              <div className="text-base font-mono font-bold text-[#0ecb81] mt-0.5">${fmt(dayHigh)}</div>
            </div>
            <div className="bg-[#0d1117] px-4 py-3">
              <div className="flex items-center gap-1.5 text-[10px] text-[#848e9c]">
                <TrendingDown className="h-3 w-3 text-[#f6465d]" />
                {biLabel('نزمترین نرخ', 'Lowest')}
              </div>
              <div className="text-base font-mono font-bold text-[#f6465d] mt-0.5">${fmt(dayLow)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Indicators table */}
      <div className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a1e2e] text-sm font-bold text-white">{biLabel('نیشاندەرە تەکنیکییەکان', 'Technical indicators')}</div>
        {!hasData ? (
          <div className="p-6 text-center text-[#848e9c] text-sm">{biLabel('دانەی نرخ بەردەست نییە...', 'No price data available...')}</div>
        ) : (
          <div className="divide-y divide-[#1a1e2e]">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <div className="text-sm text-white">{r.label}</div>
                  {r.hint && <div className="text-[10px] text-[#848e9c]">{r.hint}</div>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-[#d1d5db]">{r.value}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color: signalColor(r.signal), backgroundColor: signalColor(r.signal) + '1a' }}>
                    {signalLabel(r.signal, langMode)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI Analysis */}
      <div className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Sparkles className="h-4 w-4 text-[#f0b90b]" />
            {biLabel('شیکاری زیرەک (AI)', 'AI analysis')}
          </div>
          <button
            onClick={runAiAnalysis}
            disabled={aiLoading || !hasData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#f0b90b] text-black disabled:opacity-50 active:scale-95 transition"
          >
            {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {aiLoading ? biLabel('شیکاری...', 'Analyzing...') : (aiText || tradeSummary) ? biLabel('دووبارە شیکاری', 'Re-analyze') : biLabel('شیکاری بکە', 'Analyze')}
          </button>
        </div>

        {/* Language selector for the whole analysis (set before running) */}
        <div className="flex items-center justify-between gap-2 mb-3 rounded-lg bg-[#0d1117] border border-[#1a1e2e] px-3 py-2">
          <span className="text-[10px] text-[#848e9c]">{biLabel('زمانی شیکاری', 'Analysis language')}</span>
          <LangToggle />
        </div>

        {aiError && (
          <div className="flex items-center gap-2 text-xs text-[#f6465d] bg-[#f6465d]/10 rounded-lg px-3 py-2 mb-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {aiError}
          </div>
        )}

        {/* Structured trade summary */}
        {tradeSummary && (
          <div className="mb-4 rounded-xl border border-[#1a1e2e] overflow-hidden">
            {/* Recommendation header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ backgroundColor: recColor(tradeSummary.recommendation) + '1a' }}
            >
              <div className="flex items-center gap-2" style={{ color: recColor(tradeSummary.recommendation) }}>
                {tradeSummary.recommendation === 'buy' ? <TrendingUp className="h-5 w-5" /> : tradeSummary.recommendation === 'sell' ? <TrendingDown className="h-5 w-5" /> : <Minus className="h-5 w-5" />}
                <div>
                  <div className="text-base font-extrabold">{recLabel(tradeSummary.recommendation, langMode)}</div>
                  <div className="text-[10px] text-[#848e9c]">{biLabel('پێشنیاری سەرەکی', 'Main recommendation')}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-sm font-bold text-white"><Gauge className="h-3.5 w-3.5 text-[#848e9c]" />{biLabel('متمانە', 'Confidence')} {tradeSummary.confidence}%</div>
                <div className="h-1.5 w-24 mt-1 rounded-full bg-[#1a1e2e] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${tradeSummary.confidence}%`, backgroundColor: recColor(tradeSummary.recommendation) }} />
                </div>
              </div>
            </div>

            {(tradeSummary.headline || tradeSummary.headlineEn) && (
              <div className="px-4 py-2 text-sm text-[#d1d5db] border-b border-[#1a1e2e]">
                <BiText ku={tradeSummary.headline} en={tradeSummary.headlineEn} />
              </div>
            )}

            {/* Levels grid */}
            <div className="grid grid-cols-2 gap-px bg-[#1a1e2e]">
              <div className="bg-[#0d1117] px-4 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-[#848e9c]"><LogIn className="h-3 w-3" />{biLabel('خاڵی چوونەژوورەوە', 'Entry')}</div>
                <div className="text-sm font-mono text-white mt-0.5">{tradeSummary.entry}</div>
              </div>
              <div className="bg-[#0d1117] px-4 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-[#848e9c]"><OctagonX className="h-3 w-3 text-[#f6465d]" />{biLabel('وەستانی زیان', 'Stop-loss')}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-mono text-[#f6465d]">{tradeSummary.stopLoss}</span>
                  {tradeSummary.stopLossIndicator && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#f6465d]/10 text-[#f6465d]">
                      {tradeSummary.stopLossIndicator}
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-[#0d1117] px-4 py-2.5 col-span-2">
                <div className="flex items-center gap-1.5 text-[10px] text-[#848e9c]"><Target className="h-3 w-3 text-[#0ecb81]" />{biLabel('ئامانجەکانی قازانج', 'Take-profit targets')}</div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {tradeSummary.targets.map((t, i) => (
                    <span key={i} className="text-xs font-mono px-2 py-0.5 rounded bg-[#0ecb81]/10 text-[#0ecb81]">
                      {biLabel('ئامانج', 'Target')} {i + 1}: {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bg-[#0d1117] px-4 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-[#848e9c]"><CalendarClock className="h-3 w-3" />{biLabel('ماوەی پێشبینیکراو', 'Time horizon')}</div>
                <div className="text-sm text-white mt-0.5">{tradeSummary.horizonDays} {biLabel('ڕۆژ', 'days')}</div>
                {targetDate && <div className="text-[10px] text-[#848e9c]">{biLabel('تا', 'until')} {targetDate}</div>}
              </div>
              <div className="bg-[#0d1117] px-4 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-[#848e9c]"><ShieldAlert className="h-3 w-3" style={{ color: riskColor(tradeSummary.riskLevel) }} />{biLabel('ئاستی مەترسی', 'Risk level')}</div>
                <div className="text-sm font-bold mt-0.5" style={{ color: riskColor(tradeSummary.riskLevel) }}>{riskLabel(tradeSummary.riskLevel, langMode)}</div>
              </div>
            </div>

            {/* When to buy / when to sell timing */}
            {(tradeSummary.entryTiming || tradeSummary.entryTimingEn || tradeSummary.exitTiming || tradeSummary.exitTimingEn) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#1a1e2e] border-t border-[#1a1e2e]">
                {(tradeSummary.entryTiming || tradeSummary.entryTimingEn) && (
                  <div className="bg-[#0d1117] px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#0ecb81] mb-1">
                      <LogIn className="h-3.5 w-3.5" />{biLabel('کەی بکڕیت', 'When to buy')}
                    </div>
                    <BiText ku={tradeSummary.entryTiming} en={tradeSummary.entryTimingEn} className="text-xs text-[#d1d5db]" />
                  </div>
                )}
                {(tradeSummary.exitTiming || tradeSummary.exitTimingEn) && (
                  <div className="bg-[#0d1117] px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#f6465d] mb-1">
                      <Target className="h-3.5 w-3.5" />{biLabel('کەی بفرۆشیت', 'When to sell')}
                    </div>
                    <BiText ku={tradeSummary.exitTiming} en={tradeSummary.exitTimingEn} className="text-xs text-[#d1d5db]" />
                  </div>
                )}
              </div>
            )}

            {/* Stop-loss basis — indicator → stop mapping */}
            {(tradeSummary.stopLossBasis || tradeSummary.stopLossBasisEn || tradeSummary.stopLossIndicatorValue) && (
              <div className="px-4 py-3 border-t border-[#1a1e2e]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white mb-2">
                  <OctagonX className="h-3.5 w-3.5 text-[#f6465d]" />
                  {biLabel('بنەمای وەستانی زیان', 'Stop-Loss Basis')}
                  {tradeSummary.stopLossIndicator && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#f6465d]/10 text-[#f6465d]">
                      {tradeSummary.stopLossIndicator}
                    </span>
                  )}
                </div>

                {/* Indicator value → Stop-loss mapping */}
                <div className="flex items-center gap-2 mb-2.5 rounded-lg bg-[#0d1117] border border-[#1a1e2e] px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] text-[#848e9c] uppercase tracking-wide">
                      {biLabel('نرخی ئامێر', 'Indicator value')}
                    </div>
                    <div className="text-xs font-mono text-white truncate">{tradeSummary.stopLossIndicatorValue || tradeSummary.stopLossIndicator || '—'}</div>
                  </div>
                  <div className="text-[#f6465d] text-base font-bold px-1">→</div>
                  <div className="flex-1 min-w-0 text-right">
                    <div className="text-[9px] text-[#848e9c] uppercase tracking-wide">
                      {biLabel('وەستانی زیان', 'Stop-loss')}
                    </div>
                    <div className="text-xs font-mono text-[#f6465d] truncate">{tradeSummary.stopLoss}</div>
                  </div>
                </div>

                <BiText ku={tradeSummary.stopLossBasis} en={tradeSummary.stopLossBasisEn} className="text-xs text-[#d1d5db]" />
              </div>
            )}


            {/* Why this decision */}
            {(tradeSummary.reasoning || tradeSummary.reasoningEn) && (
              <div className="px-4 py-3 border-t border-[#1a1e2e]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white mb-1.5">
                  <Lightbulb className="h-3.5 w-3.5 text-[#f0b90b]" />
                  {biLabel('بۆچی ئەم بڕیارە؟', 'Why this decision?')}
                </div>
                <BiText ku={tradeSummary.reasoning} en={tradeSummary.reasoningEn} className="text-xs text-[#d1d5db]" />
              </div>
            )}

            {/* Most influential indicators */}
            {tradeSummary.keyDrivers?.length > 0 && (
              <div className="px-4 py-3 border-t border-[#1a1e2e]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white mb-2">
                  <BarChart3 className="h-3.5 w-3.5 text-[#f0b90b]" />
                  {biLabel('کاریگەرترین ئامێرەکان', 'Most influential indicators')}
                </div>
                <div className="space-y-2">
                  {tradeSummary.keyDrivers.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-white w-20 shrink-0">{d.indicator}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[#1a1e2e] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: influenceWidth(d.influence), backgroundColor: signalColor(d.effect) }} />
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ color: signalColor(d.effect), backgroundColor: signalColor(d.effect) + '1a' }}>
                        {signalLabel(d.effect, langMode)}
                      </span>
                      <span className="text-[9px] text-[#848e9c] w-16 shrink-0 text-left">{influenceLabel(d.influence, langMode)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 space-y-0.5">
                  {tradeSummary.keyDrivers.filter(d => d.note || d.noteEn).map((d, i) => (
                    <div key={i} className="text-[10px] text-[#848e9c]">• {d.indicator}: {showKu && d.note ? d.note : ''}{showKu && showEn && d.note && d.noteEn ? ' · ' : ''}{showEn && d.noteEn ? d.noteEn : (!showKu && d.note ? d.note : '')}</div>
                  ))}
                </div>
              </div>
            )}

            {(tradeSummary.riskNote || tradeSummary.riskNoteEn) && (
              <div className="flex items-start gap-2 px-4 py-2.5 text-xs text-[#d1d5db] border-t border-[#1a1e2e]" style={{ backgroundColor: riskColor(tradeSummary.riskLevel) + '0d' }}>
                <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: riskColor(tradeSummary.riskLevel) }} />
                <div className="flex-1"><BiText ku={tradeSummary.riskNote} en={tradeSummary.riskNoteEn} /></div>
              </div>
            )}

            {isAdmin && (
              <div className="px-4 py-2.5 border-t border-[#1a1e2e]">
                <button
                  onClick={sendSignal}
                  disabled={sending}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-bold rounded-lg bg-[#229ED9] text-white disabled:opacity-50 active:scale-95 transition"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {sending
                    ? biLabel('دەنێردرێت...', 'Sending...')
                    : sentOk
                      ? biLabel('نێردرا ✅', 'Sent ✅')
                      : biLabel('ناردنی سیگنال بۆ تەلەگرام', 'Send signal to Telegram')}
                </button>
              </div>
            )}



            {generatedAt && (
              <div className="px-4 py-1.5 text-[10px] text-[#848e9c] border-t border-[#1a1e2e]">
                {biLabel('بەرواری شیکاری', 'Analysis date')}: {fmtDate(new Date(generatedAt))} · {biLabel('ئەمە ڕاوێژی دارایی نییە', 'not financial advice')}
              </div>
            )}
          </div>
        )}

        {aiText ? (
          <div className="text-sm text-[#d1d5db] whitespace-pre-wrap leading-relaxed">{aiText}</div>
        ) : !aiLoading && !aiError && !tradeSummary ? (
          <div className="text-xs text-[#848e9c]">{biLabel('کلیک لە "شیکاری بکە" بکە بۆ پوختەی کڕین/فرۆشتن، ئاستەکان، کەی بکڕیت و کەی بفرۆشیت.', 'Tap "Analyze" for a buy/sell summary, levels, and when to buy / when to sell.')}</div>
        ) : null}
      </div>

      {/* Admin: sent Telegram signals log */}
      {isAdmin && (
        <div className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Send className="h-4 w-4 text-[#229ED9]" />
              {biLabel('سیگنالە ناردراوەکان', 'Sent signals')}
              {sentSignals.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#1a1e2e] text-[#848e9c]">{sentSignals.length}</span>
              )}
            </div>
            <button
              onClick={() => { setShowSignals(s => !s); if (!showSignals) fetchSentSignals(); }}
              className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-[#1a1e2e] text-[#848e9c] hover:text-white active:scale-95 transition"
            >
              {showSignals ? biLabel('شاردنەوە', 'Hide') : biLabel('پیشاندان', 'Show')}
            </button>
          </div>

          {showSignals && (
            signalsLoading ? (
              <div className="flex items-center gap-2 text-xs text-[#848e9c] py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> {biLabel('بارکردن...', 'Loading...')}
              </div>
            ) : sentSignals.length === 0 ? (
              <div className="text-xs text-[#848e9c] py-4 text-center">{biLabel('هیچ سیگنالێک نەنێردراوە.', 'No signals sent yet.')}</div>
            ) : (
              <div className="space-y-2">
                {sentSignals.map((s) => {
                  const d = new Date(s.created_at);
                  const time = `${fmtDate(d)} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                  const failed = s.status !== 'sent';
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedSignal(s)}
                      className="rounded-lg border border-[#1a1e2e] bg-[#0b0e16] p-3 cursor-pointer hover:border-[#2d2d2d] active:scale-[0.99] transition"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] font-extrabold px-2 py-0.5 rounded"
                            style={{ color: recColor(s.recommendation ?? 'hold'), backgroundColor: recColor(s.recommendation ?? 'hold') + '1a' }}
                          >
                            {recLabel(s.recommendation ?? 'hold', langMode)}
                          </span>
                          <span className="text-sm font-bold text-white">{s.symbol ?? '—'}</span>
                          {s.timeframe && <span className="text-[10px] text-[#848e9c]">{s.timeframe}</span>}
                        </div>
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ color: failed ? '#f6465d' : '#0ecb81', backgroundColor: (failed ? '#f6465d' : '#0ecb81') + '1a' }}
                        >
                          {failed ? biLabel('نەنێردرا', 'Failed') : biLabel('نێردرا', 'Sent')}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                        {s.entry && (
                          <div className="flex items-center gap-1"><span className="text-[#848e9c]">{biLabel('داخڵبوون', 'Entry')}:</span><span className="font-mono text-white">{s.entry}</span></div>
                        )}
                        {s.stop_loss && (
                          <div className="flex items-center gap-1"><span className="text-[#848e9c]">SL:</span><span className="font-mono text-[#f6465d]">{s.stop_loss}</span></div>
                        )}
                        {s.confidence != null && (
                          <div className="flex items-center gap-1"><span className="text-[#848e9c]">{biLabel('متمانە', 'Conf')}:</span><span className="font-bold text-white">{s.confidence}%</span></div>
                        )}
                        {s.risk_level && (
                          <div className="flex items-center gap-1"><span className="text-[#848e9c]">{biLabel('مەترسی', 'Risk')}:</span><span className="font-bold" style={{ color: riskColor(s.risk_level) }}>{riskLabel(s.risk_level, langMode)}</span></div>
                        )}
                      </div>

                      {s.targets && s.targets.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className="text-[10px] text-[#848e9c] flex items-center gap-1"><Target className="h-3 w-3 text-[#0ecb81]" />TP:</span>
                          {s.targets.map((t, i) => (
                            <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#0ecb81]/10 text-[#0ecb81]">{i + 1}: {t}</span>
                          ))}
                        </div>
                      )}

                      {failed && s.error && (
                        <div className="mt-1.5 text-[10px] text-[#f6465d] break-all">{s.error}</div>
                      )}

                      <div className="mt-1.5 text-[10px] text-[#848e9c]">{time}</div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}

      {/* Signal detail drawer */}
      <Sheet open={!!selectedSignal} onOpenChange={(open) => { if (!open) setSelectedSignal(null); }}>
        <SheetContent side="bottom" className="bg-[#0d1117] border-[#1a1e2e] rounded-t-2xl max-h-[85vh] overflow-y-auto p-0">
          {selectedSignal && (
            <div className="p-4 space-y-4">
              <SheetHeader className="text-left sm:text-left">
                <div className="flex items-center justify-between">
                  <SheetTitle className="text-white flex items-center gap-2">
                    {selectedSignal.symbol ?? '—'}
                    <span
                      className="text-[10px] font-extrabold px-2 py-0.5 rounded"
                      style={{ color: recColor(selectedSignal.recommendation ?? 'hold'), backgroundColor: recColor(selectedSignal.recommendation ?? 'hold') + '1a' }}
                    >
                      {recLabel(selectedSignal.recommendation ?? 'hold', langMode)}
                    </span>
                  </SheetTitle>
                  <button
                    onClick={() => setSelectedSignal(null)}
                    className="rounded-sm p-1 opacity-70 hover:opacity-100 transition"
                  >
                    <X className="h-5 w-5 text-[#848e9c]" />
                  </button>
                </div>
                {selectedSignal.headline && (
                  <p className="text-sm text-[#d1d5db] leading-relaxed">{selectedSignal.headline}</p>
                )}
              </SheetHeader>

              {/* Status */}
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-bold px-2 py-1 rounded"
                  style={{
                    color: selectedSignal.status === 'sent' ? '#0ecb81' : '#f6465d',
                    backgroundColor: (selectedSignal.status === 'sent' ? '#0ecb81' : '#f6465d') + '1a',
                  }}
                >
                  {selectedSignal.status === 'sent' ? biLabel('نێردرا', 'Sent') : biLabel('نەنێردرا', 'Failed')}
                </span>
                {selectedSignal.telegram_message_id && (
                  <span className="text-[10px] text-[#848e9c]">Msg #{selectedSignal.telegram_message_id}</span>
                )}
              </div>

              {/* Levels grid */}
              <div className="grid grid-cols-2 gap-px bg-[#1a1e2e] rounded-lg overflow-hidden">
                {selectedSignal.entry && (
                  <div className="bg-[#0b0e16] px-3 py-2.5">
                    <div className="flex items-center gap-1 text-[10px] text-[#848e9c]"><LogIn className="h-3 w-3" />{biLabel('خاڵی چوونەژوورەوە', 'Entry')}</div>
                    <div className="text-sm font-mono text-white mt-0.5">{selectedSignal.entry}</div>
                  </div>
                )}
                {selectedSignal.stop_loss && (
                  <div className="bg-[#0b0e16] px-3 py-2.5">
                    <div className="flex items-center gap-1 text-[10px] text-[#848e9c]"><OctagonX className="h-3 w-3 text-[#f6465d]" />{biLabel('وەستانی زیان', 'Stop Loss')}</div>
                    <div className="text-sm font-mono text-[#f6465d] mt-0.5">{selectedSignal.stop_loss}</div>
                  </div>
                )}
                {selectedSignal.confidence != null && (
                  <div className="bg-[#0b0e16] px-3 py-2.5">
                    <div className="flex items-center gap-1 text-[10px] text-[#848e9c]"><Gauge className="h-3 w-3" />{biLabel('متمانە', 'Confidence')}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-sm font-bold text-white">{selectedSignal.confidence}%</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[#1a1e2e] overflow-hidden">
                        <div className="h-full rounded-full bg-[#f0b90b]" style={{ width: `${selectedSignal.confidence}%` }} />
                      </div>
                    </div>
                  </div>
                )}
                {selectedSignal.risk_level && (
                  <div className="bg-[#0b0e16] px-3 py-2.5">
                    <div className="flex items-center gap-1 text-[10px] text-[#848e9c]"><ShieldAlert className="h-3 w-3" style={{ color: riskColor(selectedSignal.risk_level) }} />{biLabel('ئاستی مەترسی', 'Risk Level')}</div>
                    <div className="text-sm font-bold mt-0.5" style={{ color: riskColor(selectedSignal.risk_level) }}>{riskLabel(selectedSignal.risk_level, langMode)}</div>
                  </div>
                )}
                {selectedSignal.horizon_days != null && (
                  <div className="bg-[#0b0e16] px-3 py-2.5">
                    <div className="flex items-center gap-1 text-[10px] text-[#848e9c]"><CalendarClock className="h-3 w-3" />{biLabel('ماوەی پێشبینیکراو', 'Time Horizon')}</div>
                    <div className="text-sm text-white mt-0.5">{selectedSignal.horizon_days} {biLabel('ڕۆژ', 'days')}</div>
                  </div>
                )}
                {selectedSignal.price != null && (
                  <div className="bg-[#0b0e16] px-3 py-2.5">
                    <div className="flex items-center gap-1 text-[10px] text-[#848e9c]"><BarChart3 className="h-3 w-3" />{biLabel('نرخی کاتی ناردن', 'Price at send')}</div>
                    <div className="text-sm font-mono text-white mt-0.5">${fmt(selectedSignal.price)}</div>
                  </div>
                )}
              </div>

              {/* Targets */}
              {selectedSignal.targets && selectedSignal.targets.length > 0 && (
                <div className="bg-[#0b0e16] border border-[#1a1e2e] rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-[10px] text-[#848e9c] mb-2">
                    <Target className="h-3.5 w-3.5 text-[#0ecb81]" />
                    {biLabel('ئامانجەکانی قازانج', 'Take-Profit Targets')}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedSignal.targets.map((t, i) => (
                      <span key={i} className="text-xs font-mono px-2.5 py-1 rounded bg-[#0ecb81]/10 text-[#0ecb81]">
                        {biLabel('ئامانج', 'Target')} {i + 1}: {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Error reason */}
              {selectedSignal.status !== 'sent' && selectedSignal.error && (
                <div className="bg-[#f6465d]/10 border border-[#f6465d]/20 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#f6465d] mb-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {biLabel('هۆکاری هەڵە', 'Failure Reason')}
                  </div>
                  <div className="text-xs text-[#f6465d] break-all leading-relaxed">{selectedSignal.error}</div>
                </div>
              )}

              {/* Meta */}
              <div className="text-[10px] text-[#848e9c] pt-2 border-t border-[#1a1e2e]">
                {selectedSignal.timeframe && <span className="mr-3">{biLabel('تایم فریم', 'Timeframe')}: {selectedSignal.timeframe}</span>}
                <span>{biLabel('بەروار', 'Date')}: {fmtDate(new Date(selectedSignal.created_at))} · {String(new Date(selectedSignal.created_at).getHours()).padStart(2,'0')}:{String(new Date(selectedSignal.created_at).getMinutes()).padStart(2,'0')}</span>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Chart image analysis */}
      <div className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <ImageIcon className="h-4 w-4 text-[#2962ff]" />
            {biLabel('شیکاری چارت لە وێنە', 'Chart image analysis')}
          </div>
          <div className="flex items-center gap-2">
            {imagePreviews.length > 0 && !imageLoading && (
              <button
                onClick={clearImage}
                className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-[#1a1e2e] text-[#848e9c] hover:text-white active:scale-95 transition"
              >
                {biLabel('سڕینەوە', 'Clear')}
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={imageLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#2962ff] text-white disabled:opacity-50 active:scale-95 transition"
            >
              {imageLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {imageLoading ? biLabel('شیکاری...', 'Analyzing...') : imagePreviews.length > 0 ? biLabel('وێنەی نوێ', 'New image') : biLabel('وێنە بار بکە', 'Upload image')}
            </button>
          </div>
        </div>

        {/* Timeframe / interval selector */}
        <div className="mb-3">
          <div className="flex items-center gap-1.5 text-[10px] text-[#848e9c] mb-1.5">
            <CalendarClock className="h-3 w-3" />
            {biLabel('ماوەی کاتی چارتەکان', 'Chart timeframe')}
          </div>
          <div role="radiogroup" aria-label="Chart timeframe / ماوەی کاتی چارت" className="flex gap-1.5">
            {CHART_TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                role="radio"
                aria-checked={chartTimeframe === tf}
                aria-label={`Timeframe ${tf}`}
                onClick={() => setChartTimeframe(tf)}
                disabled={imageLoading}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition active:scale-95 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0d1117] ${
                  chartTimeframe === tf
                    ? 'bg-[#2962ff] text-white'
                    : 'bg-[#1a1e2e] text-[#848e9c] hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImagePick}
        />

        {imageError && (
          <div className="flex items-center gap-2 text-xs text-[#f6465d] bg-[#f6465d]/10 rounded-lg px-3 py-2 mb-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {imageError}
          </div>
        )}

        {imagePreviews.length > 0 && (
          <div className={`mb-3 grid gap-2 ${imagePreviews.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {imagePreviews.map((src, i) => (
              <div key={i} className="relative rounded-lg overflow-hidden border border-[#1a1e2e]">
                <img src={src} alt={`${biLabel('چارتی بارکراو', 'Uploaded chart')} ${i + 1}`} className="w-full max-h-48 object-contain bg-black" />
                {imagePreviews.length > 1 && (
                  <span className="absolute top-1 right-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/70 text-white">
                    {biLabel('چارت', 'Chart')} {i + 1}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {imageText ? (
          <div className="text-sm text-[#d1d5db] whitespace-pre-wrap leading-relaxed">{imageText}</div>
        ) : imageLoading ? (
          <div className="flex items-center gap-2 text-xs text-[#848e9c]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {imagePreviews.length > 1 ? biLabel('کەندڵەکان دەخوێنرێنەوە و بەراورد دەکرێن...', 'Reading and comparing candles...') : biLabel('کەندڵەکان دەخوێنرێنەوە...', 'Reading candles...')}
          </div>
        ) : imagePreviews.length === 0 ? (
          <div className="text-xs text-[#848e9c]">{biLabel('یەک یان چەند وێنەی چارت (سکرینشۆت) بار بکە بۆ خوێندنەوەی کەندڵەکان و بەراوردکردنی نیشانەکان لە یەک پوختەدا.', 'Upload one or more chart screenshots to read the candles and compare signals in a single summary.')}</div>
        ) : null}
      </div>
    </div>
  );
}
