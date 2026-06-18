// Pure rule-based market analysis — ZERO API calls, zero credits, instant.
// Works for Gold, Oil and Bitcoin (any asset with EMA/RSI/MACD indicators).

export interface RuleInput {
  price: number;
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  rsi: number | null;
  macdLine: number | null;
  macdSignal: number | null;
}

export interface RuleReason {
  en: string;
  ku: string;
}

export interface RuleResult {
  signal: 'buy' | 'sell' | 'hold';
  signalLabel: string; // e.g. "BUY 🟢"
  trend: string; // Bullish / Bearish / Neutral
  trendKu: string;
  score: number; // 0..4 EMA/MACD confluence
  confidence: number; // 0..100 for UI meters
  risk: 'low' | 'medium' | 'high';
  riskLabel: string; // "Medium 🟡"
  riskLabelKu: string;
  support: number;
  resistance: number;
  tp: number;
  sl: number;
  reasons: RuleReason[];
  rsi: number | null;
  rsiStatus: string;
  rsiStatusKu: string;
  generatedAt: string;
}

/**
 * Core rule engine. Mirrors the spec exactly: counts EMA/MACD confluence into a
 * 0..4 score, classifies RSI, then derives signal / trend / risk / key levels.
 */
export function analyzeMarket(data: RuleInput): RuleResult {
  const { price, ema9, ema21, ema50, rsi, macdLine, macdSignal } = data;

  // EMA / MACD confluence score (0..4)
  let score = 0;
  const reasons: RuleReason[] = [];

  if (ema9 != null && ema21 != null && ema9 > ema21) {
    score++;
    reasons.push({ en: 'EMA9 > EMA21 ✅', ku: 'EMA9 > EMA21 ✅' });
  }
  if (ema21 != null && ema50 != null && ema21 > ema50) {
    score++;
    reasons.push({ en: 'EMA21 > EMA50 ✅', ku: 'EMA21 > EMA50 ✅' });
  }
  if (ema50 != null && price > ema50) {
    score++;
    reasons.push({ en: 'Price > EMA50 ✅', ku: 'نرخ > EMA50 ✅' });
  }
  if (macdLine != null && macdSignal != null && macdLine > macdSignal) {
    score++;
    reasons.push({ en: 'MACD Bullish ✅', ku: 'MACD بەرزبوونەوە ✅' });
  }

  // RSI classification
  let rsiStatus = 'Neutral';
  let rsiStatusKu = 'ناوەند';
  if (rsi != null) {
    if (rsi > 70) { rsiStatus = 'Overbought ⚠️'; rsiStatusKu = 'زۆر کڕراو ⚠️'; }
    else if (rsi > 50) { rsiStatus = 'Bullish 🟢'; rsiStatusKu = 'بەرزبوونەوە 🟢'; }
    else if (rsi > 30) { rsiStatus = 'Bearish 🔴'; rsiStatusKu = 'داشکان 🔴'; }
    else { rsiStatus = 'Oversold ⚠️'; rsiStatusKu = 'زۆر فرۆشراو ⚠️'; }
  }

  // Final signal
  let signal: 'buy' | 'sell' | 'hold';
  let signalLabel: string;
  let trend: string;
  let trendKu: string;
  if (score >= 3) {
    signal = 'buy'; signalLabel = 'BUY 🟢'; trend = 'Bullish'; trendKu = 'بەرزبوونەوە';
  } else if (score <= 1) {
    signal = 'sell'; signalLabel = 'SELL 🔴'; trend = 'Bearish'; trendKu = 'داشکان';
  } else {
    signal = 'hold'; signalLabel = 'WAIT 🟡'; trend = 'Neutral'; trendKu = 'ناوەند';
  }

  // Risk level
  let risk: 'low' | 'medium' | 'high' = 'medium';
  let riskLabel = 'Medium 🟡';
  let riskLabelKu = 'مامناوەند 🟡';
  if (rsi != null && (rsi > 65 || rsi < 35)) { risk = 'high'; riskLabel = 'High 🔴'; riskLabelKu = 'بەرز 🔴'; }
  if (score === 4 || score === 0) { risk = 'low'; riskLabel = 'Low 🟢'; riskLabelKu = 'نزم 🟢'; }

  // Confidence (0..100) for the UI meters — derived from the confluence score.
  const confidence = signal === 'buy'
    ? Math.round((score / 4) * 100)
    : signal === 'sell'
    ? Math.round(((4 - score) / 4) * 100)
    : 55;

  // Key levels
  const emas = [ema9, ema21, ema50].filter((v): v is number => v != null && Number.isFinite(v));
  const support = emas.length ? Math.min(...emas) : price * 0.994;
  const resistance = price * 1.006;
  const tp = price + price * 0.006;
  const sl = price - price * 0.004;

  return {
    signal, signalLabel, trend, trendKu, score, confidence,
    risk, riskLabel, riskLabelKu,
    support, resistance, tp, sl,
    reasons, rsi, rsiStatus, rsiStatusKu,
    generatedAt: new Date().toISOString(),
  };
}
