// ─────────────────────────────────────────────────────────────────────────────
// signal-core.ts — FAITHFUL Deno port of src/lib/signalEngine.ts + indicators.ts
// + aiAnalysis.ts (the parts that decide BUY/SELL/WAIT).
//
// This is the SAME math the app uses. `decideFromScores` here is a line-for-line
// copy of the app's shared decision core, so the Telegram bot and the app UI
// produce identical directions, confidence and indicator values from identical
// candles. Do NOT fork this logic — keep it in sync with src/lib/signalEngine.ts.
// ─────────────────────────────────────────────────────────────────────────────

export interface OHLCCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TrendDir = "up" | "down" | "neutral";
export type SignalAction = "buy" | "sell" | "wait" | "neutral";
export type AssetKey =
  | "gold"
  | "silver"
  | "btc"
  | "eth"
  | "sol"
  | "xrp"
  | "bnb"
  | "eurusd"
  | "gbpusd"
  | "usdjpy";

// Metals share gold's macro model (DXY + safe-haven). Crypto coins share BTC's
// macro model (Fear&Greed + S&P correlation). Forex pairs use the USD/DXY model.
const METAL_ASSETS: AssetKey[] = ["gold", "silver"];
const CRYPTO_ASSETS: AssetKey[] = ["btc", "eth", "sol", "xrp", "bnb"];

export const SIGNAL_TIMEFRAMES = ["M5", "M15", "M30", "H1", "H4", "D1"] as const;
export type SignalTF = (typeof SIGNAL_TIMEFRAMES)[number];

export interface MacroContext {
  dxyChangePct: number | null;
  fearGreed: number | null;
  spxChangePct: number | null;
  vix: number | null;
  us10y: number | null;
  us10yChangePct: number | null;
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
  nearest: NewsEvent | null;
  minutesAway: number | null;
  blocking: boolean;
  warning: boolean;
}

export interface TFView {
  label: string;
  dir: TrendDir;
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
}

// ───────────────────── indicators (port of indicators.ts) ─────────────────────
export interface IndicatorSettings {
  rsiPeriod: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
}

export const STANDARD_INDICATOR_SETTINGS: IndicatorSettings = {
  rsiPeriod: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
};

export function bestIndicatorSettings(candleCount: number): IndicatorSettings {
  if (candleCount >= 35) return STANDARD_INDICATOR_SETTINGS;
  if (candleCount >= 26) return { rsiPeriod: 14, macdFast: 8, macdSlow: 21, macdSignal: 5 };
  if (candleCount >= 18) return { rsiPeriod: 14, macdFast: 5, macdSlow: 13, macdSignal: 5 };
  if (candleCount >= 11) return { rsiPeriod: 7, macdFast: 3, macdSlow: 8, macdSignal: 3 };
  return { rsiPeriod: Math.max(2, Math.min(7, candleCount - 1)), macdFast: 3, macdSlow: 8, macdSignal: 3 };
}

function emaSeries(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

export function emaLast(values: number[], period: number): number | null {
  const series = emaSeries(values, period);
  return series.length ? series[series.length - 1] : null;
}

export function calculateRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0 && avgGain === 0) return 50;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calculateMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < slow + signalPeriod - 1) return null;
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  const offset = fastEma.length - slowEma.length;
  const macdLine: number[] = [];
  for (let i = 0; i < slowEma.length; i++) {
    macdLine.push(fastEma[i + offset] - slowEma[i]);
  }
  const signalSeries = emaSeries(macdLine, signalPeriod);
  if (!signalSeries.length) return null;
  const macd = macdLine[macdLine.length - 1];
  const signal = signalSeries[signalSeries.length - 1];
  return { macd, signal, histogram: macd - signal };
}

// ───────────────────── helpers (port of aiAnalysis.ts) ─────────────────────
export function aggregateCandles(candles: OHLCCandle[], factor: number): OHLCCandle[] {
  if (factor <= 1) return candles;
  const out: OHLCCandle[] = [];
  for (let i = 0; i + factor <= candles.length; i += factor) {
    const group = candles.slice(i, i + factor);
    out.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((a, c) => a + (c.volume || 0), 0),
    });
  }
  return out;
}

