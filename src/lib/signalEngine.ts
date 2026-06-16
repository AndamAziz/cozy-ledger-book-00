import { OHLCCandle } from './krakenApi';
import { calculateRSI, calculateMACD, STANDARD_INDICATOR_SETTINGS, bestIndicatorSettings } from './indicators';
import { trendFromCandles, TrendDir, getSessionStatuses } from './aiAnalysis';

export type SignalAction = 'buy' | 'sell' | 'wait' | 'neutral';
export type AssetKey = 'gold' | 'btc' | 'eurusd' | 'gbpusd' | 'usdjpy';

/** The six tradable timeframes exposed to the user. */
export const SIGNAL_TIMEFRAMES = ['M5', 'M15', 'M30', 'H1', 'H4', 'D1'] as const;
export type SignalTF = (typeof SIGNAL_TIMEFRAMES)[number];

/** Live macro snapshot shared across all assets. */
export interface MacroContext {
  /** DXY (US dollar index) daily % change. */
  dxyChangePct: number | null;
  /** Crypto/market Fear & Greed index (0..100). */
  fearGreed: number | null;
  /** S&P 500 daily % change (stock-market risk proxy). */
  spxChangePct: number | null;
}

export interface NewsEvent {
  title: string;
  country: string;
  impact: string;
  date: string;
  forecast: string;
  previous: string;
  actual: string;
}

export interface NewsRisk {
  /** Nearest relevant high/medium event in the future, or null. */
  nearest: NewsEvent | null;
  /** Minutes until the nearest relevant event (null if none). */
  minutesAway: number | null;
  /** A high-impact event lands within 60 minutes -> force WAIT. */
  blocking: boolean;
  /** A high/medium event lands within 120 minutes -> show a caution note. */
  warning: boolean;
}

export interface TFView {
  label: string;
  dir: TrendDir;
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
}

export interface AssetSignal {
  asset: AssetKey;
  label: string;
  timeframe: SignalTF;
  price: number;
  action: SignalAction;
  /** 0..100 — only meaningful (shown) when > 60. */
  confidence: number;
  /** Raw combined score -100..100 (debug). */
  score: number;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
  atr: number;
  decimals: number;
  conflict: boolean;
  reasonKu: string;
  reasonEn: string;
  newsWarningKu: string | null;
  newsWarningEn: string | null;
  newsRisk: NewsRisk;
  /** Active trading sessions (names). */
  activeSessions: string[];
  perTF: TFView[];
  updatedAt: number;
  /** Selected-TF raw indicators (debug + reasoning). */
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  ema20: number | null;
  ema50: number | null;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** Exponential moving average — last value only. */
export function emaLast(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) prev = values[i] * k + prev * (1 - k);
  return prev;
}

/** Average True Range (Wilder) over the candle series. */
export function calculateATR(candles: OHLCCandle[], period = 14): number {
  if (!candles || candles.length < period + 1) {
    // fall back to a small range estimate from whatever we have
    if (candles && candles.length >= 2) {
      const trs = [];
      for (let i = 1; i < candles.length; i++) trs.push(candles[i].high - candles[i].low);
      const avg = trs.reduce((a, b) => a + b, 0) / trs.length;
      return Number.isFinite(avg) ? avg : 0;
    }
    return 0;
  }
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) atr = (atr * (period - 1) + trs[i]) / period;
  return Number.isFinite(atr) ? atr : 0;
}

export interface TechnicalRead {
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  ema20: number | null;
  ema50: number | null;
  /** -100..100 technical score for the selected timeframe. */
  score: number;
  dir: TrendDir;
}

