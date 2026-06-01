import { useMemo, useState, useRef } from 'react';
import { OHLCCandle, TIMEFRAMES } from '@/lib/krakenApi';
import { computeIndicators, summarizeSignals, SignalType } from '@/lib/indicators';
import { Sparkles, TrendingUp, TrendingDown, Minus, Loader2, AlertCircle, Target, ShieldAlert, LogIn, OctagonX, CalendarClock, Gauge, Lightbulb, BarChart3, Image as ImageIcon, Upload } from 'lucide-react';

interface CryptoAnalysisProps {
  symbol: string;
  candles: OHLCCandle[];
  currentPrice: number;
  change24h: number;
  interval: number;
}

type Recommendation = 'buy' | 'sell' | 'hold';
type RiskLevel = 'low' | 'medium' | 'high';
type Influence = 'high' | 'medium' | 'low';

interface KeyDriver {
  indicator: string;
  effect: SignalType;
  influence: Influence;
  note: string;
}

interface TradeSummary {
  recommendation: Recommendation;
  confidence: number;
  headline: string;
  entry: string;
  targets: string[];
  stopLoss: string;
  horizonDays: number;
  riskLevel: RiskLevel;
  riskNote: string;
  reasoning: string;
  keyDrivers: KeyDriver[];
}

const signalColor = (s: SignalType) =>
  s === 'buy' ? '#0ecb81' : s === 'sell' ? '#f6465d' : '#848e9c';

const signalLabel = (s: SignalType) =>
  s === 'buy' ? 'کڕین' : s === 'sell' ? 'فرۆشتن' : 'بێلایەن';

const recColor = (r: Recommendation) =>
  r === 'buy' ? '#0ecb81' : r === 'sell' ? '#f6465d' : '#f0b90b';

const recLabel = (r: Recommendation) =>
  r === 'buy' ? 'کڕین' : r === 'sell' ? 'فرۆشتن' : 'هەڵگرتن';

const riskColor = (r: RiskLevel) =>
  r === 'low' ? '#0ecb81' : r === 'high' ? '#f6465d' : '#f0b90b';

const riskLabel = (r: RiskLevel) =>
  r === 'low' ? 'نزم' : r === 'high' ? 'بەرز' : 'مامناوەند';

const influenceLabel = (i: Influence) =>
  i === 'high' ? 'کاریگەری بەرز' : i === 'low' ? 'کاریگەری نزم' : 'کاریگەری مامناوەند';

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