export interface TFTrend {
  label: string;
  dir: TrendDir;
  score: number;
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  candleCount: number;
  agreement: "strong" | "mixed" | "none";
}

export function trendFromCandles(candles: OHLCCandle[]): TFTrend {
  const candleCount = candles?.length ?? 0;
  if (!candles || candleCount < 28) {
    return { label: "", dir: "neutral", score: 0, rsi: null, macd: null, candleCount, agreement: "none" };
  }
  const closes = candles.map((c) => c.close);
  const cfg = candleCount >= 35 ? STANDARD_INDICATOR_SETTINGS : bestIndicatorSettings(candleCount);
  const rsi = calculateRSI(closes, cfg.rsiPeriod);
  const macd = calculateMACD(closes, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);

  const rsiBull = rsi != null ? rsi > 50 : null;
  const macdBull = macd != null ? macd.macd > macd.signal : null;

  let dir: TrendDir = "neutral";
  let agreement: "strong" | "mixed" | "none" = "none";
  let score = 0;

  if (rsiBull != null && macdBull != null) {
    if (rsiBull && macdBull) {
      dir = "up";
      agreement = "strong";
      score = 100;
    } else if (!rsiBull && !macdBull) {
      dir = "down";
      agreement = "strong";
      score = -100;
    } else {
      dir = "neutral";
      agreement = "mixed";
      score = 0;
    }
  } else if (rsiBull != null) {
    dir = rsiBull ? "up" : "down";
    agreement = "mixed";
    score = rsiBull ? 50 : -50;
  } else if (macdBull != null) {
    dir = macdBull ? "up" : "down";
    agreement = "mixed";
    score = macdBull ? 50 : -50;
  }

  return { label: "", dir, score, rsi, macd, candleCount, agreement };
}