/** Compute RSI / MACD / EMA20 / EMA50 + a price-action score for one timeframe. */
export function analyzeTechnical(candles: OHLCCandle[], price: number): TechnicalRead {
  if (!candles || candles.length < 28) {
    return { rsi: null, macd: null, ema20: null, ema50: null, score: 0, dir: 'neutral' };
  }
  const closes = candles.map((c) => c.close);
  const cfg = candles.length >= 35 ? STANDARD_INDICATOR_SETTINGS : bestIndicatorSettings(candles.length);
  const rsi = calculateRSI(closes, cfg.rsiPeriod);
  const macd = calculateMACD(closes, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
  const ema20 = emaLast(closes, 20);
  const ema50 = emaLast(closes, 50);
  const last = candles[candles.length - 1];
  const px = price > 0 ? price : last.close;

  let score = 0;
  let weight = 0;

  // RSI: > 50 bullish tendency; <30 oversold (buy), >70 overbought (sell).
  if (rsi != null) {
    let r = clamp((rsi - 50) / 20, -1, 1);
    if (rsi < 30) r = 0.6;
    else if (rsi > 70) r = -0.6;
    score += r * 0.2;
    weight += 0.2;
  }
  // MACD line vs signal (cross) + histogram momentum.
  if (macd) {
    const cross = macd.macd > macd.signal ? 1 : macd.macd < macd.signal ? -1 : 0;
    score += cross * 0.3;
    weight += 0.3;
  }
  // EMA20 vs EMA50 trend.
  if (ema20 != null && ema50 != null) {
    score += (ema20 > ema50 ? 1 : -1) * 0.25;
    weight += 0.25;
  }
  // Price vs EMA20 (momentum / price action).
  if (ema20 != null) {
    score += (px > ema20 ? 1 : -1) * 0.15;
    weight += 0.15;
  }
  // Last candle direction.
  score += (last.close >= last.open ? 1 : -1) * 0.1;
  weight += 0.1;

  const norm = weight > 0 ? (score / weight) * 100 : 0;
  const dir: TrendDir = norm > 12 ? 'up' : norm < -12 ? 'down' : 'neutral';
  return { rsi, macd, ema20, ema50, score: Math.round(norm), dir };
}

/** Asset-specific macro overlay score (-100..100). */
export function macroScore(asset: AssetKey, macro: MacroContext): { score: number; notesKu: string[]; notesEn: string[] } {
  const notesKu: string[] = [];
  const notesEn: string[] = [];
  let score = 0;

  if (asset === 'gold') {
    if (macro.dxyChangePct != null) {
      const s = clamp(-macro.dxyChangePct * 50, -60, 60);
      score += s;
      if (Math.abs(macro.dxyChangePct) >= 0.1) {
        if (macro.dxyChangePct > 0) { notesKu.push('دۆلار بەرزبووە (زێڕ دادەبەزێت)'); notesEn.push('DXY up (gold bearish)'); }
        else { notesKu.push('دۆلار داشکاوە (زێڕ بەرزدەبێتەوە)'); notesEn.push('DXY down (gold bullish)'); }
      }
    }
    if (macro.fearGreed != null) {
      if (macro.fearGreed <= 30) { score += 25; notesKu.push('ترس لە بازاڕ (زێڕ پەناگەی پارێزراو)'); notesEn.push('Market fear (gold safe-haven bid)'); }
      else if (macro.fearGreed >= 75) { score -= 10; notesKu.push('چاوبڕکێ لە بازاڕ (پەناگە کەمتر)'); notesEn.push('Market greed (less haven demand)'); }
    }
  } else if (asset === 'btc') {
    if (macro.fearGreed != null) {
      // Crypto F&G: low = risk-off / falling, high = risk-on / rising.
      const s = clamp((macro.fearGreed - 50) * 1.2, -50, 50);
      score += s;
      if (macro.fearGreed <= 30) { notesKu.push('ترسی کریپتۆ (مەترسی دابەزین)'); notesEn.push('Crypto fear (downside risk)'); }
      else if (macro.fearGreed >= 70) { notesKu.push('چاوبڕکێی کریپتۆ (مۆمێنتم)'); notesEn.push('Crypto greed (risk-on momentum)'); }
    }
    if (macro.spxChangePct != null && Math.abs(macro.spxChangePct) >= 0.2) {
      const s = clamp(macro.spxChangePct * 30, -40, 40);
      score += s;
      if (macro.spxChangePct < 0) { notesKu.push('بۆرسەی ئەمریکا داشکاوە (BTC هاوڕێیە)'); notesEn.push('Stocks falling (BTC correlated)'); }
      else { notesKu.push('بۆرسەی ئەمریکا بەرزبووە'); notesEn.push('Stocks rising (risk-on)'); }
    }
  } else {
    // Forex pairs: DXY tilts USD-base pairs.
    if (macro.dxyChangePct != null && Math.abs(macro.dxyChangePct) >= 0.1) {
      const usdBase = asset === 'usdjpy'; // USD is the base -> DXY up = pair up
      const s = clamp((usdBase ? macro.dxyChangePct : -macro.dxyChangePct) * 30, -40, 40);
      score += s;
    }
  }
  return { score: clamp(score, -100, 100), notesKu, notesEn };
}

/** Find the nearest relevant economic event and classify the risk. */
export function assessNews(events: NewsEvent[], currencies: string[], now = Date.now()): NewsRisk {
  const relevant = events
    .map((e) => ({ e, t: Date.parse(e.date) }))
    .filter(({ e, t }) => {
      if (Number.isNaN(t)) return false;
      const imp = (e.impact || '').toLowerCase();
      if (imp !== 'high' && imp !== 'medium') return false;
      return currencies.includes(e.country) || e.country === 'All';
    })
    .filter(({ t }) => t > now - 5 * 60000 && t < now + 24 * 3600000)
    .sort((a, b) => a.t - b.t);

  const upcoming = relevant.filter(({ t }) => t >= now);
  const nearestEntry = upcoming[0] ?? null;
  if (!nearestEntry) return { nearest: null, minutesAway: null, blocking: false, warning: false };

  const minutesAway = Math.round((nearestEntry.t - now) / 60000);
  const isHigh = (nearestEntry.e.impact || '').toLowerCase() === 'high';
  const blocking = isHigh && minutesAway <= 60;
  const warning = minutesAway <= 120;
  return { nearest: nearestEntry.e, minutesAway, blocking, warning };
}

export interface BuildSignalParams {
  asset: AssetKey;
  label: string;
  decimals: number;
  /** News currencies relevant to this asset. */
  currencies: string[];
  timeframe: SignalTF;
  price: number;
  /** Candles for the selected timeframe. */
  candles: OHLCCandle[];
  /** Candles for every timeframe (for conflict detection). */
  candlesByTF: Partial<Record<SignalTF, OHLCCandle[]>>;
  macro: MacroContext;
  events: NewsEvent[];
  now?: number;
}

/** Build a complete, live multi-source trade signal for one asset + timeframe. */
export function buildAssetSignal(p: BuildSignalParams): AssetSignal {
  const now = p.now ?? Date.now();
  const tech = analyzeTechnical(p.candles, p.price);
  const macro = macroScore(p.asset, p.macro);
  const news = assessNews(p.events, p.currencies, now);
  const sessions = getSessionStatuses(new Date(now)).filter((s) => s.active).map((s) => s.name);

  const price = p.price > 0 ? p.price : p.candles.length ? p.candles[p.candles.length - 1].close : 0;

  // Per-timeframe trend (for conflict detection).
  const perTF: TFView[] = SIGNAL_TIMEFRAMES.map((tf) => {
    const c = p.candlesByTF[tf] ?? (tf === p.timeframe ? p.candles : []);
    const t = trendFromCandles(c);
    return { label: tf, dir: t.dir, rsi: t.rsi, macd: t.macd };
  });
  const upCount = perTF.filter((t) => t.dir === 'up').length;
  const downCount = perTF.filter((t) => t.dir === 'down').length;
  const conflict = upCount >= 2 && downCount >= 2;

  // Combined score: technical is the spine, macro tilts it.
  const macroWeight = p.asset === 'gold' || p.asset === 'btc' ? 0.4 : 0.25;
  const combined = Math.round(tech.score * (1 - macroWeight) + macro.score * macroWeight);

  // Confidence: scaled magnitude, boosted slightly when timeframes align.
  const alignment = Math.abs(upCount - downCount) / SIGNAL_TIMEFRAMES.length; // 0..1
  let confidence = clamp(Math.round(40 + Math.abs(combined) * 0.5 + alignment * 12), 0, 96);

  // Decide the action with the quality rules.
  let action: SignalAction = combined > 0 ? 'buy' : combined < 0 ? 'sell' : 'neutral';
  if (news.blocking) action = 'wait';
  else if (conflict) action = 'wait';
  else if (confidence < 60) action = 'neutral';

  if (action === 'wait' || action === 'neutral') confidence = Math.min(confidence, 59);

  // ATR-based risk model: SL = 1.5x ATR, TP1 = 1.5R, TP2 = 3R.
  const atr = calculateATR(p.candles);
  const slDist = atr > 0 ? atr * 1.5 : price * 0.005;
  const dirSign = action === 'buy' ? 1 : action === 'sell' ? -1 : 0;
  const entry = +price.toFixed(p.decimals);
  const stopLoss = dirSign !== 0 ? +(price - dirSign * slDist).toFixed(p.decimals) : 0;
  const takeProfit1 = dirSign !== 0 ? +(price + dirSign * slDist * 1.5).toFixed(p.decimals) : 0;
  const takeProfit2 = dirSign !== 0 ? +(price + dirSign * slDist * 3).toFixed(p.decimals) : 0;
  const riskReward = dirSign !== 0 ? 1.5 : 0;

  // Reasoning.
  const techNotesEn: string[] = [];
  const techNotesKu: string[] = [];
  if (tech.rsi != null) {
    if (tech.rsi < 30) { techNotesEn.push(`RSI ${tech.rsi.toFixed(0)} oversold`); techNotesKu.push(`RSI ${tech.rsi.toFixed(0)} (زۆر فرۆشراو)`); }
    else if (tech.rsi > 70) { techNotesEn.push(`RSI ${tech.rsi.toFixed(0)} overbought`); techNotesKu.push(`RSI ${tech.rsi.toFixed(0)} (زۆر کڕدراو)`); }
    else { techNotesEn.push(`RSI ${tech.rsi.toFixed(0)} ${tech.rsi > 50 ? 'bullish' : 'bearish'}`); techNotesKu.push(`RSI ${tech.rsi.toFixed(0)} ${tech.rsi > 50 ? 'بەرەو سەرەوە' : 'بەرەو خوارەوە'}`); }
  }
  if (tech.macd) {
    const bull = tech.macd.macd > tech.macd.signal;
    techNotesEn.push(`MACD ${bull ? 'bullish cross' : 'bearish cross'}`);
    techNotesKu.push(`MACD ${bull ? 'بڕینی بەرزبوونەوە' : 'بڕینی دابەزین'}`);
  }
  if (tech.ema20 != null && tech.ema50 != null) {
    const up = tech.ema20 > tech.ema50;
    techNotesEn.push(`EMA20 ${up ? '>' : '<'} EMA50`);
    techNotesKu.push(`EMA20 ${up ? '>' : '<'} EMA50`);
  }

  const verdictEn = action === 'buy' ? 'BUY' : action === 'sell' ? 'SELL' : action === 'wait' ? 'WAIT' : 'NEUTRAL';
  const verdictKu = action === 'buy' ? 'بکڕە' : action === 'sell' ? 'بفرۆشە' : action === 'wait' ? 'چاوەڕێبە' : 'بێلایەن';

  let reasonEn: string;
  let reasonKu: string;
  if (action === 'wait' && news.blocking) {
    reasonEn = `High-impact ${p.label} news in ~${news.minutesAway} min — price can spike. Stay flat until it passes.`;
    reasonKu = `هەواڵی گرنگ لە ماوەی ~${news.minutesAway} خولەکدا — نرخ دەتوانێت بەخێرایی بجوڵێت. تا تێپەڕبوونی چاوەڕێبە.`;
  } else if (action === 'wait' && conflict) {
    reasonEn = `Timeframes disagree (higher TFs vs lower TFs conflict). No clean edge — wait for alignment before entering.`;
    reasonKu = `کاتەکان ناکۆکن (کاتە بەرزەکان دژی نزمەکان). ئاراستە ڕوون نییە — چاوەڕێی هاوئاهەنگی بکە پێش داخڵبوون.`;
  } else if (action === 'neutral') {
    reasonEn = `${techNotesEn.slice(0, 2).join(' + ') || 'Mixed indicators'} — signal too weak (confidence under 60%). No trade.`;
    reasonKu = `${techNotesKu.slice(0, 2).join(' + ') || 'ئاماژەکان تێکەڵن'} — سیگناڵ لاوازە (متمانە کەمتر لە ٦٠٪). مامەڵە مەکە.`;
  } else {
    const macroEn = macro.notesEn.length ? ` + ${macro.notesEn[0]}` : '';
    const macroKu = macro.notesKu.length ? ` + ${macro.notesKu[0]}` : '';
    const newsEn = news.warning ? ' Watch the upcoming news event.' : ' No immediate news risk.';
    const newsKu = news.warning ? ' ئاگاداری هەواڵی نزیک بە.' : ' هیچ مەترسیی هەواڵی خێرا نییە.';
    reasonEn = `${techNotesEn.join(' + ')}${macroEn} = ${verdictEn} signal.${newsEn}`;
    reasonKu = `${techNotesKu.join(' + ')}${macroKu} = سیگناڵی ${verdictKu}.${newsKu}`;
  }

  let newsWarningEn: string | null = null;
  let newsWarningKu: string | null = null;
  if (news.warning && news.nearest) {
    const imp = (news.nearest.impact || '').toLowerCase() === 'high' ? 'High-impact' : 'Medium-impact';
    const impKu = (news.nearest.impact || '').toLowerCase() === 'high' ? 'کاریگەری بەرز' : 'کاریگەری مامناوەند';
    newsWarningEn = `${imp}: ${news.nearest.title} (${news.nearest.country}) in ~${news.minutesAway} min`;
    newsWarningKu = `${impKu}: ${news.nearest.title} (${news.nearest.country}) لە ~${news.minutesAway} خولەکدا`;
  }

  return {
    asset: p.asset,
    label: p.label,
    timeframe: p.timeframe,
    price,
    action,
    confidence,
    score: combined,
    entry,
    stopLoss,
    takeProfit1,
    takeProfit2,
    riskReward,
    atr,
    decimals: p.decimals,
    conflict,
    reasonKu,
    reasonEn,
    newsWarningKu,
    newsWarningEn,
    newsRisk: news,
    activeSessions: sessions,
    perTF,
    updatedAt: now,
    rsi: tech.rsi,
    macd: tech.macd,
    ema20: tech.ema20,
    ema50: tech.ema50,
  };
}