export function CryptoAnalysis({ symbol, candles, currentPrice, change24h, interval }: CryptoAnalysisProps) {
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [tradeSummary, setTradeSummary] = useState<TradeSummary | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  // Chart image analysis state
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageText, setImageText] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const indicators = useMemo(() => computeIndicators(candles), [candles]);
  const summary = useMemo(() => summarizeSignals(indicators, currentPrice), [indicators, currentPrice]);

  const tfLabel = TIMEFRAMES.find(t => t.interval === interval)?.label ?? `${interval}m`;

  const rows: { label: string; value: string; signal: SignalType; hint?: string }[] = [];
  if (indicators.rsi != null) {
    rows.push({
      label: 'RSI (14)',
      value: fmt(indicators.rsi),
      signal: indicators.rsi < 30 ? 'buy' : indicators.rsi > 70 ? 'sell' : 'neutral',
      hint: indicators.rsi < 30 ? 'زۆر فرۆشراو' : indicators.rsi > 70 ? 'زۆر کڕراو' : 'ناوەند',
    });
  }
  if (indicators.macd) {
    rows.push({
      label: 'MACD',
      value: fmt(indicators.macd.histogram, 4),
      signal: indicators.macd.histogram > 0 ? 'buy' : indicators.macd.histogram < 0 ? 'sell' : 'neutral',
      hint: indicators.macd.histogram > 0 ? 'هێزی کڕین' : 'هێزی فرۆشتن',
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
      let msg = 'هەڵەیەک ڕوویدا لە دروستکردنی پوختە.';
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
      let msg = 'هەڵەیەک ڕوویدا لە شیکاری AI.';
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
      setAiError(e instanceof Error ? e.message : 'هەڵەیەک ڕوویدا.');
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
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setImageError('تکایە تەنها وێنە هەڵبژێرە.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setImageError('قەبارەی وێنە زۆر گەورەیە (زۆرترین ٨MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      setImageError(null);
      setImageText('');
      analyzeImage(dataUrl);
    };
    reader.onerror = () => setImageError('نەتوانرا وێنە بخوێنرێتەوە.');
    reader.readAsDataURL(file);
  };

  const analyzeImage = async (dataUrl: string) => {
    setImageLoading(true);
    setImageError(null);
    setImageText('');
    try {
      const resp = await fetch(fnUrl, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ mode: 'image', symbol, imageBase64: dataUrl }),
      });
      if (!resp.ok || !resp.body) {
        let msg = 'هەڵەیەک ڕوویدا لە شیکاری وێنە.';
        try {
          const j = await resp.json();
          if (j?.error) msg = j.error;
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      await consumeStream(resp, setImageText);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'هەڵەیەک ڕوویدا.');
    } finally {
      setImageLoading(false);
    }
  };

  const clearImage = () => {
    setImagePreview(null);
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
            <div className="text-sm text-[#848e9c]">پوختەی نیشاندەرە تەکنیکییەکان</div>
            <div className="text-lg font-bold text-white">{symbol}/USD · {tfLabel}</div>
          </div>
          <div className="flex items-center gap-2" style={{ color: signalColor(summary.signal) }}>
            {summary.signal === 'buy' ? <TrendingUp className="h-6 w-6" /> : summary.signal === 'sell' ? <TrendingDown className="h-6 w-6" /> : <Minus className="h-6 w-6" />}
            <span className="text-xl font-extrabold">{signalLabel(summary.signal)}</span>
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
          <span>فرۆشتن</span><span>بێلایەن</span><span>کڕین</span>
        </div>

        <div className="flex gap-2 mt-3 text-xs">
          <span className="px-2 py-1 rounded bg-[#0ecb81]/10 text-[#0ecb81]">کڕین {summary.buyCount}</span>
          <span className="px-2 py-1 rounded bg-[#848e9c]/10 text-[#848e9c]">بێلایەن {summary.neutralCount}</span>
          <span className="px-2 py-1 rounded bg-[#f6465d]/10 text-[#f6465d]">فرۆشتن {summary.sellCount}</span>
        </div>
      </div>

      {/* Indicators table */}
      <div className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#1a1e2e] text-sm font-bold text-white">نیشاندەرە تەکنیکییەکان</div>
        {!hasData ? (
          <div className="p-6 text-center text-[#848e9c] text-sm">دانەی نرخ بەردەست نییە...</div>
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
                    {signalLabel(r.signal)}
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
            شیکاری زیرەک (AI)
          </div>
          <button
            onClick={runAiAnalysis}
            disabled={aiLoading || !hasData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#f0b90b] text-black disabled:opacity-50 active:scale-95 transition"
          >
            {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {aiLoading ? 'شیکاری...' : (aiText || tradeSummary) ? 'دووبارە شیکاری' : 'شیکاری بکە'}
          </button>
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
                  <div className="text-base font-extrabold">{recLabel(tradeSummary.recommendation)}</div>
                  <div className="text-[10px] text-[#848e9c]">پێشنیاری سەرەکی</div>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 text-sm font-bold text-white"><Gauge className="h-3.5 w-3.5 text-[#848e9c]" />متمانە {tradeSummary.confidence}%</div>
                <div className="h-1.5 w-24 mt-1 rounded-full bg-[#1a1e2e] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${tradeSummary.confidence}%`, backgroundColor: recColor(tradeSummary.recommendation) }} />
                </div>
              </div>
            </div>

            {tradeSummary.headline && (
              <div className="px-4 py-2 text-sm text-[#d1d5db] border-b border-[#1a1e2e]">{tradeSummary.headline}</div>
            )}

            {/* Levels grid */}
            <div className="grid grid-cols-2 gap-px bg-[#1a1e2e]">
              <div className="bg-[#0d1117] px-4 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-[#848e9c]"><LogIn className="h-3 w-3" />خاڵی چوونەژوورەوە</div>
                <div className="text-sm font-mono text-white mt-0.5">{tradeSummary.entry}</div>
              </div>
              <div className="bg-[#0d1117] px-4 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-[#848e9c]"><OctagonX className="h-3 w-3 text-[#f6465d]" />وەستانی زیان</div>
                <div className="text-sm font-mono text-[#f6465d] mt-0.5">{tradeSummary.stopLoss}</div>
              </div>
              <div className="bg-[#0d1117] px-4 py-2.5 col-span-2">
                <div className="flex items-center gap-1.5 text-[10px] text-[#848e9c]"><Target className="h-3 w-3 text-[#0ecb81]" />ئامانجەکانی قازانج</div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {tradeSummary.targets.map((t, i) => (
                    <span key={i} className="text-xs font-mono px-2 py-0.5 rounded bg-[#0ecb81]/10 text-[#0ecb81]">
                      ئامانج {i + 1}: {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bg-[#0d1117] px-4 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-[#848e9c]"><CalendarClock className="h-3 w-3" />ماوەی پێشبینیکراو</div>
                <div className="text-sm text-white mt-0.5">{tradeSummary.horizonDays} ڕۆژ</div>
                {targetDate && <div className="text-[10px] text-[#848e9c]">تا {targetDate}</div>}
              </div>
              <div className="bg-[#0d1117] px-4 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-[#848e9c]"><ShieldAlert className="h-3 w-3" style={{ color: riskColor(tradeSummary.riskLevel) }} />ئاستی مەترسی</div>
                <div className="text-sm font-bold mt-0.5" style={{ color: riskColor(tradeSummary.riskLevel) }}>{riskLabel(tradeSummary.riskLevel)}</div>
              </div>
            </div>

            {/* Why this decision */}
            {tradeSummary.reasoning && (
              <div className="px-4 py-3 border-t border-[#1a1e2e]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white mb-1.5">
                  <Lightbulb className="h-3.5 w-3.5 text-[#f0b90b]" />
                  بۆچی ئەم بڕیارە؟
                </div>
                <p className="text-xs text-[#d1d5db] leading-relaxed">{tradeSummary.reasoning}</p>
              </div>
            )}

            {/* Most influential indicators */}
            {tradeSummary.keyDrivers?.length > 0 && (
              <div className="px-4 py-3 border-t border-[#1a1e2e]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white mb-2">
                  <BarChart3 className="h-3.5 w-3.5 text-[#f0b90b]" />
                  کاریگەرترین ئامێرەکان
                </div>
                <div className="space-y-2">
                  {tradeSummary.keyDrivers.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-white w-20 shrink-0">{d.indicator}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[#1a1e2e] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: influenceWidth(d.influence), backgroundColor: signalColor(d.effect) }} />
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ color: signalColor(d.effect), backgroundColor: signalColor(d.effect) + '1a' }}>
                        {signalLabel(d.effect)}
                      </span>
                      <span className="text-[9px] text-[#848e9c] w-16 shrink-0 text-left">{influenceLabel(d.influence)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 space-y-0.5">
                  {tradeSummary.keyDrivers.filter(d => d.note).map((d, i) => (
                    <div key={i} className="text-[10px] text-[#848e9c]">• {d.indicator}: {d.note}</div>
                  ))}
                </div>
              </div>
            )}

            {tradeSummary.riskNote && (
              <div className="flex items-start gap-2 px-4 py-2.5 text-xs text-[#d1d5db] border-t border-[#1a1e2e]" style={{ backgroundColor: riskColor(tradeSummary.riskLevel) + '0d' }}>
                <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: riskColor(tradeSummary.riskLevel) }} />
                <span>{tradeSummary.riskNote}</span>
              </div>
            )}

            {generatedAt && (
              <div className="px-4 py-1.5 text-[10px] text-[#848e9c] border-t border-[#1a1e2e]">
                بەرواری شیکاری: {fmtDate(new Date(generatedAt))} · ئەمە ڕاوێژی دارایی نییە
              </div>
            )}
          </div>
        )}

        {aiText ? (
          <div className="text-sm text-[#d1d5db] whitespace-pre-wrap leading-relaxed">{aiText}</div>
        ) : !aiLoading && !aiError && !tradeSummary ? (
          <div className="text-xs text-[#848e9c]">کلیک لە "شیکاری بکە" بکە بۆ وەرگرتنی پوختەی کڕین/فرۆشتن، ئاستەکان، بەروار و هەڵسەنگاندنی مەترسی بە زمانی کوردی.</div>
        ) : null}
      </div>

      {/* Chart image analysis */}
      <div className="bg-[#0d1117] border border-[#1a1e2e] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <ImageIcon className="h-4 w-4 text-[#2962ff]" />
            شیکاری چارت لە وێنە
          </div>
          <div className="flex items-center gap-2">
            {imagePreview && !imageLoading && (
              <button
                onClick={clearImage}
                className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-[#1a1e2e] text-[#848e9c] hover:text-white active:scale-95 transition"
              >
                سڕینەوە
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={imageLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-[#2962ff] text-white disabled:opacity-50 active:scale-95 transition"
            >
              {imageLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {imageLoading ? 'شیکاری...' : imagePreview ? 'وێنەی نوێ' : 'وێنە بار بکە'}
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImagePick}
        />

        {imageError && (
          <div className="flex items-center gap-2 text-xs text-[#f6465d] bg-[#f6465d]/10 rounded-lg px-3 py-2 mb-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {imageError}
          </div>
        )}

        {imagePreview && (
          <div className="mb-3 rounded-lg overflow-hidden border border-[#1a1e2e]">
            <img src={imagePreview} alt="چارتی بارکراو" className="w-full max-h-64 object-contain bg-black" />
          </div>
        )}

        {imageText ? (
          <div className="text-sm text-[#d1d5db] whitespace-pre-wrap leading-relaxed">{imageText}</div>
        ) : imageLoading ? (
          <div className="flex items-center gap-2 text-xs text-[#848e9c]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            کەندڵەکان دەخوێنرێنەوە...
          </div>
        ) : !imagePreview ? (
          <div className="text-xs text-[#848e9c]">وێنەیەکی چارت (سکرینشۆت) بار بکە بۆ خوێندنەوەی کەندڵەکان و شیکارییەکی تەواو بە زمانی کوردی.</div>
        ) : null}
      </div>
    </div>
  );
}