// ───────────────────── engine (port of signalEngine.ts) ─────────────────────
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function calculateATR(candles: OHLCCandle[], period = 14): number {
  if (!candles || candles.length < period + 1) {
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
  score: number;
  dir: TrendDir;
}

export function analyzeTechnical(candles: OHLCCandle[], price: number): TechnicalRead {
  if (!candles || candles.length < 28) {
    return { rsi: null, macd: null, ema20: null, ema50: null, score: 0, dir: "neutral" };
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

  if (rsi != null) {
    let r = clamp((rsi - 50) / 20, -1, 1);
    if (rsi < 30) r = 0.6;
    else if (rsi > 70) r = -0.6;
    score += r * 0.2;
    weight += 0.2;
  }
  if (macd) {
    const cross = macd.macd > macd.signal ? 1 : macd.macd < macd.signal ? -1 : 0;
    score += cross * 0.3;
    weight += 0.3;
  }
  if (ema20 != null && ema50 != null) {
    score += (ema20 > ema50 ? 1 : -1) * 0.25;
    weight += 0.25;
  }
  if (ema20 != null) {
    score += (px > ema20 ? 1 : -1) * 0.15;
    weight += 0.15;
  }
  score += (last.close >= last.open ? 1 : -1) * 0.1;
  weight += 0.1;

  const norm = weight > 0 ? (score / weight) * 100 : 0;
  const dir: TrendDir = norm > 12 ? "up" : norm < -12 ? "down" : "neutral";
  return { rsi, macd, ema20, ema50, score: Math.round(norm), dir };
}

export function macroScore(
  asset: AssetKey,
  macro: MacroContext,
): { score: number; notesKu: string[]; notesEn: string[] } {
  const notesKu: string[] = [];
  const notesEn: string[] = [];
  let score = 0;

  if (METAL_ASSETS.includes(asset)) {
    if (macro.dxyChangePct != null) {
      const s = clamp(-macro.dxyChangePct * 50, -60, 60);
      score += s;
      if (Math.abs(macro.dxyChangePct) >= 0.1) {
        if (macro.dxyChangePct > 0) {
          notesKu.push("دۆلار بەرزبووە (کانزا دادەبەزێت)");
          notesEn.push("DXY up (metals bearish)");
        } else {
          notesKu.push("دۆلار داشکاوە (کانزا بەرزدەبێتەوە)");
          notesEn.push("DXY down (metals bullish)");
        }
      }
    }
    if (macro.fearGreed != null) {
      if (macro.fearGreed <= 30) {
        score += 25;
        notesKu.push("ترس لە بازاڕ (کانزا پەناگەی پارێزراو)");
        notesEn.push("Market fear (metals safe-haven bid)");
      } else if (macro.fearGreed >= 75) {
        score -= 10;
        notesKu.push("چاوبڕکێ لە بازاڕ (پەناگە کەمتر)");
        notesEn.push("Market greed (less haven demand)");
      }
    }
  } else if (CRYPTO_ASSETS.includes(asset)) {
    if (macro.fearGreed != null) {
      const s = clamp((macro.fearGreed - 50) * 1.2, -50, 50);
      score += s;
      if (macro.fearGreed <= 30) {
        notesKu.push("ترسی کریپتۆ (مەترسی دابەزین)");
        notesEn.push("Crypto fear (downside risk)");
      } else if (macro.fearGreed >= 70) {
        notesKu.push("چاوبڕکێی کریپتۆ (مۆمێنتم)");
        notesEn.push("Crypto greed (risk-on momentum)");
      }
    }
    if (macro.spxChangePct != null && Math.abs(macro.spxChangePct) >= 0.2) {
      const s = clamp(macro.spxChangePct * 30, -40, 40);
      score += s;
      if (macro.spxChangePct < 0) {
        notesKu.push("بۆرسەی ئەمریکا داشکاوە (BTC هاوڕێیە)");
        notesEn.push("Stocks falling (BTC correlated)");
      } else {
        notesKu.push("بۆرسەی ئەمریکا بەرزبووە");
        notesEn.push("Stocks rising (risk-on)");
      }
    }
  } else {
    if (macro.dxyChangePct != null && Math.abs(macro.dxyChangePct) >= 0.1) {
      const usdBase = asset === "usdjpy";
      const s = clamp((usdBase ? macro.dxyChangePct : -macro.dxyChangePct) * 30, -40, 40);
      score += s;
    }
  }
  return { score: clamp(score, -100, 100), notesKu, notesEn };
}

export function assessNews(events: NewsEvent[], currencies: string[], now = Date.now()): NewsRisk {
  const relevant = events
    .map((e) => ({ e, t: Date.parse(e.date) }))
    .filter(({ e, t }) => {
      if (Number.isNaN(t)) return false;
      const imp = (e.impact || "").toLowerCase();
      if (imp !== "high" && imp !== "medium") return false;
      return currencies.includes(e.country) || e.country === "All";
    })
    .filter(({ t }) => t > now - 5 * 60000 && t < now + 24 * 3600000)
    .sort((a, b) => a.t - b.t);

  const upcoming = relevant.filter(({ t }) => t >= now);
  const nearestEntry = upcoming[0] ?? null;
  if (!nearestEntry) return { nearest: null, minutesAway: null, blocking: false, warning: false };

  const minutesAway = Math.round((nearestEntry.t - now) / 60000);
  const isHigh = (nearestEntry.e.impact || "").toLowerCase() === "high";
  const blocking = isHigh && minutesAway <= 60;
  const warning = minutesAway <= 120;
  return { nearest: nearestEntry.e, minutesAway, blocking, warning };
}

export interface ConfluenceDecision {
  combined: number;
  combinedBefore: number;
  confidence: number;
  action: SignalAction;
  confluenceAlignment: "aligned" | "conflicting" | "neutral";
  confScore: number;
  confDir: TrendDir;
  damp: number;
  conflict: boolean;
}

/**
 * THE single source of truth for BUY/SELL/WAIT — identical to the app.
 */
export function decideFromScores(
  techScore: number,
  macroScoreVal: number,
  macroWeight: number,
  perTF: TFView[],
  newsBlocking: boolean,
): ConfluenceDecision {
  const upCount = perTF.filter((t) => t.dir === "up").length;
  const downCount = perTF.filter((t) => t.dir === "down").length;
  const conflict = upCount >= 2 && downCount >= 2;

  let combined = Math.round(techScore * (1 - macroWeight) + macroScoreVal * macroWeight);

  // ── Higher-TF confluence filter ──
  const PEN_MAX = 0.5;
  const CONF_MAJORITY = 50;
  const confTotal = perTF.length || 1;
  const confDominant = Math.max(upCount, downCount);
  const confScore = Math.round((confDominant / confTotal) * 100);
  const confDir: TrendDir = upCount > downCount ? "up" : downCount > upCount ? "down" : "neutral";
  const signalDir: TrendDir = combined > 0 ? "up" : combined < 0 ? "down" : "neutral";

  const combinedBefore = combined;
  let damp = 1;
  const opposed =
    signalDir !== "neutral" && confDir !== "neutral" && confDir !== signalDir && confScore >= CONF_MAJORITY;
  if (opposed) {
    const opposition = (confScore - CONF_MAJORITY) / (100 - CONF_MAJORITY);
    damp = 1 - PEN_MAX * opposition;
    combined = Math.round(combined * damp);
  }

  const alignment = Math.abs(upCount - downCount) / (perTF.length || 1);
  let confidence = clamp(Math.round(40 + Math.abs(combined) * 0.5 + alignment * 12), 0, 96);

  let action: SignalAction = combined > 0 ? "buy" : combined < 0 ? "sell" : "neutral";
  if (newsBlocking) action = "wait";
  else if (conflict) action = "wait";
  else if (confidence < 60) action = "neutral";

  if (action === "wait" || action === "neutral") confidence = Math.min(confidence, 59);

  const confluenceAlignment: "aligned" | "conflicting" | "neutral" =
    (action === "buy" || action === "sell") && confDir !== "neutral" && confScore >= CONF_MAJORITY
      ? confDir === (action === "buy" ? "up" : "down")
        ? "aligned"
        : "conflicting"
      : "neutral";

  return { combined, combinedBefore, confidence, action, confluenceAlignment, confScore, confDir, damp, conflict };
}

export interface EngineSignal {
  action: SignalAction;
  confidence: number;
  score: number;
  price: number;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
  atr: number;
  rsi: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  ema20: number | null;
  ema50: number | null;
  confluenceAlignment: "aligned" | "conflicting" | "neutral";
  confScore: number;
  confDir: TrendDir;
  conflict: boolean;
  perTF: TFView[];
}

/** True when any two adjacent timeframes (M5→D1 ladder) disagree in direction. */
export function hasAdjacentConflict(perTF: TFView[]): boolean {
  for (let i = 0; i < perTF.length - 1; i++) {
    const a = perTF[i].dir;
    const b = perTF[i + 1].dir;
    if ((a === "up" && b === "down") || (a === "down" && b === "up")) return true;
  }
  return false;
}

export interface GoldGateResult {
  action: SignalAction;
  confidence: number;
  adjConflict: boolean;
}

/**
 * GOLD-only signal-quality gates — mirrors applyGoldGates in the app engine.
 *   1. RSI > 70 downgrades a fresh BUY, RSI < 30 downgrades a fresh SELL (−15).
 *   2. Any two adjacent timeframes disagreeing caps confidence < 60 (forces WAIT).
 */
export function applyGoldGates(
  action: SignalAction,
  confidence: number,
  rsi: number | null,
  perTF: TFView[],
): GoldGateResult {
  let a = action;
  let c = confidence;

  if (rsi != null) {
    if (a === "buy" && rsi > 70) c -= 15;
    else if (a === "sell" && rsi < 30) c -= 15;
  }

  const adjConflict = hasAdjacentConflict(perTF);
  if (adjConflict) c = Math.min(c, 59);

  c = clamp(c, 0, 96);

  if ((a === "buy" || a === "sell") && c < 60) {
    a = adjConflict ? "wait" : "neutral";
  }
  if (a === "wait" || a === "neutral") c = Math.min(c, 59);

  return { action: a, confidence: c, adjConflict };
}

/** Multi-source signal (gold / btc) — mirrors buildAssetSignal in the app. */
export function buildAssetSignal(p: {
  asset: AssetKey;
  decimals: number;
  currencies: string[];
  timeframe: SignalTF;
  price: number;
  candles: OHLCCandle[];
  candlesByTF: Partial<Record<SignalTF, OHLCCandle[]>>;
  macro: MacroContext;
  events: NewsEvent[];
  now?: number;
}): EngineSignal {
  const now = p.now ?? Date.now();
  const tech = analyzeTechnical(p.candles, p.price);
  const macro = macroScore(p.asset, p.macro);
  const news = assessNews(p.events, p.currencies, now);

  const price = p.price > 0 ? p.price : p.candles.length ? p.candles[p.candles.length - 1].close : 0;

  const perTF: TFView[] = SIGNAL_TIMEFRAMES.map((tf) => {
    const c = p.candlesByTF[tf] ?? (tf === p.timeframe ? p.candles : []);
    const t = trendFromCandles(c);
    return { label: tf, dir: t.dir, rsi: t.rsi, macd: t.macd };
  });

  const macroWeight =
    METAL_ASSETS.includes(p.asset) || CRYPTO_ASSETS.includes(p.asset) ? 0.4 : 0.25;
  const d = decideFromScores(tech.score, macro.score, macroWeight, perTF, news.blocking);

  const atr = calculateATR(p.candles);
  const slDist = atr > 0 ? atr * 1.5 : price * 0.005;
  const dirSign = d.action === "buy" ? 1 : d.action === "sell" ? -1 : 0;
  const entry = +price.toFixed(p.decimals);
  const stopLoss = dirSign !== 0 ? +(price - dirSign * slDist).toFixed(p.decimals) : 0;
  const takeProfit1 = dirSign !== 0 ? +(price + dirSign * slDist * 1.5).toFixed(p.decimals) : 0;
  const takeProfit2 = dirSign !== 0 ? +(price + dirSign * slDist * 3).toFixed(p.decimals) : 0;
  const riskReward = dirSign !== 0 ? 1.5 : 0;

  return {
    action: d.action,
    confidence: d.confidence,
    score: d.combined,
    price,
    entry,
    stopLoss,
    takeProfit1,
    takeProfit2,
    riskReward,
    atr,
    rsi: tech.rsi,
    macd: tech.macd,
    ema20: tech.ema20,
    ema50: tech.ema50,
    confluenceAlignment: d.confluenceAlignment,
    confScore: d.confScore,
    confDir: d.confDir,
    conflict: d.conflict,
    perTF,
  };
}

/** Single-series signal (oil / anything without a dedicated feed). */
export function buildLocalSignal(candles: OHLCCandle[], price: number, decimals: number): EngineSignal {
  const tech = analyzeTechnical(candles, price);
  const px = price > 0 ? price : candles.length ? candles[candles.length - 1].close : 0;

  const FACTORS = [1, 2, 4, 8, 12];
  const perTF: TFView[] = [];
  for (const f of FACTORS) {
    const agg = aggregateCandles(candles, f);
    if (agg.length < 28) continue;
    const t = trendFromCandles(agg);
    perTF.push({ label: `x${f}`, dir: t.dir, rsi: t.rsi, macd: t.macd });
  }
  if (perTF.length === 0) {
    const t = trendFromCandles(candles);
    perTF.push({ label: "base", dir: t.dir, rsi: t.rsi, macd: t.macd });
  }

  const d = decideFromScores(tech.score, 0, 0, perTF, false);

  const atr = calculateATR(candles);
  const slDist = atr > 0 ? atr * 1.5 : px * 0.005;
  const dirSign = d.action === "buy" ? 1 : d.action === "sell" ? -1 : 0;
  const entry = +px.toFixed(decimals);
  const stopLoss = dirSign !== 0 ? +(px - dirSign * slDist).toFixed(decimals) : 0;
  const takeProfit1 = dirSign !== 0 ? +(px + dirSign * slDist * 1.5).toFixed(decimals) : 0;
  const takeProfit2 = dirSign !== 0 ? +(px + dirSign * slDist * 3).toFixed(decimals) : 0;
  const riskReward = dirSign !== 0 ? 1.5 : 0;

  return {
    action: d.action,
    confidence: d.confidence,
    score: d.combined,
    price: px,
    entry,
    stopLoss,
    takeProfit1,
    takeProfit2,
    riskReward,
    atr,
    rsi: tech.rsi,
    macd: tech.macd,
    ema20: tech.ema20,
    ema50: tech.ema50,
    confluenceAlignment: d.confluenceAlignment,
    confScore: d.confScore,
    confDir: d.confDir,
    conflict: d.conflict,
    perTF,
  };
}
