import { useMemo, useState } from 'react';
import { OHLCCandle, TIMEFRAMES } from '@/lib/krakenApi';
import { computeIndicators, summarizeSignals, SignalType } from '@/lib/indicators';
import { Sparkles, TrendingUp, TrendingDown, Minus, Loader2, AlertCircle } from 'lucide-react';

interface CryptoAnalysisProps {
  symbol: string;
  candles: OHLCCandle[];
  currentPrice: number;
  change24h: number;
  interval: number;
}

const signalColor = (s: SignalType) =>
  s === 'buy' ? '#0ecb81' : s === 'sell' ? '#f6465d' : '#848e9c';

const signalLabel = (s: SignalType) =>
  s === 'buy' ? 'کڕین' : s === 'sell' ? 'فرۆشتن' : 'بێلایەن';

function fmt(n: number | null, digits = 2): string {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function CryptoAnalysis({ symbol, candles, currentPrice, change24h, interval }: CryptoAnalysisProps) {
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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

  const runAiAnalysis = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiText('');
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crypto-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
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
        }),
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
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'هەڵەیەک ڕوویدا.');
    } finally {
      setAiLoading(false);
    }
  };

  const hasData = candles.length > 0;
  const gaugePct = (summary.score + 100) / 2; // 0..100

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
            {aiLoading ? 'شیکاری...' : aiText ? 'دووبارە شیکاری' : 'شیکاری بکە'}
          </button>
        </div>

        {aiError && (
          <div className="flex items-center gap-2 text-xs text-[#f6465d] bg-[#f6465d]/10 rounded-lg px-3 py-2 mb-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {aiError}
          </div>
        )}

        {aiText ? (
          <div className="text-sm text-[#d1d5db] whitespace-pre-wrap leading-relaxed">{aiText}</div>
        ) : !aiLoading && !aiError ? (
          <div className="text-xs text-[#848e9c]">کلیک لە "شیکاری بکە" بکە بۆ وەرگرتنی شیکارییەکی تەواوی بازاڕ بە زمانی کوردی.</div>
        ) : null}
      </div>
    </div>
  );
}
