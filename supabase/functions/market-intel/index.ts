import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { passesNewsQualityGate } from "./news-quality.ts";
import {
  buildAssetSignal,
  buildLocalSignal,
  EngineSignal,
} from "./signal-core.ts";
import {
  fetchGoldAllTF,
  fetchBtcAllTF,
  fetchOilAllTF,
  fetchMacro as fetchEngineMacro,
  fetchEvents as fetchEngineEvents,
} from "./signal-data.ts";

// ───────────────────── config ─────────────────────
const TELEGRAM_GATEWAY = "https://connector-gateway.lovable.dev/telegram";
const ADMIN_CHAT_ID = "144068979";
// Public channel the bot posts reports/signals/news/calendar into.
// Bot must be an admin of @goldmarketai (numeric id -1004481319450).
const CHANNEL_CHAT_ID = "@goldmarketai";
// Where reports get delivered (admin DM + public channel).
const TARGET_CHAT_IDS = [ADMIN_CHAT_ID, CHANNEL_CHAT_ID];

// Price-move thresholds that trigger a Telegram alert.
const GOLD_THRESHOLD = 2;     // $2
const OIL_THRESHOLD = 1;      // $1
const BTC_THRESHOLD = 200;    // $200

// Within how many minutes a high-impact event triggers the first heads-up alert.
const EVENT_ALERT_MIN = 30;
// Final "5 minutes left" reminder window before a high-impact event releases.
const EVENT_REMINDER_MIN = 5;

// Anti-spam: only open a NEW signal when the day's move is clearly strong
// (|change| >= this %) AND not within the cooldown window of the last signal
// for that symbol. Quiet markets → no repeated signals.
const SIGNAL_MIN_MOVE_PCT = 0.25;        // ignore weak/flat moves
const SIGNAL_COOLDOWN_MS = 20 * 60_000;  // 20 min between signals per symbol

// Target broadcast pacing: a "very important" target (high confidence / strong
// move / news-driven) is sent immediately. Otherwise targets are throttled so we
// broadcast at most one ordinary target every TARGET_MIN_GAP_MS (15–30 min band).
const TARGET_MIN_GAP_MS = 18 * 60_000;   // ~18 min between ordinary targets (15–30 range)
const TARGET_IMPORTANT_CONFIDENCE = 85;  // confidence ≥ this ⇒ send target now
const TARGET_IMPORTANT_MOVE_PCT = 0.6;   // |change| ≥ this % ⇒ send target now

// Internal price-scan loop: check prices every PRICE_INTERVAL_MS for up to
// LOOP_WINDOW_MS, so the engine reacts ~every 5s while the cron fires once a
// minute. News + calendar are checked once per invocation (≈60s cadence).
const PRICE_INTERVAL_MS = 5_000;
const LOOP_WINDOW_MS = 50_000;

// Multi-timeframe signal cascade. When a NEW signal opens we post the setup
// immediately, then auto-re-post the SAME trade on a staggered schedule so users
// who join late still see it. Every message uses the IDENTICAL ATR-based
// entry/SL/TP from the shared engine (byte-for-byte equal to the app) — the only
// thing that changes per row is the send time and the confirmation label.
// Delays are measured from the moment the first signal is sent.
const TIMEFRAME_CASCADE: { tf: string; delayMs: number }[] = [
  { tf: "5M",  delayMs: 0 },
  { tf: "15M", delayMs: 5 * 60_000 },
  { tf: "30M", delayMs: 15 * 60_000 },
  { tf: "1H",  delayMs: 30 * 60_000 },
];

// How long each timeframe's candle/period runs. Once a leg has been live for its
// full period (and it never hit TP/SL) the bot reports a "period closed" result
// (pips won/lost vs entry) and closes that leg — so EVERY signal that goes out is
// always followed by its own outcome message, before any new signal is sent.
const TF_PERIOD_MS: Record<string, number> = {
  "5M": 5 * 60_000,
  "15M": 15 * 60_000,
  "30M": 30 * 60_000,
  "1H": 60 * 60_000,
};



// News is broadcast at most once per 60 minutes (its own standalone message).
const NEWS_MIN_GAP_MS = 60 * 60_000;

const CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ───────────────────── helpers ─────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type Signal = "BUY" | "SELL" | "HOLD";
// Rich color indicators: 🟢 BUY · 🔴 SELL · 🟡 HOLD (with extra colored squares for emphasis).
const sigEmoji = (s: Signal) => (s === "BUY" ? "🟢" : s === "SELL" ? "🔴" : "🟡");
const sigBadge = (s: Signal) => (s === "BUY" ? "🟢🟩" : s === "SELL" ? "🔴🟥" : "🟡🟧");
const sigKu = (s: Signal) => (s === "BUY" ? "کڕین" : s === "SELL" ? "فرۆشتن" : "هەڵگرتن");
// Colored dot for % change: green up / red down / yellow flat.
const changeDot = (pct: number) => (pct > 0 ? "🟢" : pct < 0 ? "🔴" : "🟡");

interface Quote {
  symbol: string;
  price: number;
  changePct: number;
  /** Real analysis from the SAME engine the app uses (null if candles unavailable). */
  eng?: EngineSignal | null;
}

// Map the engine's action → the bot's BUY/SELL/HOLD signal. WAIT/NEUTRAL → HOLD
// (no trade). This is the ONLY place a direction is derived for the bot, and it
// comes straight from `decideFromScores` via the shared engine — never from the
// raw daily % change anymore.
function quoteSignal(q: Quote): Signal {
  const a = q.eng?.action;
  if (a === "buy") return "BUY";
  if (a === "sell") return "SELL";
  // No engine data yet → conservative fallback on the day's move (rare).
  if (!q.eng) {
    if (q.changePct >= 0.15) return "BUY";
    if (q.changePct <= -0.15) return "SELL";
  }
  return "HOLD";
}

// Engine confidence for a quote (0..100). Falls back to a move-based estimate
// only when the engine produced no result (no candles).
function quoteConfidence(q: Quote): number {
  if (q.eng) return q.eng.confidence;
  return Math.min(95, 60 + Math.round(Math.abs(q.changePct) * 10));
}

// ATR-based entry / stop-loss / take-profit straight from the shared engine —
// byte-for-byte identical to the app (entry = last-candle close, SL = 1.5×ATR,
// TP1 = 1.5R, TP2 = 3R). The percentage fallback runs ONLY when the engine
// produced no candle data, which for an actionable BUY/SELL is rare.
function quoteLevels(q: Quote, sig: "BUY" | "SELL"): { entry: number; tp: number; sl: number; tp2: number } {
  const e = q.eng;
  if (e && e.entry > 0 && e.stopLoss > 0 && e.takeProfit1 > 0) {
    return { entry: e.entry, tp: e.takeProfit1, sl: e.stopLoss, tp2: e.takeProfit2 };
  }
  const m = ASSET_META[q.symbol];
  const isBuy = sig === "BUY";
  const entry = q.price;
  const tp = +(entry * (isBuy ? 1 + m.tpPct / 100 : 1 - m.tpPct / 100)).toFixed(2);
  const sl = +(entry * (isBuy ? 1 - m.slPct / 100 : 1 + m.slPct / 100)).toFixed(2);
  const tp2 = +(entry * (isBuy ? 1 + (m.tpPct * 2) / 100 : 1 - (m.tpPct * 2) / 100)).toFixed(2);
  return { entry, tp, sl, tp2 };
}

// ATR-based levels for a GIVEN direction. Used by news-event gold targets that
// derive their direction from the data surprise (not the technical engine) but
// must still use the SAME 1.5×ATR / 1.5R risk model as the rest of the platform.
// Entry is the live reaction price; SL/TP distances come from the engine's ATR.
// Falls back to the percentage model only when no ATR is available.
function levelsForDir(
  symbol: string, price: number, dir: "BUY" | "SELL", atr: number | null,
): { entry: number; tp: number; sl: number } {
  const m = ASSET_META[symbol];
  const decimals = symbol === "BTC/USD" ? 0 : 2;
  const isBuy = dir === "BUY";
  const dirSign = isBuy ? 1 : -1;
  if (atr && atr > 0) {
    const slDist = atr * 1.5;
    return {
      entry: +price.toFixed(decimals),
      sl: +(price - dirSign * slDist).toFixed(decimals),
      tp: +(price + dirSign * slDist * 1.5).toFixed(decimals),
    };
  }
  const tp = +(price * (isBuy ? 1 + m.tpPct / 100 : 1 - m.tpPct / 100)).toFixed(2);
  const sl = +(price * (isBuy ? 1 - m.slPct / 100 : 1 + m.slPct / 100)).toFixed(2);
  return { entry: +price.toFixed(2), tp, sl };
}

// ───────────────────── price sources ─────────────────────
async function fetchGold(): Promise<Quote | null> {
  try {
    const res = await fetch("https://api.gold-api.com/price/XAU", {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { await res.text(); return null; }
    const d = await res.json();
    const price = Number(d?.price);
    if (!Number.isFinite(price) || price <= 0) return null;
    return { symbol: "XAU/USD", price: +price.toFixed(2), changePct: 0 };
  } catch { return null; }
}

async function fetchBtc(): Promise<Quote | null> {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { await res.text(); return null; }
    const d = await res.json();
    const price = Number(d?.lastPrice);
    if (!Number.isFinite(price) || price <= 0) return null;
    return { symbol: "BTC/USD", price: +price.toFixed(2), changePct: Number(d?.priceChangePercent) || 0 };
  } catch { return null; }
}

async function fetchOil(): Promise<Quote | null> {
  // Free Yahoo Finance feed for WTI crude (CL=F) — price + % change vs prev close.
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/CL=F?interval=1d&range=1d",
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) { await res.text(); return null; }
    const d = await res.json();
    const m = d?.chart?.result?.[0]?.meta;
    const price = Number(m?.regularMarketPrice);
    const prev = Number(m?.chartPreviousClose ?? m?.previousClose);
    if (!Number.isFinite(price) || price <= 0) return null;
    const changePct = Number.isFinite(prev) && prev > 0 ? +(((price - prev) / prev) * 100).toFixed(2) : 0;
    return { symbol: "WTI/USD", price: +price.toFixed(2), changePct };
  } catch { return null; }
}

// Track an intraday open so gold gets a real % change (gold-api gives only spot).
const dayOpen: Record<string, { day: string; open: number }> = {};
function applyChange(q: Quote): Quote {
  const day = new Date().toISOString().slice(0, 10);
  const s = dayOpen[q.symbol];
  if (!s || s.day !== day) {
    dayOpen[q.symbol] = { day, open: q.price };
    return q;
  }
  if (!q.changePct && s.open > 0) {
    q.changePct = +(((q.price - s.open) / s.open) * 100).toFixed(2);
  }
  return q;
}

// ───────────────────── engine analysis (same core as the app) ─────────────────────
// The full multi-timeframe engine is expensive (6 TF fetches + macro + events per
// asset), so we cache its result per symbol and recompute at most once per minute —
// matching the cron cadence and keeping the bot's signal in lock-step with the app
// (the app refreshes every 5 min; a 60s bot cache is always at least as fresh).
const ENGINE_TTL_MS = 60_000;
const engineCache: Record<string, { ts: number; sig: EngineSignal | null }> = {};

const GOLD_CURRENCIES = ["USD", "EUR", "CHF", "GBP", "JPY"];

async function computeEngine(symbol: string, livePrice: number): Promise<EngineSignal | null> {
  try {
    if (symbol === "XAU/USD") {
      const [byTF, macro, events] = await Promise.all([fetchGoldAllTF(), fetchEngineMacro(), fetchEngineEvents()]);
      const base = byTF.M15 ?? [];
      const price = base.length ? base[base.length - 1].close : livePrice;
      if (!base.length) return null;
      return buildAssetSignal({
        asset: "gold", decimals: 2, currencies: GOLD_CURRENCIES, timeframe: "M15",
        price, candles: base, candlesByTF: byTF, macro, events,
      });
    }
    if (symbol === "BTC/USD") {
      const [byTF, macro, events] = await Promise.all([fetchBtcAllTF(), fetchEngineMacro(), fetchEngineEvents()]);
      const base = byTF.M15 ?? [];
      const price = base.length ? base[base.length - 1].close : livePrice;
      if (!base.length) return null;
      return buildAssetSignal({
        asset: "btc", decimals: 0, currencies: ["USD"], timeframe: "M15",
        price, candles: base, candlesByTF: byTF, macro, events,
      });
    }
    if (symbol === "WTI/USD") {
      const series = await fetchOilAllTF();
      if (!series.length) return null;
      const price = series[series.length - 1].close;
      return buildLocalSignal(series, price, 2);
    }
  } catch (e) {
    console.error("computeEngine error", symbol, String(e));
  }
  return null;
}

async function getEngine(symbol: string, livePrice: number): Promise<EngineSignal | null> {
  const c = engineCache[symbol];
  if (c && Date.now() - c.ts < ENGINE_TTL_MS) return c.sig;
  const sig = await computeEngine(symbol, livePrice);
  // Keep the previous good analysis if a transient fetch failed (never regress to fabricated values).
  if (sig === null && c?.sig) return c.sig;
  engineCache[symbol] = { ts: Date.now(), sig };
  return sig;
}

async function getPrices(): Promise<Quote[]> {
  const [gold, oil, btc] = await Promise.all([fetchGold(), fetchOil(), fetchBtc()]);
  const quotes = [gold, oil, btc].filter((q): q is Quote => !!q).map(applyChange);
  // Attach the engine analysis (cached) so every consumer uses identical, real numbers.
  await Promise.all(
    quotes.map(async (q) => {
      q.eng = await getEngine(q.symbol, q.price);
    }),
  );
  return quotes;
}

// ───────────────────── economic calendar ─────────────────────
interface CalEvent { key: string; title: string; currency: string; impact: string; time: number; forecast: string; previous: string; actual: string; }

async function getHighImpactEvents(): Promise<CalEvent[]> {
  try {
    const res = await fetch(CALENDAR_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) { await res.text(); return []; }
    const data = await res.json();
    const out: CalEvent[] = [];
    for (const e of Array.isArray(data) ? data : []) {
      const impact = String(e.impact ?? "").toLowerCase();
      if (impact !== "high") continue;
      const t = e.date ? new Date(e.date).getTime() : NaN;
      if (!Number.isFinite(t)) continue;
      out.push({
        key: `${e.title}|${e.country}|${e.date}`,
        title: String(e.title ?? "Event"),
        currency: String(e.country ?? ""),
        impact: "HIGH",
        time: t,
        forecast: String(e.forecast ?? ""),
        previous: String(e.previous ?? ""),
        actual: String(e.actual ?? ""),
      });
    }
    return out;
  } catch { return []; }
}

// Parse a calendar figure like "3.2%", "215K", "-0.1", "1.2M" into a number.
function parseFigure(s: string): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let n = parseFloat(m[0]);
  if (/k/i.test(s)) n *= 1_000;
  else if (/m/i.test(s)) n *= 1_000_000;
  else if (/b/i.test(s)) n *= 1_000_000_000;
  return Number.isFinite(n) ? n : null;
}

// Indicators where a HIGHER actual is BAD for the currency (invert the surprise).
const INVERSE_RE = /(unemployment|jobless|claims|inflation expectation|deficit|misery)/i;

// Decide gold direction from a USD data surprise.
// Strong USD data → USD up → Gold down (SELL). Weak USD data → Gold up (BUY).
function goldFromUsdSurprise(title: string, actual: number, forecast: number): {
  dir: "BUY" | "SELL" | "HOLD"; usd: "stronger" | "weaker" | "in-line";
} {
  if (actual === forecast) return { dir: "HOLD", usd: "in-line" };
  let usdStrong = actual > forecast;          // higher number usually = stronger USD
  if (INVERSE_RE.test(title)) usdStrong = !usdStrong; // unemployment/claims: higher = weaker
  return usdStrong ? { dir: "SELL", usd: "stronger" } : { dir: "BUY", usd: "weaker" };
}


// ───────────────────── alert state (dedupe) ─────────────────────
async function getState(key: string): Promise<Record<string, unknown>> {
  const { data } = await admin.from("market_alert_state").select("value").eq("key", key).maybeSingle();
  return (data?.value as Record<string, unknown>) ?? {};
}
async function setState(key: string, value: Record<string, unknown>) {
  await admin.from("market_alert_state").upsert({ key, value, updated_at: new Date().toISOString() });
}

// ───────────────────── content dedupe (sent_news_log) ─────────────────────
// Stable content hash (djb2) of the normalized text — used to detect when the
// EXACT same content was already posted recently so we never spam duplicates.
function contentHash(s: string): string {
  const norm = s.toLowerCase().replace(/\s+/g, " ").trim();
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

// True if the same content hash was sent within the given window (ms).
async function wasRecentlySent(hash: string, withinMs: number): Promise<boolean> {
  const since = new Date(Date.now() - withinMs).toISOString();
  const { data } = await admin
    .from("sent_news_log")
    .select("id")
    .eq("content_hash", hash)
    .gte("sent_at", since)
    .limit(1)
    .maybeSingle();
  return !!data;
}

// True if ANY news for this asset was sent within the window (per-asset rate limit).
async function wasAssetNewsSentWithin(asset: string, withinMs: number): Promise<boolean> {
  const since = new Date(Date.now() - withinMs).toISOString();
  const { data } = await admin
    .from("sent_news_log")
    .select("id")
    .eq("kind", "news")
    .eq("asset", asset)
    .gte("sent_at", since)
    .limit(1)
    .maybeSingle();
  return !!data;
}

// True if the SAME asset + event topic was already covered within the window —
// catches differently-worded headlines about the same story (e.g. the Iran deal).
async function wasAssetEventSentWithin(asset: string, event: string, withinMs: number): Promise<boolean> {
  if (!event) return false;
  const since = new Date(Date.now() - withinMs).toISOString();
  const { data } = await admin
    .from("sent_news_log")
    .select("id")
    .eq("kind", "news")
    .eq("asset", asset)
    .eq("event_keyword", event)
    .gte("sent_at", since)
    .limit(1)
    .maybeSingle();
  return !!data;
}

// Record that a piece of content was sent (for future dedupe checks).
async function recordSent(
  hash: string,
  headline: string,
  kind: string,
  meta: { asset?: string; event?: string; urgency?: string } = {},
) {
  await admin.from("sent_news_log").insert({
    content_hash: hash,
    headline: headline.slice(0, 300),
    kind,
    asset: meta.asset ?? null,
    event_keyword: meta.event ?? null,
    urgency: meta.urgency ?? null,
  });
}

// Dedupe windows for each message type.
const NEWS_DEDUPE_MS = 2 * 60 * 60_000;   // 2 hours — never repeat the same headline
const SIGNAL_DEDUPE_MS = 15 * 60_000;     // 15 min — never repeat the exact same signal
const RESULT_DEDUPE_MS = 60 * 60_000;     // 1 hour — never repeat the exact same result

// Smarter news dedupe windows (topic + per-asset + urgency based).
const TOPIC_DEDUPE_MS = 3 * 60 * 60_000;  // 3h — same asset+event topic never repeats
const ASSET_HOUR_MS = 60 * 60_000;        // 1h — at most one news per asset per hour
const URGENCY_INFO_MS = 2 * 60 * 60_000;  // 🟢 info only sends if asset quiet for 2h

// Extract a canonical "event" keyword from a headline+summary so two differently
// worded stories about the same topic collapse to the same key.
const EVENT_KEYWORDS: { re: RegExp; key: string }[] = [
  { re: /\biran\b/i, key: "iran" },
  { re: /\b(fomc|federal open market)\b/i, key: "fomc" },
  { re: /\b(fed|federal reserve|powell)\b/i, key: "fed-rate" },
  { re: /\b(nfp|non[- ]?farm|payroll|jobs report|unemployment|jobless)\b/i, key: "jobs" },
  { re: /\b(cpi|inflation|ppi|core pce)\b/i, key: "inflation" },
  { re: /\b(opec\+?|production cut|output cut)\b/i, key: "opec" },
  { re: /\b(gdp|growth data)\b/i, key: "gdp" },
  { re: /\b(tariff|trade war|trade deal)\b/i, key: "trade" },
  { re: /\becb\b/i, key: "ecb" },
  { re: /\b(boj|bank of japan)\b/i, key: "boj" },
  { re: /\b(boe|bank of england)\b/i, key: "boe" },
  { re: /\b(war|conflict|missile|strike|attack|ceasefire|geopolit|sanction)\b/i, key: "geopolitics" },
  { re: /\b(supply|inventory|stockpile|reserves|glut|surplus|output|production)\b/i, key: "supply" },
  { re: /\b(rate cut|rate hike|interest rate|monetary policy)\b/i, key: "rates" },
];
function extractEvent(text: string): string {
  for (const { re, key } of EVENT_KEYWORDS) if (re.test(text)) return key;
  return "";
}

// Urgency ranking for "pick the most important per asset".
const URGENCY_RANK: Record<string, number> = { BREAKING: 3, IMPORTANT: 2, INFO: 1 };

// ───────────────────── Telegram (retry + backoff) ─────────────────────
async function sendToChat(chatId: string, kind: string, text: string): Promise<boolean> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  const { data: logRow } = await admin.from("telegram_logs")
    .insert({ kind, chat_id: chatId, payload: { text }, status: "pending", attempts: 0 })
    .select("id").maybeSingle();
  const logId = logRow?.id as string | undefined;

  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
    if (logId) await admin.from("telegram_logs").update({ status: "failed", error: "Missing Telegram credentials" }).eq("id", logId);
    return false;
  }

  const backoff = [1000, 2000, 4000];
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${TELEGRAM_GATEWAY}/sendMessage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": TELEGRAM_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        if (logId) await admin.from("telegram_logs").update({ status: "sent", attempts: attempt }).eq("id", logId);
        return true;
      }
      lastErr = `[${res.status}] ${JSON.stringify(d)}`;
    } catch (e) {
      lastErr = String(e);
    }
    if (attempt < 3) await sleep(backoff[attempt - 1]);
  }
  if (logId) await admin.from("telegram_logs").update({ status: "failed", attempts: 3, error: lastErr }).eq("id", logId);
  return false;
}

// Broadcast to admin DM + public channel. Succeeds if any target accepts it.
async function sendTelegram(kind: string, text: string): Promise<boolean> {
  const results = await Promise.all(
    TARGET_CHAT_IDS.map((id) => sendToChat(id, kind, text)),
  );
  return results.some(Boolean);
}

// Low-level call to any Telegram Bot API method through the connector gateway.
// Returns the parsed `result` on success, or null on failure (logged, never throws).
async function callTelegram(method: string, payload: Record<string, unknown>): Promise<any | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) return null;
  try {
    const res = await fetch(`${TELEGRAM_GATEWAY}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.ok) return d.result;
    console.error(`telegram ${method} failed`, res.status, JSON.stringify(d));
    return null;
  } catch (e) {
    console.error(`telegram ${method} error`, String(e));
    return null;
  }
}

// Subscriber count for the public channel (returns null if unavailable).
async function getChannelMemberCount(): Promise<number | null> {
  const r = await callTelegram("getChatMemberCount", { chat_id: CHANNEL_CHAT_ID });
  return typeof r === "number" ? r : null;
}

// Post a message to the channel and pin it (silently), unpinning the previous
// pinned stats message first. The pinned message_id is remembered in state.
async function pinChannelMessage(kind: string, text: string): Promise<boolean> {
  const result = await callTelegram("sendMessage", {
    chat_id: CHANNEL_CHAT_ID,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
  const messageId = result?.message_id;
  if (!messageId) return false;
  // Unpin the previous stats message if we still have its id.
  const prev = await getState("pinned_message");
  const prevId = prev.messageId as number | undefined;
  if (prevId) await callTelegram("unpinChatMessage", { chat_id: CHANNEL_CHAT_ID, message_id: prevId });
  const pinned = await callTelegram("pinChatMessage", {
    chat_id: CHANNEL_CHAT_ID,
    message_id: messageId,
    disable_notification: true,
  });
  await setState("pinned_message", { messageId, updatedAt: new Date().toISOString() });
  return !!pinned;
}

// Update the channel's public description/bio.
async function setChannelDescription(text: string): Promise<boolean> {
  // Telegram caps channel descriptions at 255 chars.
  const desc = text.length > 255 ? text.slice(0, 255) : text;
  const r = await callTelegram("setChatDescription", { chat_id: CHANNEL_CHAT_ID, description: desc });
  return r !== null;
}

// ───────────────────── message builders ─────────────────────
// pip       = price distance that equals "1 pip" for this asset (for pip counting)
// tpPct/slPct = full target / stop-loss distance as % of entry price (R:R ~1.5)
// requireSession = only open new signals while a major FX session is live (BTC = 24/7)
const ASSET_META: Record<
  string,
  { emoji: string; name: string; threshold: number; pip: number; tpPct: number; slPct: number; requireSession: boolean }
> = {
  "XAU/USD": { emoji: "🥇", name: "GOLD", threshold: GOLD_THRESHOLD, pip: 0.1, tpPct: 0.6, slPct: 0.4, requireSession: true },
  "WTI/USD": { emoji: "🛢", name: "OIL", threshold: OIL_THRESHOLD, pip: 0.01, tpPct: 0.8, slPct: 0.5, requireSession: true },
  "BTC/USD": { emoji: "₿", name: "BITCOIN", threshold: BTC_THRESHOLD, pip: 1, tpPct: 1.2, slPct: 0.8, requireSession: false },
};

// Round pips to whole numbers for clean messaging.
const toPips = (priceMove: number, pip: number) => Math.round(Math.abs(priceMove) / pip);

// ───────────────────── market sessions (UTC) ─────────────────────
interface SessionDef { name: string; ku: string; region: "Asia" | "London" | "New York"; emoji: string; start: number; end: number; }
const SESSIONS: SessionDef[] = [
  { name: "Sydney", ku: "سیدنی", region: "Asia", emoji: "🌏", start: 21, end: 6 },
  { name: "Tokyo", ku: "تۆکیۆ", region: "Asia", emoji: "🌏", start: 0, end: 9 },
  { name: "London", ku: "لەندەن", region: "London", emoji: "🇬🇧", start: 7, end: 16 },
  { name: "New York", ku: "نیویۆرک", region: "New York", emoji: "🇺🇸", start: 12, end: 21 },
];
// Kurdish names per region for the report.
const REGION_KU: Record<string, string> = { Asia: "ئاسیا", London: "لەندەن", "New York": "نیویۆرک" };
const REGION_EMOJI: Record<string, string> = { Asia: "🌏", London: "🇬🇧", "New York": "🇺🇸" };
type Region = "Asia" | "London" | "New York";
const ALL_REGIONS: Region[] = ["Asia", "London", "New York"];

// Which market regions are allowed to open NEW targets. Configurable & stored in
// market_alert_state["session_config"].regions. Empty/missing ⇒ all regions on.
async function getEnabledRegions(): Promise<Region[]> {
  const cfg = await getState("session_config");
  const r = cfg.regions as string[] | undefined;
  if (!Array.isArray(r) || r.length === 0) return [...ALL_REGIONS];
  const filtered = r.filter((x): x is Region => (ALL_REGIONS as string[]).includes(x));
  return filtered.length ? filtered : [...ALL_REGIONS];
}
async function setEnabledRegions(regions: string[]): Promise<Region[]> {
  const clean = [...new Set(regions)].filter((x): x is Region => (ALL_REGIONS as string[]).includes(x));
  const value = clean.length ? clean : [...ALL_REGIONS];
  await setState("session_config", { regions: value });
  return value;
}

function openSessions(d = new Date()): SessionDef[] {
  const h = d.getUTCHours();
  return SESSIONS.filter((s) => (s.start <= s.end ? h >= s.start && h < s.end : h >= s.start || h < s.end));
}
// A "major" session (London / New York) means high liquidity → good entry timing.
function isMajorSessionOpen(d = new Date()): boolean {
  return openSessions(d).some((s) => s.name === "London" || s.name === "New York");
}
// Is any ENABLED region currently open? (gates new targets per user config)
function enabledSessionOpen(enabled: Region[], d = new Date()): boolean {
  return openSessions(d).some((s) => enabled.includes(s.region));
}
// The active trading region — New York / London take priority (highest liquidity),
// else Asia. When `enabled` is given, only consider those regions.
function activeRegion(d = new Date(), enabled?: Region[]): Region | null {
  let open = openSessions(d);
  if (enabled) open = open.filter((s) => enabled.includes(s.region));
  if (open.length === 0) return null;
  if (open.some((s) => s.region === "New York")) return "New York";
  if (open.some((s) => s.region === "London")) return "London";
  return "Asia";
}
function sessionLabel(d = new Date(), enabled?: Region[]): string {
  const region = activeRegion(d, enabled);
  if (!region) return "Closed / داخراو";
  return `${REGION_EMOJI[region]} ${region} (${REGION_KU[region]})`;
}

function priceLine(q: Quote, sig: Signal): string {
  const m = ASSET_META[q.symbol];
  const up = q.changePct >= 0;
  const arrow = up ? "🟢▲" : "🔴▼";
  const pct = `${up ? "+" : ""}${q.changePct.toFixed(2)}%`;
  return [
    `${m.emoji} <b>${m.name} (${esc(q.symbol)})</b>`,
    `Price: <code>$${q.price.toLocaleString("en-US")}</code> ${arrow} ${pct}`,
    `Signal: ${sigBadge(sig)} <b>${sig}</b> · کاریگەری: ${sigKu(sig)}`,
  ].join("\n");
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

// Build a bilingual rationale from the REAL engine indicators (RSI / MACD cross /
// EMA20-vs-EMA50). Falls back to a generic line only when no engine data exists.
function signalRationale(q: Quote, sig: "BUY" | "SELL"): { en: string; ku: string } {
  const en: string[] = [];
  const ku: string[] = [];
  const e = q.eng;
  if (e) {
    if (e.ema20 != null && e.ema50 != null) {
      const up = e.ema20 > e.ema50;
      en.push(up ? "EMA20 > EMA50" : "EMA20 < EMA50");
      ku.push(up ? "EMA20 > EMA50" : "EMA20 < EMA50");
    }
    if (e.macd) {
      const bull = e.macd.macd > e.macd.signal;
      en.push(bull ? "MACD bullish cross" : "MACD bearish cross");
      ku.push(bull ? "MACD بڕینی بەرزبوونەوە" : "MACD بڕینی دابەزین");
    }
    if (e.rsi != null) {
      const r = Math.round(e.rsi);
      en.push(`RSI ${r}${r < 30 ? " oversold" : r > 70 ? " overbought" : r > 50 ? " bullish" : " bearish"}`);
      ku.push(`RSI ${r}`);
    }
    return { en: en.join(" + ") || (sig === "BUY" ? "Bullish setup" : "Bearish setup"), ku: ku.join(" + ") };
  }
  en.push(sig === "BUY" ? "Bullish setup" : "Bearish setup");
  ku.push(sig === "BUY" ? "دۆخی بەرزبوونەوە" : "دۆخی دابەزین");
  return { en: en.join(" + "), ku: ku.join(" + ") };
}

// Full BUY/SELL trade setup with entry, full target and stop loss (clean RTL layout).
// All indicator lines reflect the REAL engine values (no fabricated RSI/EMA/MACD).
function newSignalLine(
  q: Quote, sig: "BUY" | "SELL", entry: number, tp: number, sl: number, _tpPips: number, _slPips: number,
  confidence: number, session: string, tf?: string,
): string {
  const m = ASSET_META[q.symbol];
  const tpDelta = Math.abs(tp - entry);
  const slDelta = Math.abs(sl - entry);
  const isBuy = sig === "BUY";
  const sigKuW = isBuy ? "کڕین" : "فرۆشتن";
  const strength = confidence >= 80 ? ["Strong", "بەهێز"] : confidence >= 65 ? ["Medium", "مامناوەند"] : ["Weak", "لاواز"];
  const risk = confidence >= 80 ? ["Low", "کەم"] : confidence >= 65 ? ["Medium", "مامناوەند"] : ["High", "بەرز"];

  // Real indicator readout from the engine.
  const e = q.eng;
  const reasonLines: string[] = [];
  if (e) {
    if (e.ema20 != null && e.ema50 != null) {
      const up = e.ema20 > e.ema50;
      reasonLines.push(`EMA20 ${up ? "&gt;" : "&lt;"} EMA50 ${up ? "✅ بەرز" : "🔻 خوار"}`);
    }
    if (e.macd) {
      const bull = e.macd.macd > e.macd.signal;
      reasonLines.push(`MACD ${bull ? "Bullish ✅ بەهێز" : "Bearish 🔻 لاواز"}`);
    }
    if (e.rsi != null) {
      const r = Math.round(e.rsi);
      const tag = r < 30 ? "زۆر فرۆشراو" : r > 70 ? "زۆر کڕدراو" : r > 50 ? "بەرز" : "خوار";
      reasonLines.push(`RSI: ${r} · ${tag}`);
    }
    if (e.ema50 != null) {
      const above = q.eng!.price > e.ema50;
      reasonLines.push(`Price ${above ? "&gt;" : "&lt;"} EMA50 ${above ? "✅ بەرز" : "🔻 خوار"}`);
    }
    if (e.confluenceAlignment === "conflicting") {
      reasonLines.push("⚠️ پێچەوانەی ئاراستەی کاتی بەرزتر · Conflicts with higher-TF trend");
    }
  }
  if (reasonLines.length === 0) {
    reasonLines.push(isBuy ? "Bullish setup · دۆخی بەرزبوونەوە" : "Bearish setup · دۆخی دابەزین");
  }

  return [
    `${m.emoji} <b>${m.name} · ${sig}</b> ${sigEmoji(sig)} ${sigKuW}`,
    tf ? `⏱ <b>Timeframe: ${tf}</b> · چوارچێوەی کات` : "",
    "",
    `💰 <code>$${fmt(entry)}</code> :نرخی چوونەژوورەوە`,
    `🎯 <code>$${fmt(tp)}</code> :تارگێت (+$${fmt(tpDelta)})`,
    `🛑 <code>$${fmt(sl)}</code> :ستۆپ لۆس (-$${fmt(slDelta)})`,
    "",
    `⚡ Confidence: ${confidence}% · متمانە`,
    `📍 ${esc(session)}`,
    `💪 Strength: ${strength[0]} · ${strength[1]}`,
    "",
    "📈 هۆکار:",
    ...reasonLines,
    "",
    `⚠️ مەترسی: ${risk[1]} · Risk: ${risk[0]}`,
  ].join("\n");
}

// Outcome message when a signal closes on TP or SL (tagged with its timeframe).
function outcomeLine(
  symbol: string, sig: "BUY" | "SELL", hit: "tp" | "sl",
  entry: number, close: number, pips: number, tf?: string,
): string {
  const m = ASSET_META[symbol];
  const tfTag = tf ? ` · ⏱ ${tf}` : "";
  if (hit === "tp") {
    return [
      `🟢✅ <b>TARGET HIT / تارگێت تەواوبوو</b> 🎉`,
      `${m.emoji} <b>${m.name} (${esc(symbol)})</b> · ${sigEmoji(sig)} ${sig}${tfTag}`,
      `📈🟢 Result / ئەنجام: <b>+${pips} pips</b>`,
      `Entry <code>$${fmt(entry)}</code> → <code>$${fmt(close)}</code>`,
      `سیگنالەکە سەرکەوتوو بوو 🟢✅`,
    ].join("\n");
  }
  return [
    `🔴❌ <b>STOP LOSS / لۆست ستۆپ</b>`,
    `${m.emoji} <b>${m.name} (${esc(symbol)})</b> · ${sigEmoji(sig)} ${sig}${tfTag}`,
    `📉🔴 Result / ئەنجام: <b>-${pips} pips</b>`,
    `Entry <code>$${fmt(entry)}</code> → <code>$${fmt(close)}</code>`,
    `🟠⚠️ پێشبینییەکە هەڵە بوو — ئەم نۆتە چیتر ئەکتیڤ نییە`,
    `🚪 تکایە پۆزیشنەکە دابخە / Please close your position`,
  ].join("\n");
}

// Result message when a timeframe's candle/period closes WITHOUT hitting TP or SL.
// Reports the running P/L (pips won/lost vs entry) at the moment the period ended,
// so every signal sent for a timeframe always gets its own outcome.
function periodCloseLine(
  symbol: string, sig: "BUY" | "SELL", tf: string,
  entry: number, close: number, pips: number, win: boolean,
): string {
  const m = ASSET_META[symbol];
  if (win) {
    return [
      `🟢 <b>${tf} CANDLE CLOSED · IN PROFIT</b> 🎯`,
      `${m.emoji} <b>${m.name} (${esc(symbol)})</b> · ${sigEmoji(sig)} ${sig} · ⏱ ${tf}`,
      `📈🟢 Result / ئەنجام: <b>+${pips} pips</b>`,
      `Entry <code>$${fmt(entry)}</code> → <code>$${fmt(close)}</code>`,
      `کاتی ${tf} تەواوبوو لە قازاندا 🟢 · ${tf} period closed in profit`,
    ].join("\n");
  }
  return [
    `🔴 <b>${tf} CANDLE CLOSED · IN LOSS</b>`,
    `${m.emoji} <b>${m.name} (${esc(symbol)})</b> · ${sigEmoji(sig)} ${sig} · ⏱ ${tf}`,
    `📉🔴 Result / ئەنجام: <b>-${pips} pips</b>`,
    `Entry <code>$${fmt(entry)}</code> → <code>$${fmt(close)}</code>`,
    `کاتی ${tf} تەواوبوو لە زیاندا 🔴 · ${tf} period closed in loss`,

  ].join("\n");
}

// Standalone SIGNAL RESULT-only message (TP/SL outcomes only — no signals, no news).
function oneResultMessage(body: string): string {
  return [
    "━━━━━━━━━━━━━━━",
    "🏁 <b>CTP SIGNAL RESULT</b>",
    "━━━━━━━━━━━━━━━",
    "",
    body,
    "",
    "━━━━━━━━━━━━━━━",
    `<i>🕒 ${nowStamp()}</i>`,
    `<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>`,
  ].join("\n");
}

function nowStamp(): string {
  return new Date().toUTCString();
}

// Wrap a single trade target / outcome into its own standalone Telegram message.
// Each target is sent separately and never bundled with other targets or news.
function oneSignalMessage(_subtitle: string, body: string, _reason?: string): string {
  return [
    "━━━━━━━━━━━━━━━",
    "📊 <b>CTP SIGNAL · سیگناڵی CTP</b>",
    "━━━━━━━━━━━━━━━",
    "",
    body,
    "",
    "━━━━━━━━━━━━━━━",
    `<i>ئەمە ڕاوێژی دارایی نییە · Not financial advice</i>`,
  ].join("\n");
}

// Standalone CALENDAR-only message (economic events only — no signals, no news).
function oneCalendarMessage(body: string): string {
  return [
    "━━━━━━━━━━━━━━━",
    "🗓 <b>CTP CALENDAR · ساڵنامەی ئابووری</b>",
    "━━━━━━━━━━━━━━━",
    "",
    body,
    "",
    "━━━━━━━━━━━━━━━",
    `<i>ئەمە ڕاوێژی دارایی نییە · Not financial advice</i>`,
  ].join("\n");
}

// Standalone NEWS-only message (market news only — no signals, no calendar).
function oneNewsMessage(body: string): string {
  return [
    "━━━━━━━━━━━━━━━",
    "📰 <b>CTP NEWS · هەواڵی بازاڕ</b>",
    "━━━━━━━━━━━━━━━",
    "",
    body,
    "",
    "━━━━━━━━━━━━━━━",
    `<i>ئەمە ڕاوێژی دارایی نییە · Not financial advice</i>`,
  ].join("\n");
}

// ───────────────────── core scan ─────────────────────
// One open timeframe "leg" of a trade. Every signal sent to the channel (5M/15M/
// 30M/1H) is tracked as its own leg so it can report its own result the moment its
// candle/period closes (or earlier on TP/SL). `activeFrom` = when its message went
// live; `expiresAt` = activeFrom + that timeframe's period.
interface OpenLeg {
  id?: string;
  signal: "BUY" | "SELL";
  entry: number; tp: number; sl: number;
  /** TP2 (3R) — second take-profit level used for first-touch outcome labelling. */
  tp2?: number;
  tf: string;
  activeFrom: number;
  expiresAt: number;
}
// A single trade target message. `important` ⇒ broadcast immediately (bypass throttle).
// `reason` tells the user why this specific target was sent (very important, cooldown, news, etc.).
interface SignalMsg { text: string; important: boolean; reason: string; }
// A queued higher-timeframe signal waiting for its scheduled send time.
interface TfQueueItem { dueAt: number; text: string; reason: string; symbol: string; tf: string; }


async function evaluatePrices(): Promise<{ signalAlerts: SignalMsg[]; outcomeAlerts: string[]; quotes: Quote[] }> {
  const quotes = await getPrices();
  const priceState = await getState("prices");      // { "XAU/USD": { price, signal } }
  const openState = await getState("open_signals"); // { "XAU/USD": OpenLeg[] }
  const enabledRegions = await getEnabledRegions(); // which markets may open new targets
  // Pending higher-timeframe (15M/30M/1H) signals waiting for their staggered send time.
  const tfQueue = ((await getState("tf_queue")).items as TfQueueItem[]) ?? [];
  const signalAlerts: SignalMsg[] = [];
  const outcomeAlerts: string[] = [];

  for (const q of quotes) {
    const m = ASSET_META[q.symbol];
    if (!m) continue;
    const sig = quoteSignal(q);

    // Persist latest snapshot for the dashboard.
    await admin.from("market_prices").upsert({
      symbol: q.symbol, price: q.price, change_pct: q.changePct,
      trend: q.changePct >= 0 ? "up" : "down", signal: sig, updated_at: new Date().toISOString(),
    });

    // Migrate any legacy single-object open position to the new per-leg array.
    const rawOpen = openState[q.symbol];
    let legs: OpenLeg[] = [];
    if (Array.isArray(rawOpen)) {
      legs = rawOpen as OpenLeg[];
    } else if (rawOpen && typeof rawOpen === "object") {
      const o = rawOpen as { id?: string; signal: "BUY" | "SELL"; entry: number; tp: number; sl: number };
      legs = [{ ...o, tf: "15M", activeFrom: 0, expiresAt: Date.now() + TF_PERIOD_MS["15M"] }];
    }

    // 1) Manage every OPEN leg → did price hit TP/SL, or did its candle/period close?
    if (legs.length) {
      const nowTs = Date.now();
      const stillOpen: OpenLeg[] = [];
      for (const leg of legs) {
        // Leg not live yet (queued higher-TF re-post) → keep waiting.
        if (nowTs < leg.activeFrom) { stillOpen.push(leg); continue; }

        const isBuy = leg.signal === "BUY";
        // Live first-touch on the 5s spot stream: TP2 (3R) > TP1 (1.5R) > SL.
        // This is the immediate Telegram alert; the candle-based resolver
        // (resolve-signal-outcomes) later re-confirms each outcome authoritatively
        // from intrabar high/low and rewrites it with resolved_by='candle'.
        let hit: "tp" | "sl" | null = null;
        let outcome: "tp1" | "tp2" | "sl" | null = null;
        const tp2 = leg.tp2 ?? leg.entry + 2 * (leg.tp - leg.entry);
        if (isBuy) {
          if (q.price >= tp2) { hit = "tp"; outcome = "tp2"; }
          else if (q.price >= leg.tp) { hit = "tp"; outcome = "tp1"; }
          else if (q.price <= leg.sl) { hit = "sl"; outcome = "sl"; }
        } else {
          if (q.price <= tp2) { hit = "tp"; outcome = "tp2"; }
          else if (q.price <= leg.tp) { hit = "tp"; outcome = "tp1"; }
          else if (q.price >= leg.sl) { hit = "sl"; outcome = "sl"; }
        }

        // a) Hit TP or SL → close this leg with a tagged outcome.
        if (hit) {
          const pips = toPips(q.price - leg.entry, m.pip);
          outcomeAlerts.push(outcomeLine(q.symbol, leg.signal, hit, leg.entry, q.price, pips, leg.tf));
          if (leg.id) {
            await admin.from("ai_signals").update({
              status: hit === "tp" ? "target_hit" : "stopped_out",
              outcome,
              close_reason: outcome,
              result_pips: hit === "tp" ? pips : -pips,
              close_price: q.price,
              closed_at: new Date().toISOString(),
              resolved_by: "tick",
            }).eq("id", leg.id);
          }
          continue; // leg closed → drop it
        }

        // b) The timeframe's candle/period closed without hitting TP/SL.
        //    This is NOT a win or a loss — neither target nor stop was reached —
        //    so it is recorded as `expired` and EXCLUDED from win-rate. (The old
        //    code counted a mere price-direction drift as a "target_hit", which
        //    inflated the win rate. That bug is fixed here.)
        if (nowTs >= leg.expiresAt) {
          const win = isBuy ? q.price >= leg.entry : q.price <= leg.entry;
          const pips = toPips(q.price - leg.entry, m.pip);
          outcomeAlerts.push(periodCloseLine(q.symbol, leg.signal, leg.tf, leg.entry, q.price, pips, win));
          if (leg.id) {
            await admin.from("ai_signals").update({
              status: "expired",
              outcome: "expired",
              close_reason: "period_close",
              result_pips: pips * (win ? 1 : -1),
              close_price: q.price,
              closed_at: new Date().toISOString(),
              resolved_by: "tick",
            }).eq("id", leg.id);
          }
          continue; // leg closed → drop it
        }

        stillOpen.push(leg); // still running
      }

      if (stillOpen.length) openState[q.symbol] = stillOpen;
      else delete openState[q.symbol];

      // While ANY leg is still open we never stack a new trade for this symbol — the
      // current trade's outcomes are always reported before a fresh signal goes out.
      if (stillOpen.length) {
        const prevOpen = priceState[q.symbol] as { lastSignalAt?: number; lastSignalDir?: Signal; lastAuditKey?: string } | undefined;
        priceState[q.symbol] = {
          price: q.price, signal: sig,
          lastSignalAt: prevOpen?.lastSignalAt, lastSignalDir: prevOpen?.lastSignalDir, lastAuditKey: prevOpen?.lastAuditKey,
        };
        continue;
      }
    }


    // 2) No open position → consider opening a NEW signal when timing is right.
    const prev = priceState[q.symbol] as
      { price?: number; signal?: Signal; lastSignalAt?: number; lastSignalDir?: Signal; lastAuditKey?: string } | undefined;
    const actionable = sig === "BUY" || sig === "SELL";
    // requireSession assets only open while an ENABLED region is live (user-configurable).
    const timingOk = !m.requireSession || enabledSessionOpen(enabledRegions);
    // Avoid re-opening the SAME direction we last SENT a signal for. We compare against
    // lastSignalDir (only updated when a signal is actually broadcast) — NOT the per-tick
    // observed signal — otherwise a direction that was merely observed while the market was
    // closed / in cooldown would permanently block that direction from ever firing.
    const fresh = prev?.lastSignalDir !== sig;
    // Quiet-market guard: skip weak moves and respect a per-symbol cooldown so we
    // don't spam repeated signals when the market is barely moving.
    const strongMove = Math.abs(q.changePct) >= SIGNAL_MIN_MOVE_PCT;
    const cooldownOk = !prev?.lastSignalAt || Date.now() - prev.lastSignalAt >= SIGNAL_COOLDOWN_MS;

    let lastSignalAt = prev?.lastSignalAt;
    let lastSignalDir = prev?.lastSignalDir;

    // Audit: record every actionable (BUY/SELL) decision — sent or skipped — with the
    // reason it was (or wasn't) broadcast: fresh / cooldown / market closed / weak move.
    if (actionable) {
      let auditOutcome: "sent" | "skipped";
      let auditReason: string;
      if (!timingOk) auditReason = "market_closed";
      else if (!fresh) auditReason = "not_fresh";
      else if (!strongMove) auditReason = "weak_move";
      else if (!cooldownOk) auditReason = "cooldown";
      else auditReason = "fresh";
      auditOutcome = auditReason === "fresh" ? "sent" : "skipped";

      if (actionable && timingOk && fresh && strongMove && cooldownOk) {
        // ATR-based levels from the SAME engine as the app — identical entry/SL/TP.
        const { entry, tp, sl, tp2 } = quoteLevels(q, sig as "BUY" | "SELL");
        const tpPips = toPips(tp - entry, m.pip);
        const slPips = toPips(sl - entry, m.pip);
        const tp2Pips = toPips(tp2 - entry, m.pip);
        const confidence = quoteConfidence(q);
        const session = sessionLabel(new Date(), enabledRegions);

        const highConf = confidence >= TARGET_IMPORTANT_CONFIDENCE;
        const strongMoveImp = Math.abs(q.changePct) >= TARGET_IMPORTANT_MOVE_PCT;
        let reason = "⏱ Cooldown passed / throttle finished · کاتژمێری کۆتایی هات";
        if (highConf && strongMoveImp) reason = "🔥 Very important: high confidence + strong move · زۆر گرنگ: متمانە بەرز + جوڵە بەهێز";
        else if (highConf) reason = "🔥 Very important: high confidence · زۆر گرنگ: متمانە بەرز";
        else if (strongMoveImp) reason = "🔥 Very important: strong move · زۆر گرنگ: جوڵە بەهێز";

        // Staggered re-posts of the SAME trade so late joiners still see it. Every
        // message carries the identical engine entry/SL/TP — no per-TF widening.
        // Each timeframe becomes its OWN tracked leg (its own ai_signals row) so it
        // reports its own result the moment its candle/period closes.
        const now = Date.now();
        const newLegs: OpenLeg[] = [];
        for (const tfDef of TIMEFRAME_CASCADE) {
          const activeFrom = now + tfDef.delayMs;
          const expiresAt = activeFrom + (TF_PERIOD_MS[tfDef.tf] ?? TF_PERIOD_MS["15M"]);

          const { data: ins } = await admin.from("ai_signals").insert({
            asset: m.name, signal: sig, entry, tp, tp2, sl, confidence,
            status: "open", outcome: "open", market_session: session,
            tp_pips: tpPips, sl_pips: slPips, tp2_pips: tp2Pips,
            timeframe: tfDef.tf,
          }).select("id").maybeSingle();

          const tfReason = `${reason} · ⏱ ${tfDef.tf}`;
          const text = newSignalLine(q, sig as "BUY" | "SELL", entry, tp, sl, tpPips, slPips, confidence, session, tfDef.tf);
          if (tfDef.delayMs === 0) {
            // First message fires immediately as a high-priority signal so it always reaches the channel.
            signalAlerts.push({ text, important: true, reason: tfReason });
          } else {
            tfQueue.push({ dueAt: activeFrom, text, reason: tfReason, symbol: m.name, tf: tfDef.tf });
          }
          newLegs.push({
            id: ins?.id as string | undefined,
            signal: sig as "BUY" | "SELL",
            entry, tp, tp2, sl, tf: tfDef.tf, activeFrom, expiresAt,
          });
        }
        openState[q.symbol] = newLegs;
        lastSignalAt = Date.now();
        lastSignalDir = sig; // remember the direction we actually broadcast
      }


      // Persist the audit record (best-effort — never block signal flow on logging).
      // The scan loop ticks ~every 5s, so to avoid flooding we log every SENT signal,
      // but only log a SKIPPED attempt when its reason CHANGES from the last logged one
      // for this symbol (so each distinct fresh/cooldown/market-closed/weak-move state
      // transition is recorded exactly once).
      const auditKey = `${auditOutcome}:${auditReason}`;
      if (auditOutcome === "sent" || prev?.lastAuditKey !== auditKey) {
        await admin.from("signal_audit_log").insert({
          symbol: m.name, signal: sig, price: q.price, change_pct: q.changePct,
          outcome: auditOutcome, reason: auditReason,
        });
      }
      priceState[q.symbol] = { price: q.price, signal: sig, lastSignalAt, lastSignalDir, lastAuditKey: auditKey };
    } else {
      priceState[q.symbol] = { price: q.price, signal: sig, lastSignalAt, lastSignalDir, lastAuditKey: prev?.lastAuditKey };
    }
  }


  await setState("prices", priceState);
  await setState("open_signals", openState);
  // Persist any newly scheduled higher-timeframe signals (cap to avoid unbounded growth).
  await setState("tf_queue", { items: tfQueue.slice(-200) });
  return { signalAlerts, outcomeAlerts, quotes };
}

// Drain the higher-timeframe (15M/30M/1H) signal queue: return any items whose
// scheduled send time has arrived, and rewrite the queue with the rest.
async function drainDueTimeframeSignals(): Promise<TfQueueItem[]> {
  const tfQueue = ((await getState("tf_queue")).items as TfQueueItem[]) ?? [];
  if (!tfQueue.length) return [];
  const now = Date.now();
  const due: TfQueueItem[] = [];
  const remaining: TfQueueItem[] = [];
  for (const item of tfQueue) {
    if (item.dueAt <= now) due.push(item);
    else remaining.push(item);
  }
  if (due.length) await setState("tf_queue", { items: remaining });
  return due;
}


// Detect the market-moving "tier-1" events that deserve a dedicated 🚨 alert.
function isFomcNfp(title: string): boolean {
  return /\bfomc\b|federal funds|fed funds|interest rate|rate decision|monetary policy|non[- ]?farm|\bnfp\b|payroll/i.test(title);
}
function specialEventHead(title: string): string {
  if (/non[- ]?farm|\bnfp\b|payroll/i.test(title)) return "🚨 <b>NFP RESULT</b>";
  if (/\bfomc\b|federal funds|fed funds|interest rate|rate decision|monetary policy/i.test(title)) return "🚨 <b>FOMC RESULT</b>";
  return "🚨 <b>HIGH-IMPACT RESULT</b>";
}

async function evaluateCalendar(): Promise<{ calendarAlerts: string[]; signalAlerts: SignalMsg[]; specialAlerts: string[] }> {
  const events = await getHighImpactEvents();
  const state = await getState("events"); // { alertedKeys, resultKeys, preGold }
  const alerted = new Set((state.alertedKeys as string[]) ?? []);
  const resulted = new Set((state.resultKeys as string[]) ?? []);
  const preGold: Record<string, number> = (state.preGold as Record<string, number>) ?? {};
  const now = Date.now();
  const calendarAlerts: string[] = [];     // heads-up + result info (NO trade targets)
  const signalAlerts: SignalMsg[] = [];    // news-driven trade targets (sent separately)
  const specialAlerts: string[] = [];      // dedicated 🚨 FOMC/NFP result alerts
  let goldPrice: number | null = null;     // fetched lazily for USD-event gold bias

  // Persist all upcoming high-impact events for the dashboard.
  for (const ev of events) {
    await admin.from("economic_events").upsert({
      ext_key: ev.key, title: ev.title, currency: ev.currency, impact: ev.impact,
      event_time: new Date(ev.time).toISOString(), forecast: ev.forecast, previous: ev.previous,
    }, { onConflict: "ext_key" });
  }

  // ── ALERT 1 of 2: ONE combined heads-up ≤30 min before release. Events firing
  // at the SAME time are merged into a single message (grouped by currency, shown
  // as a "PACKAGE" when one currency has 2+ events at that time). No 5-min spam.
  {
    const upcoming = events
      .filter((ev) => { const m = (ev.time - now) / 60_000; return m > 0 && m <= EVENT_ALERT_MIN && !alerted.has(ev.key); })
      .sort((a, b) => a.time - b.time);
    if (upcoming.length) {
      for (const ev of upcoming) {
        alerted.add(ev.key);
        // Snapshot gold before a tier-1 USD release so we can measure the reaction later.
        if (isFomcNfp(ev.title) && ev.currency.toUpperCase() === "USD" && preGold[ev.key] == null) {
          if (goldPrice === null) { const g = await fetchGold(); goldPrice = g?.price ?? null; }
          if (goldPrice) preGold[ev.key] = goldPrice;
        }
      }
      const minsTo = Math.max(1, Math.round((upcoming[0].time - now) / 60_000));
      const head = [
        `⚠️ ${upcoming.length} High-Impact Event${upcoming.length > 1 ? "s" : ""} in ${minsTo} min`,
        `${upcoming.length} ئیڤێنتی گرنگ لە ${minsTo} خولەکدا`,
      ];
      const byTime = new Map<number, CalEvent[]>();
      for (const ev of upcoming) { const a = byTime.get(ev.time) ?? []; a.push(ev); byTime.set(ev.time, a); }
      const blocks: string[] = [];
      for (const [time, evs] of [...byTime.entries()].sort((a, b) => a[0] - b[0])) {
        const tLabel = new Date(time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
        const byCcy = new Map<string, CalEvent[]>();
        for (const ev of evs) { const a = byCcy.get(ev.currency) ?? []; a.push(ev); byCcy.set(ev.currency, a); }
        for (const [ccy, list] of byCcy.entries()) {
          const isPkg = list.length > 1;
          const title = `${ccyFlag(ccy)} <b>${esc(ccy)}${isPkg ? " PACKAGE" : ""}</b> · ${tLabel} UTC`;
          const items = list.map((ev) => `• ${esc(ev.title)}${ev.forecast ? `: Fcst ${esc(ev.forecast)}` : ""}`);
          blocks.push([title, ...items, "", goldImpactLine(ccy)].join("\n"));
        }
      }
      calendarAlerts.push([...head, "", blocks.join("\n\n")].join("\n"));
    }
  }

  for (const ev of events) {
    // ── ALERT 2 of 2: AFTER the event releases → post the RESULT + market reaction.
    // Only when an actual figure exists, event is in the past but recent (<=6h), and not yet posted.
    const minsSince = (now - ev.time) / 60_000;
    if (ev.actual && minsSince >= 0 && minsSince <= 360 && !resulted.has(ev.key)) {
      resulted.add(ev.key);

      // Result block: figures + market bias (no concrete Entry/TP/SL here).
      const lines: string[] = [
        `🏁 <b>RESULT · ئەنجامی ئیڤێنت</b>`,
        `${ccyFlag(ev.currency)} <b>${esc(ev.title)}</b> · ${esc(ev.currency)}`,
        `📊 Actual: <code>${esc(ev.actual)}</code> · Fcst: <code>${esc(ev.forecast || "—")}</code> · Prev: <code>${esc(ev.previous || "—")}</code>`,
      ];

      const a = parseFigure(ev.actual);
      const f = parseFigure(ev.forecast);
      const isUsd = ev.currency.toUpperCase() === "USD";

      if (isUsd && a !== null && f !== null) {
        const { dir, usd } = goldFromUsdSurprise(ev.title, a, f);
        if (dir === "HOLD") {
          lines.push(`⚪️ As expected / وەک پێشبینی — کاریگەری کەم لەسەر بازار`);
        } else {
          if (goldPrice === null) { const g = await fetchGold(); goldPrice = g?.price ?? null; }
          const usdTxt = usd === "stronger"
            ? `🔴 USD stronger / دۆلار بەهێزتر → Gold bearish / ئاڵتوون دادەبەزێت`
            : `🟢 USD weaker / دۆلار لاوازتر → Gold bullish / ئاڵتوون بەرز دەبێتەوە`;
          lines.push(usdTxt);
          lines.push(`🎯 تارگێتەکە بە پەیامێکی جیا دەنێردرێت / Trade target sent separately`);

          // Concrete trade target → SEPARATE signal message (news-driven ⇒ important).
          // Direction comes from the data surprise; risk model = same ATR engine.
          const m = ASSET_META["XAU/USD"];
          if (goldPrice) {
            const goldEng = await getEngine("XAU/USD", goldPrice);
            const { entry, tp, sl } = levelsForDir("XAU/USD", goldPrice, dir as "BUY" | "SELL", goldEng?.atr ?? null);
            const isBuy = dir === "BUY";
            const tpPips = toPips(tp - entry, m.pip);
            const slPips = toPips(sl - entry, m.pip);
            signalAlerts.push({
              important: true,
              reason: "📰 High-impact news / هەواڵی کاریگەری بەرز",
              text: [
                `📰 News-driven / بەهۆی هەواڵ: <b>${esc(ev.title)}</b>`,
                `${sigBadge(dir)} <b>${dir} GOLD</b> / ${sigKu(dir)}ی ئاڵتوون`,
                `📍 Entry / دەستپێک: <code>$${fmt(entry)}</code>`,
                `🎯🟢 TP / تارگێت: <code>$${fmt(tp)}</code> (${isBuy ? "+" : "-"}${tpPips} pips)`,
                `🛑🔴 SL / لۆست ستۆپ: <code>$${fmt(sl)}</code> (${isBuy ? "-" : "+"}${slPips} pips)`,
              ].join("\n"),
            });
          }
        }
      } else if (a !== null && f !== null) {
        const beat = a > f, miss = a < f;
        lines.push(beat ? `🟢 Beat forecast / باشتر لە پێشبینی` : miss ? `🔴 Below forecast / خراپتر لە پێشبینی` : `⚪️ As expected / وەک پێشبینی`);
      }

      // Dedicated 🚨 alert for tier-1 events (FOMC / NFP / rate decisions).
      if (isFomcNfp(ev.title)) {
        if (goldPrice === null) { const g = await fetchGold(); goldPrice = g?.price ?? null; }
        const pre = preGold[ev.key];
        const reaction = (goldPrice != null && pre != null) ? goldPrice - pre : null;
        const isNfp = /non[- ]?farm|\bnfp\b|payroll/i.test(ev.title);
        const sLines: string[] = [specialEventHead(ev.title)];
        if (isNfp) {
          sLines.push(`📊 Jobs: <b>${esc(ev.actual)}</b> (forecast ${esc(ev.forecast || "—")})`);
        } else {
          const held = !!ev.previous && !!ev.actual && ev.actual.trim() === ev.previous.trim();
          sLines.push(`🏦 Rate: <b>${held ? "Held" : "Changed"} ${esc(ev.actual)}</b> ${held ? "✓" : "❗"}`);
        }
        let goldDir: "BUY" | "SELL" | null = null;
        if (reaction != null) {
          const sign = reaction >= 0 ? "+" : "-";
          const arrow = reaction >= 0 ? "🟢▲" : "🔴▼";
          sLines.push(`🥇 Gold reaction: ${arrow} ${sign}$${fmt(Math.abs(reaction))} in ${Math.max(1, Math.round(minsSince))}min`);
          if (Math.abs(reaction) >= 1) goldDir = reaction > 0 ? "BUY" : "SELL";
        }
        if (!goldDir && a !== null && f !== null) {
          const sd = goldFromUsdSurprise(ev.title, a, f).dir;
          if (sd !== "HOLD") goldDir = sd;
        }
        if (goldDir && goldPrice) {
          const goldEng = await getEngine("XAU/USD", goldPrice);
          const { tp } = levelsForDir("XAU/USD", goldPrice, goldDir, goldEng?.atr ?? null);
          sLines.push(`📈 Signal: ${sigEmoji(goldDir)} <b>${goldDir}</b> → Target <code>$${fmt(tp)}</code>`);
          sLines.push(`📈 سیگنال: ${sigKu(goldDir)} → تارگێت <code>$${fmt(tp)}</code>`);
        } else {
          sLines.push(`⚪️ Muted reaction / کاریگەری کەم — چاوەڕێ بکە`);
        }
        delete preGold[ev.key];
        specialAlerts.push(sLines.join("\n"));
      }

      calendarAlerts.push(lines.join("\n"));
    }
  }

  // Keep last 100 keys of each kind (+ pending pre-event gold snapshots).
  await setState("events", {
    alertedKeys: [...alerted].slice(-100),
    resultKeys: [...resulted].slice(-100),
    preGold,
  });
  return { calendarAlerts, signalAlerts, specialAlerts };
}


// ───────────────────── market news (live fetch + bilingual) ─────────────────────
interface NewsItem { title: string; link: string; source: string; category: string; pubDate: string; summary: string; }

const NEWS_SOURCES: { url: string; source: string; category: string }[] = [
  // Investing.com — broad + per-asset categories (fastest general market wire).
  { url: "https://www.investing.com/rss/news_1.rss", source: "Investing.com", category: "forex" },
  { url: "https://www.investing.com/rss/news_11.rss", source: "Investing.com", category: "commodities" },
  { url: "https://www.investing.com/rss/news_25.rss", source: "Investing.com", category: "commodities" }, // Gold/metals
  { url: "https://www.investing.com/rss/news_8.rss", source: "Investing.com", category: "commodities" },  // Oil/energy
  { url: "https://www.investing.com/rss/news_301.rss", source: "Investing.com", category: "crypto" },     // Crypto
  // CNBC — economy + markets/finance wire.
  { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", source: "CNBC", category: "economy" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", source: "CNBC", category: "markets" },
  // MarketWatch top stories.
  { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", source: "MarketWatch", category: "markets" },
  // MarketWatch real-time market pulse (faster breaking headlines).
  { url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain", source: "MarketWatch", category: "markets" },
  // ForexFactory macro/FX data now comes from the clean JSON calendar feed
  // (https://nfs.faireconomy.media/ff_calendar_thisweek.json) via CALENDAR_URL /
  // getHighImpactEvents() — the blocked HTML RSS feed has been removed.
  // Reuters business/markets (may be intermittent — failures are ignored gracefully).
  { url: "https://feeds.reuters.com/reuters/businessNews", source: "Reuters", category: "markets" },
  { url: "https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best", source: "Reuters", category: "markets" },
  // Bloomberg markets free RSS (may be intermittent — failures are ignored gracefully).
  { url: "https://feeds.bloomberg.com/markets/news.rss", source: "Bloomberg", category: "markets" },
];

const RELEVANT_RE = /\b(gold|silver|xau|bullion|precious metal|oil|crude|brent|wti|opec|natural gas|energy|forex|fx|currency|currencies|dollar|euro|yen|pound|sterling|usd|eur|gbp|jpy|exchange rate|fed|federal reserve|fomc|ecb|boe|boj|central bank|rate cut|rate hike|interest rate|inflation|cpi|ppi|gdp|jobs report|payroll|nonfarm|unemployment|treasury|bond|yield|stock|stocks|equities|market|markets|index|s&p|nasdaq|dow|wall street|commodity|commodities|bitcoin|btc|ethereum|crypto|recession|economy|economic|tariff|trade war|earnings|powell)\b/i;
const IRRELEVANT_RE = /(\bmy plumber\b|should i quit|quit my job|retire(ment| early)|i'?m \d+ (and|with|years)|personal finance|my (husband|wife|mom|dad|son|daughter|kid|family)|dear (penny|abby)|suze orman|dave ramsey|here'?s how (much|i)|how i (saved|retired|paid|built|became)|i regret|side hustle|frugal|coupon|credit card (debt|rewards|points)|net worth at|millionaire next door|budget(ing)? tips|grocery|honeymoon|wedding|inheritance from)/i;

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "\u2026").replace(/&mdash;/g, "\u2014").replace(/&ndash;/g, "\u2013")
    .replace(/&lsquo;/g, "\u2018").replace(/&rsquo;/g, "\u2019").replace(/&ldquo;/g, "\u201C").replace(/&rdquo;/g, "\u201D")
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ""; } })
    .replace(/\s+/g, " ").trim();
}
function pickTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}
function categorize(text: string): string {
  const t = text.toLowerCase();
  if (/\b(gold|xau|bullion|silver|precious metal)\b/.test(t)) return "GOLD";
  if (/\b(oil|crude|brent|wti|opec|natural gas)\b/.test(t)) return "OIL";
  if (/\b(bitcoin|btc|ethereum|eth|crypto|blockchain)\b/.test(t)) return "CRYPTO";
  if (/\b(forex|fx|currency|currencies|dollar|euro|yen|pound|sterling|usd|eur|gbp|jpy)\b/.test(t)) return "FOREX";
  return "MARKETS";
}
function firstSentence(s: string): string {
  if (!s) return "";
  // Strip any leftover URLs and keep up to ~4 sentences (≤ 480 chars) so the
  // Telegram post can show the full news summary, not just a teaser.
  const clean = s.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g);
  let out = sentences ? sentences.slice(0, 4).join(" ").trim() : clean;
  if (out.length > 480) out = out.slice(0, 477).trim() + "...";
  return out;
}
// Minutes elapsed since a pubDate string (returns a large number if unparseable).
function minAgo(pubDate: string): number {
  const ts = Date.parse(pubDate) || 0;
  if (!ts) return 9999;
  return Math.max(0, Math.round((Date.now() - ts) / 60000));
}
// Freshness-based urgency from how old the story is:
//   🔴 BREAKING  < 5 min · 🟡 IMPORTANT 5–30 min · 🟢 INFO otherwise.
function freshnessUrgency(ageMin: number): Urgency {
  if (ageMin < 5) return "BREAKING";
  if (ageMin <= 30) return "IMPORTANT";
  return "INFO";
}
function parseRss(xml: string, source: string, fallbackCategory: string): NewsItem[] {
  const items: NewsItem[] = [];
  // Support both RSS <item> and Atom <entry> feeds (Reuters/Bloomberg vary).
  const blocks = (xml.match(/<item[\s\S]*?<\/item>/gi) ?? [])
    .concat(xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? []);
  for (const block of blocks) {
    const title = pickTag(block, "title");
    if (!title) continue;
    let link = pickTag(block, "link");
    if (!link) { const m = block.match(/<link[^>]*href="([^"]+)"/i); if (m) link = m[1]; }
    const pubDate = pickTag(block, "pubDate") || pickTag(block, "dc:date") || pickTag(block, "published") || pickTag(block, "updated");
    const rawSummary = pickTag(block, "description") || pickTag(block, "summary") || pickTag(block, "content");
    const combined = `${title} ${rawSummary}`;
    if (IRRELEVANT_RE.test(combined) || !RELEVANT_RE.test(combined)) continue;
    items.push({ title, link, source, category: categorize(combined) || fallbackCategory, pubDate, summary: firstSentence(rawSummary) });
  }
  return items;
}
async function fetchNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    NEWS_SOURCES.map(async (s) => {
      const r = await fetch(s.url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) { await r.text(); return [] as NewsItem[]; }
      return parseRss(await r.text(), s.source, s.category).slice(0, 10);
    }),
  );
  let all: NewsItem[] = [];
  for (const r of results) if (r.status === "fulfilled") all = all.concat(r.value);
  const seen = new Set<string>();
  all = all.filter((n) => { const k = (n.link || n.title).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  all.sort((a, b) => (Date.parse(b.pubDate) || 0) - (Date.parse(a.pubDate) || 0));
  return all;
}

// Asset / impact label maps for the bilingual news block.
const ASSET_LABEL: Record<string, { en: string; ku: string }> = {
  GOLD: { en: "Gold", ku: "زێڕ" },
  OIL: { en: "Oil", ku: "نەوت" },
  CRYPTO: { en: "BTC", ku: "بیتکۆین" },
  FOREX: { en: "USD", ku: "دۆلار" },
  MARKETS: { en: "Market", ku: "بازاڕ" },
};
const IMPACT_META: Record<string, { emoji: string; ku: string }> = {
  BULLISH: { emoji: "🟢", ku: "بەرزبوونەوە" },
  BEARISH: { emoji: "🔴", ku: "داکشان" },
  NEUTRAL: { emoji: "🟡", ku: "جێگیر" },
};
const URGENCY_META: Record<string, { emoji: string; en: string; ku: string }> = {
  BREAKING: { emoji: "🔴", en: "Breaking — act now", ku: "هەواڵی گرنگ — ئێستا کار بکە" },
  IMPORTANT: { emoji: "🟡", en: "Important — watch closely", ku: "گرنگ — بەوردی چاودێری بکە" },
  INFO: { emoji: "🟢", en: "Informational — no action needed", ku: "زانیاری — پێویست بە کار ناکات" },
};

type Impact = "BULLISH" | "BEARISH" | "NEUTRAL";
type Urgency = "BREAKING" | "IMPORTANT" | "INFO";
interface NewsEnrich {
  titleKu: string;
  summaryEn: string;
  summaryKu: string;
  impact: Impact;
  impactGold: Impact;
  impactOil: Impact;
  impactBtc: Impact;
  urgency: Urgency;
  tipEn: string;
  tipKu: string;
  relatedEn: string;
  relatedKu: string;
}

// Map a news category to the live symbol whose price anchors the trader tip.
const CAT_SYMBOL: Record<string, string> = {
  GOLD: "XAU/USD", OIL: "WTI/USD", CRYPTO: "BTC/USD", FOREX: "XAU/USD", MARKETS: "XAU/USD",
};

// Enrich a batch of news items in one AI call: natural-Kurdish title + summary,
// expected impact, urgency level, a trader tip with concrete levels, and a
// related-asset note. NO URLs / source names are ever produced.
async function enrichNews(items: NewsItem[], priceBySymbol: Record<string, number> = {}): Promise<NewsEnrich[]> {
  const fallback: NewsEnrich[] = items.map((n) => ({
    titleKu: "", summaryEn: n.summary, summaryKu: "", impact: "NEUTRAL",
    impactGold: "NEUTRAL", impactOil: "NEUTRAL", impactBtc: "NEUTRAL",
    urgency: "INFO", tipEn: "", tipKu: "", relatedEn: "", relatedKu: "",
  }));
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY || items.length === 0) return fallback;
  try {
    const payload = items.map((n) => {
      const al = ASSET_LABEL[n.category] ?? { en: "Market" };
      const sym = CAT_SYMBOL[n.category];
      const price = sym ? priceBySymbol[sym] : undefined;
      return {
        title: n.title,
        summary: n.summary,
        asset: al.en,
        current_price: price ?? null,
      };
    });
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are an experienced bilingual financial journalist who writes for a Kurdish audience (English + Kurdish Sorani / کوردیی ناوەندی). " +
              "Write Kurdish the way a professional Kurdish news journalist would write it — natural, fluent and idiomatic. Do NOT translate word-for-word; rephrase so it reads like original Kurdish journalism, while keeping the meaning faithful. Keep financial terms understandable. " +
              "For each item return an object with EXACTLY these keys: " +
              "title_ku (a natural Kurdish news-style title), " +
              "summary_en (a clear 3-4 sentence English summary built from the title and provided text; NEVER include URLs, links, or source/website names), " +
              "summary_ku (a natural, journalist-style Kurdish version of summary_en — fluent, not literal), " +
              "impact (one of BULLISH, BEARISH, NEUTRAL — expected effect on the given asset), " +
              "impact_gold, impact_oil, impact_btc (each one of BULLISH, BEARISH, NEUTRAL — expected effect of THIS news on Gold, Oil and Bitcoin respectively; use NEUTRAL if the news has no clear effect on that asset), " +
              "urgency (one of BREAKING, IMPORTANT, INFO — how time-sensitive this news is for a trader), " +
              "tip_en (one short actionable trader tip with concrete price levels using current_price when provided, e.g. 'If gold is bullish, consider BUY above 4320 with SL 4305'), " +
              "tip_ku (the same trader tip written naturally in Kurdish Sorani), " +
              "related_en (one short sentence naming another asset also affected and why, e.g. 'Oil also affected because the Iran deal impacts both'; empty string if none), " +
              "related_ku (the same related-asset note in natural Kurdish; empty string if none). " +
              "Reply ONLY with a JSON array of objects, same order and same length as the input. No markdown, no extra text.",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) { await res.text(); return fallback; }
    const d = await res.json();
    let content = String(d?.choices?.[0]?.message?.content ?? "").trim();
    content = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    const arr = JSON.parse(content);
    if (Array.isArray(arr) && arr.length === items.length) {
      return arr.map((x, i) => {
        const toImpact = (v: unknown): Impact => {
          const r = String(v ?? "").toUpperCase();
          return r === "BULLISH" || r === "BEARISH" ? r : "NEUTRAL";
        };
        const impact = toImpact(x?.impact);
        const urgRaw = String(x?.urgency ?? "").toUpperCase();
        const urgency: Urgency = urgRaw === "BREAKING" || urgRaw === "IMPORTANT" ? urgRaw : "INFO";
        return {
          titleKu: String(x?.title_ku ?? ""),
          summaryEn: String(x?.summary_en ?? items[i].summary ?? ""),
          summaryKu: String(x?.summary_ku ?? ""),
          impact,
          impactGold: toImpact(x?.impact_gold),
          impactOil: toImpact(x?.impact_oil),
          impactBtc: toImpact(x?.impact_btc),
          urgency,
          tipEn: String(x?.tip_en ?? ""),
          tipKu: String(x?.tip_ku ?? ""),
          relatedEn: String(x?.related_en ?? ""),
          relatedKu: String(x?.related_ku ?? ""),
        };
      });
    }
  } catch (e) {
    console.error("enrichNews failed", e);
  }
  return fallback;
}

const CAT_EMOJI: Record<string, string> = { GOLD: "🟡", OIL: "🟠", CRYPTO: "🟣", FOREX: "🔵", MARKETS: "🟢" };

// Build one bilingual news block — NO external links / sources.
// Count words in a string (used for the news content-quality gate).
// wordCount, passesNewsQualityGate and the length thresholds live in a shared
// module so the automated tests validate the exact same rules used here.

// Clean bilingual news card: asset header, headline, EN + KU summary, impact + tip.
// Rich bilingual BREAKING-news card: urgency banner, source + age, asset header,
// EN + KU headline, EN + KU summary, cross-asset impact, trader action, source.
const URGENCY_BANNER: Record<Urgency, { line: string }> = {
  BREAKING: { line: "🔴 BREAKING · خەبەری تازە" },
  IMPORTANT: { line: "🟡 IMPORTANT · گرنگ" },
  INFO: { line: "🟢 INFO · زانیاری" },
};
function impactLine(label: string, imp: Impact): string {
  const m = IMPACT_META[imp] ?? IMPACT_META.NEUTRAL;
  return `${label} ${imp} ${m.emoji}`;
}
function newsBlockItem(n: NewsItem, e: NewsEnrich): string {
  const dot = CAT_EMOJI[n.category] ?? "🔹";
  const al = ASSET_LABEL[n.category] ?? { en: n.category, ku: n.category };
  const urgency: Urgency = e.urgency ?? "INFO";
  const banner = URGENCY_BANNER[urgency] ?? URGENCY_BANNER.INFO;
  const summaryEn = (e.summaryEn || n.summary || "").trim();
  const headlineEn = (n.title || e.titleKu || "").trim();
  const headlineKu = (e.titleKu || "").trim();
  const ageMin = minAgo(n.pubDate);
  const ageLabel = ageMin >= 9999 ? "" : ` · ${ageMin} min ago`;

  const parts: string[] = [
    `<b>${banner.line}</b>`,
    `⚡ ${esc(n.source)}${ageLabel}`,
    "",
    `${dot} <b>${esc(al.en.toUpperCase())} / ${esc(al.ku)}</b>`,
    "",
    `📌 ${esc(headlineEn)}`,
  ];
  if (headlineKu && headlineKu !== headlineEn) parts.push(esc(headlineKu));
  if (summaryEn) parts.push("", `🇬🇧 ${esc(summaryEn)}`);
  if (e.summaryKu) parts.push("", `🇮🇶 ${esc(e.summaryKu)}`);
  parts.push(
    "",
    "📊 Impact / کاریگەری:",
    impactLine("🥇 Gold:", e.impactGold),
    impactLine("🛢 Oil:", e.impactOil),
    impactLine("₿ BTC:", e.impactBtc),
  );
  if (e.tipEn || e.tipKu) {
    parts.push("", "💡 Trader Action / کردەوەی ترەیدەر:");
    if (e.tipEn) parts.push(esc(e.tipEn));
    if (e.tipKu) parts.push(esc(e.tipKu));
  }
  parts.push("", `🔗 Source: ${esc(n.source)}`);
  return parts.join("\n");
}

interface NewsOut { block: string; headline: string; hash: string; asset: string; event: string; urgency: Urgency; source: string; ageMin: number }

async function evaluateNews(quotes: Quote[] = [], opts?: { breakingOnly?: boolean }): Promise<NewsOut[]> {
  const breakingOnly = opts?.breakingOnly === true;
  const priceBySymbol: Record<string, number> = {};
  for (const q of quotes) priceBySymbol[q.symbol] = q.price;
  const news = await fetchNews();
  const state = await getState("news"); // { alertedKeys: string[] }
  const alerted = new Set((state.alertedKeys as string[]) ?? []);
  const now = Date.now();

  // Gather fresh (≤90 min old) candidates we have not alerted yet AND whose exact
  // headline was NOT already posted in the last 2 hours. We collect a wider pool
  // (up to 12) so we can later pick the single most important item per asset.
  // In breakingOnly mode we ONLY keep genuinely breaking items (<5 min old) so
  // the AI enrichment cost is spent only when there is real breaking news.
  const fresh: NewsItem[] = [];
  for (const n of news) {
    const key = (n.link || n.title).toLowerCase();
    if (alerted.has(key)) continue;
    const ageMin = minAgo(n.pubDate);
    if (breakingOnly && ageMin >= 5) continue; // only breaking items between digests
    alerted.add(key);
    const ts = Date.parse(n.pubDate) || 0;
    if (ts && now - ts > 90 * 60 * 1000) continue;
    // Skip if this EXACT headline was already sent in the last 2 hours.
    if (await wasRecentlySent(contentHash(n.title), NEWS_DEDUPE_MS)) continue;
    fresh.push(n);
    if (fresh.length >= 12) break;
  }
  await setState("news", { alertedKeys: [...alerted].slice(-300) });
  if (fresh.length === 0) return [];

  const enriched = await enrichNews(fresh, priceBySymbol);

  // Build candidates with asset + event keyword + urgency, persist for the dashboard.
  interface Cand { n: NewsItem; e: NewsEnrich; asset: string; event: string; urgency: Urgency; ts: number }
  const candidates: Cand[] = [];
  for (let i = 0; i < fresh.length; i++) {
    const n = fresh[i];
    const e = enriched[i] ?? { titleKu: "", summaryEn: n.summary, summaryKu: "", impact: "NEUTRAL" as Impact, impactGold: "NEUTRAL" as Impact, impactOil: "NEUTRAL" as Impact, impactBtc: "NEUTRAL" as Impact, urgency: "INFO" as Urgency, tipEn: "", tipKu: "", relatedEn: "", relatedKu: "" };
    const hash = (n.link || n.title).toLowerCase();
    await admin.from("market_news").upsert({
      hash, title: n.title, title_ku: e.titleKu || null, summary: e.summaryEn || n.summary || null,
      impact: n.category, bias: e.impact, source: n.source, url: n.link,
      published_at: n.pubDate ? new Date(n.pubDate).toISOString() : null,
    }, { onConflict: "hash" });
    // Final urgency = the more urgent of AI judgement vs freshness (age).
    const freshU = freshnessUrgency(minAgo(n.pubDate));
    const finalUrgency: Urgency = (URGENCY_RANK[freshU] ?? 1) >= (URGENCY_RANK[e.urgency] ?? 1) ? freshU : e.urgency;
    e.urgency = finalUrgency; // so the card banner matches the final urgency
    candidates.push({
      n, e,
      asset: n.category,
      event: extractEvent(`${n.title} ${n.summary}`),
      urgency: finalUrgency,
      ts: Date.parse(n.pubDate) || now,
    });
  }

  // MAX 1 news per asset per cycle: among same-asset items pick the most important
  // (urgency rank, then newest). This collapses e.g. two Oil stories into one.
  const bestByAsset = new Map<string, Cand>();
  for (const c of candidates) {
    const cur = bestByAsset.get(c.asset);
    if (!cur) { bestByAsset.set(c.asset, c); continue; }
    const better =
      (URGENCY_RANK[c.urgency] ?? 1) - (URGENCY_RANK[cur.urgency] ?? 1) ||
      c.ts - cur.ts;
    if (better > 0) bestByAsset.set(c.asset, c);
  }

  const out: NewsOut[] = [];
  for (const c of bestByAsset.values()) {
    // CONTENT-QUALITY GATE: never post an empty/thin news card. Require a real
    // headline (≥6 words) AND a substantial summary (≥40 words). Skip otherwise.
    const headline = (c.e.titleKu || c.n.title || "").trim();
    const summary = (c.e.summaryEn || c.n.summary || "").trim();
    if (!passesNewsQualityGate(c.n.title, headline, summary)) continue;
    out.push({
      block: newsBlockItem(c.n, c.e),
      headline: c.n.title,
      hash: contentHash(c.n.title),
      asset: c.asset,
      event: c.event,
      urgency: c.urgency,
      source: c.n.source,
      ageMin: minAgo(c.n.pubDate),
    });
  }
  return out;
}

// ───────────────────── speed competition (fastest news source) ─────────────────────
// Each time we POST a story we log which source delivered it and how stale it was
// when we caught it (ageMin). The "fastest source" is the one whose stories are,
// on average, the freshest when we post them. Kept as a rolling window.
interface SpeedStory { source: string; ageMin: number; ts: number }
async function recordSourceSpeed(source: string, ageMin: number) {
  if (!source || ageMin >= 9999) return;
  const state = await getState("source_speed");
  const stories = ((state.stories as SpeedStory[]) ?? []).slice();
  stories.push({ source, ageMin, ts: Date.now() });
  // Keep the last 60 stories (covers "last 10" tracking + the weekly window).
  await setState("source_speed", { stories: stories.slice(-60) });
}
// Compute the fastest source over the last `windowMs` (default: this week).
function fastestSource(stories: SpeedStory[], windowMs = 7 * 24 * 60 * 60_000): { source: string; avgMin: number; count: number } | null {
  const cutoff = Date.now() - windowMs;
  const recent = stories.filter((s) => s.ts >= cutoff);
  if (recent.length === 0) return null;
  const agg: Record<string, { total: number; count: number }> = {};
  for (const s of recent) {
    (agg[s.source] ??= { total: 0, count: 0 });
    agg[s.source].total += s.ageMin;
    agg[s.source].count += 1;
  }
  let best: { source: string; avgMin: number; count: number } | null = null;
  for (const [source, v] of Object.entries(agg)) {
    const avgMin = v.total / v.count;
    if (!best || avgMin < best.avgMin) best = { source, avgMin: Math.round(avgMin), count: v.count };
  }
  return best;
}
// Bilingual "fastest source this week" line for the weekly report (null if no data).
async function fastestSourceLine(): Promise<string | null> {
  const state = await getState("source_speed");
  const stories = (state.stories as SpeedStory[]) ?? [];
  const best = fastestSource(stories);
  if (!best) return null;
  return `⚡ Fastest source this week: <b>${esc(best.source)}</b> (avg ${best.avgMin} min)\n<i>خێراترین سەرچاوەی هەفتە: ${esc(best.source)}</i>`;
}


// ───────────────────── market-open report (per region) ─────────────────────
// Build an analysis card for a region that just opened: live prices, per-asset
// signal, overall bias, and a "get ready to BUY/SELL" heads-up. No concrete
// target here — targets are sent separately when the buy/sell moment arrives.
function sessionOpenReport(region: Region, quotes: Quote[]): string {
  const label = `${REGION_EMOJI[region]} ${region} (${REGION_KU[region]})`;
  const sigs = quotes.map((q) => quoteSignal(q));
  const buys = sigs.filter((s) => s === "BUY").length;
  const sells = sigs.filter((s) => s === "SELL").length;
  let bias = "🟡 Neutral / مامناوەند — چاوەڕێی جوڵە بکە";
  if (buys > sells) bias = "🟢 Bullish bias / مەیلی کڕین — ئامادە بە بۆ BUY";
  else if (sells > buys) bias = "🔴 Bearish bias / مەیلی فرۆشتن — ئامادە بە بۆ SELL";
  const priceBlock = quotes.length
    ? quotes.map((q) => priceLine(q, quoteSignal(q))).join("\n\n")
    : "—";
  return [
    "🔔 <b>MARKET OPEN / بازاڕ کرایەوە</b>",
    `🏙 Session / بازاڕ: ${label}`,
    "━━━━━━━━━━━━━━━",
    "",
    "📈 <b>Analysis / شیکاری بازاڕ</b>",
    "",
    priceBlock,
    "",
    `📊 Overall bias / مەیلی گشتی: ${bias}`,
    "",
    "🟢🔴 ئامادە بە بۆ کڕین یان فرۆشتن — کاتێک وەختی هات تارگێت بە پەیامێکی جیا دەنێردرێت",
    "Get ready to BUY/SELL — targets are sent separately when the moment arrives",
    "",
    "━━━━━━━━━━━━━━━",
    `<i>🕒 ${nowStamp()}</i>`,
    `<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>`,
  ].join("\n");
}

// Detect regions that JUST opened (only ENABLED ones) and emit one report each.
// State stores the set of currently-open regions so each region only reports once
// per open; when it closes it is removed and can report again on its next open.
async function evaluateSessionOpen(): Promise<string[]> {
  const enabled = await getEnabledRegions();
  const openRegions = [...new Set(openSessions().map((s) => s.region))].filter((r) => enabled.includes(r));
  const state = await getState("session_open");
  const reported = new Set((state.reported as string[]) ?? []);
  const newlyOpen = openRegions.filter((r) => !reported.has(r));

  const alerts: string[] = [];
  if (newlyOpen.length) {
    const quotes = await getPrices();
    for (const region of newlyOpen) alerts.push(sessionOpenReport(region as Region, quotes));
  }
  // Persist only the regions still open so closed ones can re-trigger later.
  await setState("session_open", { reported: openRegions });
  return alerts;
}

// ───────────────────── scheduled session OPEN / CLOSE posts ─────────────────────
// Auto-posts a rich bilingual card to @goldmarketai exactly when each major FX
// session opens and closes (UTC triggers). Deduped per day via session_posts_log.
const SESSION_OPEN_HOURS: Record<Region, number> = { Asia: 0, London: 7, "New York": 13 };
const SESSION_CLOSE_HOURS: Record<Region, number> = { Asia: 8, London: 16, "New York": 21 };

// London-clock label for the current time (handles BST/GMT automatically).
function londonHourLabel(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/London" });
}

// Lookup quotes by base asset.
function q3(quotes: Quote[]): { gold?: Quote; oil?: Quote; btc?: Quote } {
  return {
    gold: quotes.find((q) => q.symbol === "XAU/USD"),
    oil: quotes.find((q) => q.symbol === "WTI/USD"),
    btc: quotes.find((q) => q.symbol === "BTC/USD"),
  };
}

// BULLISH / BEARISH / NEUTRAL bias from the day's % change.
function biasLabel(changePct: number): string {
  if (changePct >= 0.15) return "BULLISH 🟢";
  if (changePct <= -0.15) return "BEARISH 🔴";
  return "NEUTRAL 🟡";
}

// Plain price line: "🥇 Gold: $4,275.30"
function plainPriceLine(q: Quote | undefined, emoji: string, name: string): string {
  if (!q) return `${emoji} ${name}: —`;
  return `${emoji} ${name}: <code>$${fmt(q.price)}</code>`;
}

// Price line with arrow + %: "🥇 Gold: $4,275.30 🟢▲ +0.42%"
function priceWithChangeLine(q: Quote | undefined, emoji: string, name: string): string {
  if (!q) return `${emoji} ${name}: —`;
  const up = q.changePct >= 0;
  const arrow = up ? "🟢▲" : "🔴▼";
  return `${emoji} ${name}: <code>$${fmt(q.price)}</code> ${arrow} ${up ? "+" : ""}${q.changePct.toFixed(2)}%`;
}

// Today's high-impact economic events, optionally only USD and/or only upcoming.
async function todaysKeyEvents(opts?: { usdOnly?: boolean; futureOnly?: boolean }): Promise<string[]> {
  const events = await getHighImpactEvents();
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const rows = events
    .filter((e) => new Date(e.time).toISOString().slice(0, 10) === today)
    .filter((e) => (opts?.usdOnly ? /USD/i.test(e.currency) : true))
    .filter((e) => (opts?.futureOnly ? e.time >= now : true))
    .sort((a, b) => a.time - b.time)
    .slice(0, 6);
  return rows.map((e) => {
    const t = new Date(e.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
    return `• ${t} UTC · ${esc(e.currency)} ${esc(e.title)}`;
  });
}

// Country/currency → flag emoji for calendar + session cards.
const CCY_FLAG: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", CHF: "🇨🇭", CAD: "🇨🇦",
  AUD: "🇦🇺", NZD: "🇳🇿", CNY: "🇨🇳",
};
function ccyFlag(c: string): string {
  return CCY_FLAG[String(c || "").toUpperCase()] ?? "🏳️";
}

// Generic bilingual gold-impact hint for a calendar currency.
function goldImpactLine(ccy: string): string {
  const c = String(ccy || "").toUpperCase();
  if (c === "USD") {
    return [
      "📊 Gold Impact / کاریگەری زێڕ:",
      "ئەگەر داتا بەهێز بوو → SELL زێڕ 🔴",
      "ئەگەر داتا لاواز بوو → BUY زێڕ 🟢",
    ].join("\n");
  }
  return [
    "📊 Gold Impact / کاریگەری زێڕ:",
    "ئاگاداربە لە جوڵەی بازاڕ 🟡 · Watch for volatility",
  ].join("\n");
}

// London-clock label for a fixed UTC hour (handles BST/GMT). E.g. London open 07 UTC → "08:00".
function sessionLocalLabel(hourUtc: number, now: Date): string {
  const d = new Date(now);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/London" });
}

// Yesterday's date string (UTC) relative to a reference date.
function yesterdayStr(now: Date): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Closed-signal stats for a single UTC day (whole channel, all sessions).
async function dayStats(day: string): Promise<{ total: number; won: number; lost: number; rate: number }> {
  const start = new Date(`${day}T00:00:00.000Z`).toISOString();
  const end = new Date(`${day}T23:59:59.999Z`).toISOString();
  const { data } = await admin.from("ai_signals")
    .select("status, closed_at")
    .gte("closed_at", start).lte("closed_at", end)
    .in("status", ["target_hit", "stopped_out"]);
  const rows = (data ?? []) as { status: string }[];
  const won = rows.filter((r) => r.status === "target_hit").length;
  const lost = rows.filter((r) => r.status === "stopped_out").length;
  const total = rows.length;
  return { total, won, lost, rate: total ? Math.round((won / total) * 100) : 0 };
}

// Today's high-impact events as session-card lines: "🕐 08:30 · SNB Rate Decision 🇨🇭"
async function keyEventLines(opts?: { usdOnly?: boolean; futureOnly?: boolean }): Promise<string[]> {
  const events = await getHighImpactEvents();
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  return events
    .filter((e) => new Date(e.time).toISOString().slice(0, 10) === today)
    .filter((e) => (opts?.usdOnly ? /USD/i.test(e.currency) : true))
    .filter((e) => (opts?.futureOnly ? e.time >= now : true))
    .sort((a, b) => a.time - b.time)
    .slice(0, 6)
    .map((e) => {
      const t = new Date(e.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
      return `🕐 ${t} · ${esc(e.title)} ${ccyFlag(e.currency)}`;
    });
}

// ── session open price snapshot (for close-session % change) ──
async function recordSessionOpenPrices(region: Region, day: string, quotes: Quote[]) {
  const state = await getState("session_open_prices");
  const map = (state.map as Record<string, Record<string, number>>) ?? {};
  const snap: Record<string, number> = {};
  for (const q of quotes) snap[q.symbol] = q.price;
  map[`${region}|${day}`] = snap;
  await setState("session_open_prices", { map });
}
async function getSessionOpenPrices(region: Region, day: string): Promise<Record<string, number> | null> {
  const state = await getState("session_open_prices");
  const map = (state.map as Record<string, Record<string, number>>) ?? {};
  return map[`${region}|${day}`] ?? null;
}

// Session change line (open → close): "🥇 Gold: 🟢 +$5.20 (+0.12%)"
function sessionChangeLine(q: Quote | undefined, emoji: string, name: string, openPrice?: number): string {
  if (!q) return `${emoji} ${name}: —`;
  let delta: number;
  let pct: number;
  if (openPrice && openPrice > 0) {
    delta = q.price - openPrice;
    pct = (delta / openPrice) * 100;
  } else {
    pct = q.changePct;
    delta = q.price * (pct / 100);
  }
  const sign = delta >= 0 ? "+" : "-";
  const dot = delta >= 0 ? "🟢" : "🔴";
  return `${emoji} ${name}: ${dot} ${sign}$${fmt(Math.abs(delta))} (${sign}${Math.abs(pct).toFixed(2)}%)`;
}

// Count this region's signals today (total / won / lost) from ai_signals.
async function sessionSignalStats(region: Region, day: string): Promise<{ total: number; won: number; lost: number }> {
  const startUtc = new Date(`${day}T00:00:00.000Z`).toISOString();
  const { data } = await admin.from("ai_signals")
    .select("status, market_session, created_at")
    .gte("created_at", startUtc);
  const rows = (data ?? []) as { status: string; market_session: string }[];
  const mine = rows.filter((r) => rowRegion(r.market_session) === region);
  return {
    total: mine.length,
    won: mine.filter((r) => r.status === "target_hit").length,
    lost: mine.filter((r) => r.status === "stopped_out").length,
  };
}

// Rich close stats for one region/day: totals, pips, P/L, win-rate, best signal.
async function sessionCloseStats(region: Region, day: string): Promise<{
  total: number; won: number; lost: number; pips: number; pl: number; rate: number; best?: DailyRow;
}> {
  const startUtc = new Date(`${day}T00:00:00.000Z`).toISOString();
  const { data } = await admin.from("ai_signals")
    .select("asset, signal, entry, close_price, status, result_pips, market_session, closed_at")
    .gte("closed_at", startUtc)
    .in("status", ["target_hit", "stopped_out"]);
  const rows = ((data ?? []) as DailyRow[]).filter((r) => rowRegion(r.market_session) === region);
  const won = rows.filter((r) => r.status === "target_hit").length;
  const lost = rows.filter((r) => r.status === "stopped_out").length;
  const pips = rows.reduce((s, r) => s + rowPips(r), 0);
  const winners = rows.filter((r) => r.status === "target_hit").sort((a, b) => rowPips(b) - rowPips(a));
  return {
    total: rows.length, won, lost, pips, pl: pipsToDollars(pips),
    rate: rows.length ? Math.round((won / rows.length) * 100) : 0,
    best: winners[0],
  };
}

// Friendly "what's next" line per region close.
function nextSessionLine(region: Region): string {
  if (region === "Asia") return "⏭ Next: London Session · لەندەن";
  if (region === "London") return "⏭ Next: New York Session · نیویۆرک";
  return "⏭ Next: Daily Report at 22:00 BST";
}

// ── OPEN message builder ──
async function sessionOpenMessage(region: Region, quotes: Quote[], now: Date): Promise<string> {
  const { gold, oil, btc } = q3(quotes);
  const bstLabel = sessionLocalLabel(SESSION_OPEN_HOURS[region], now);
  const buys = quotes.filter((q) => quoteSignal(q) === "BUY").length;
  const sells = quotes.filter((q) => quoteSignal(q) === "SELL").length;
  const overall = buys > sells ? "BULLISH 🟢" : sells > buys ? "BEARISH 🔴" : "NEUTRAL 🟡";
  const overallKu = buys > sells ? "بەرزبوونەوە" : sells > buys ? "دابەزین" : "مامناوەند";
  const ev = region === "New York"
    ? await keyEventLines({ usdOnly: true, futureOnly: true })
    : await keyEventLines({ futureOnly: true });
  const yest = await dayStats(yesterdayStr(now));

  const lines: string[] = [
    "━━━━━━━━━━━━━━━",
    `${REGION_EMOJI[region]} <b>${region} Session Open</b>`,
    `${REGION_KU[region]} کرایەوە · ${bstLabel} BST`,
    "━━━━━━━━━━━━━━━",
    "💰 <b>Live Prices / نرخی زیندوو:</b>",
    priceWithChangeLine(gold, "🥇", "Gold"),
    priceWithChangeLine(oil, "🛢", "Oil"),
    priceWithChangeLine(btc, "₿", "BTC"),
    "",
    `📊 <b>Overall Bias: ${overall}</b>`,
    `مەیلی گشتی: ${overallKu}`,
    "",
    "⚠️ <b>Key Events Today / ئیڤێنتی گرنگ:</b>",
    ev.length ? ev.join("\n") : "🕐 No high-impact events · هیچ ئیڤێنتێک نییە",
    "",
    "🤖 Bot: ACTIVE · چالاک",
    `📊 Yesterday: ${yest.total} signals · ${yest.won} won (${yest.rate}%)`,
    "━━━━━━━━━━━━━━━",
    "<i>ئەمە ڕاوێژی دارایی نییە · Not financial advice</i>",
  ];
  return lines.join("\n");
}

// ── CLOSE message builder ──
async function sessionCloseMessage(region: Region, quotes: Quote[], day: string): Promise<string> {
  const { gold, oil, btc } = q3(quotes);
  const open = await getSessionOpenPrices(region, day);
  const s = await sessionCloseStats(region, day);
  const closeLabel = sessionLocalLabel(SESSION_CLOSE_HOURS[region], new Date());
  const plDot = s.pl >= 0 ? "🟢" : "🔴";

  const lines: string[] = [
    "━━━━━━━━━━━━━━━",
    `${REGION_EMOJI[region]} <b>${region} Session Closed</b>`,
    `${REGION_KU[region]} داخرا · ${closeLabel} BST`,
    "━━━━━━━━━━━━━━━",
    "📊 <b>Session Results / ئەنجامی سێشن:</b>",
    "",
    sessionChangeLine(gold, "🥇", "Gold", open?.["XAU/USD"]),
    sessionChangeLine(oil, "🛢", "Oil", open?.["WTI/USD"]),
    sessionChangeLine(btc, "₿", "BTC", open?.["BTC/USD"]),
    "",
    "🤖 <b>Bot Performance:</b>",
    `📈 Signals: ${s.total}`,
    `✅ Won: ${s.won} · ❌ Lost: ${s.lost}`,
    `💰 P/L: ${plDot} ${plStr(s.pl)}`,
    `📊 Win Rate: ${s.rate}%`,
  ];

  if (s.best) {
    const meta = ASSET_META[s.best.asset] ?? { emoji: "🥇", name: s.best.asset };
    const entry = Number(s.best.entry) || 0;
    const close = Number(s.best.close_price) || 0;
    const delta = s.best.signal === "SELL" ? entry - close : close - entry;
    lines.push(
      "",
      `🏆 Best: ${meta.name} ${s.best.signal} $${fmt(entry)}→$${fmt(close)}`,
      `${delta >= 0 ? "+" : "-"}$${fmt(Math.abs(delta))} · ${pipsStr(rowPips(s.best))} pips ✅`,
    );
  }

  lines.push("", nextSessionLine(region), "━━━━━━━━━━━━━━━", "<i>ئەمە ڕاوێژی دارایی نییە · Not financial advice</i>");
  return lines.join("\n");
}


// Dedup helpers against session_posts_log.
async function wasSessionPosted(region: Region, kind: "open" | "close", day: string): Promise<boolean> {
  const { data } = await admin.from("session_posts_log")
    .select("id").eq("region", region).eq("kind", kind).eq("session_date", day).limit(1).maybeSingle();
  return !!data;
}
async function recordSessionPost(region: Region, kind: "open" | "close", day: string) {
  await admin.from("session_posts_log").insert({ region, kind, session_date: day });
}

interface SessionPost { region: Region; kind: "open" | "close"; text: string; }

// Fire any session open/close posts due in the current UTC hour (deduped per day).
async function evaluateSessionPosts(): Promise<SessionPost[]> {
  const now = new Date();
  const hour = now.getUTCHours();
  const day = now.toISOString().slice(0, 10);
  const out: SessionPost[] = [];
  let quotes: Quote[] | null = null;
  const getQ = async (): Promise<Quote[]> => (quotes ??= await getPrices());

  for (const region of ALL_REGIONS) {
    if (SESSION_OPEN_HOURS[region] === hour && !(await wasSessionPosted(region, "open", day))) {
      const q = await getQ();
      await recordSessionOpenPrices(region, day, q);
      out.push({ region, kind: "open", text: await sessionOpenMessage(region, q, now) });
    }
  }
  for (const region of ALL_REGIONS) {
    if (SESSION_CLOSE_HOURS[region] === hour && !(await wasSessionPosted(region, "close", day))) {
      const q = await getQ();
      out.push({ region, kind: "close", text: await sessionCloseMessage(region, q, day) });
    }
  }
  return out;
}

// ───────────────────── daily summary (22:00 BST = 21:00 UTC) ─────────────────────
const DAILY_SUMMARY_UTC_HOUR = 21; // 22:00 London time (BST)



// Convert pips → an approximate dollar P/L (0.01-lot convention: $0.10 per pip).
function pipsToDollars(pips: number): number {
  return pips * 0.1;
}
function plStr(dollars: number): string {
  return `${dollars >= 0 ? "+" : "-"}$${fmt(Math.abs(dollars))}`;
}
function pipsStr(pips: number): string {
  return `${pips >= 0 ? "+" : ""}${Math.round(pips)}`;
}

interface DailyRow {
  asset: string;
  signal: string;
  entry: number;
  close_price: number;
  status: string;
  result_pips: number;
  market_session: string;
}

// Which region a stored session label belongs to.
function rowRegion(label: string): Region | null {
  if (!label) return null;
  if (label.includes("New York")) return "New York";
  if (label.includes("London")) return "London";
  if (label.includes("Asia")) return "Asia";
  return null;
}

// Pips for a row: prefer the stored result_pips, else derive from entry/close.
function rowPips(r: DailyRow): number {
  if (Number.isFinite(r.result_pips) && r.result_pips !== 0) return Number(r.result_pips);
  const meta = ASSET_META[r.asset];
  const pip = meta?.pip ?? 0.1;
  const entry = Number(r.entry) || 0;
  const close = Number(r.close_price) || 0;
  if (!entry || !close) return 0;
  const diff = r.signal === "SELL" ? entry - close : close - entry;
  return toPips(diff, pip);
}

function sessionRegionBlock(region: Region, rows: DailyRow[]): string {
  const won = rows.filter((r) => r.status === "target_hit").length;
  const lost = rows.filter((r) => r.status === "stopped_out").length;
  const pips = rows.reduce((s, r) => s + rowPips(r), 0);
  const pl = pipsToDollars(pips);
  const plDot = pl >= 0 ? "🟢" : "🔴";
  return [
    `${REGION_EMOJI[region]} <b>${region.toUpperCase()} SESSION</b>`,
    `✅ Won: ${won}  ❌ Lost: ${lost}`,
    `📈 Pips: ${pipsStr(pips)}  💰 P/L: ${plDot} ${plStr(pl)}`,
  ].join("\n");
}

// End-of-day report with per-session breakdown, win-rates, and best/worst signal.
// Fires once per day during the 21:00 UTC (22:00 BST) hour; deduped by calendar date.
// Pass { force: true } to build the report regardless of the time/dedupe gates
// (used by the preview/test handler — does not touch the dedupe state).
// Daily performance line: "🥇 Gold: $4,290 🔴▼ -$63 (-1.5%)"
function dailyPerfLine(q: Quote | undefined, emoji: string, name: string): string {
  if (!q) return `${emoji} ${name}: —`;
  const up = q.changePct >= 0;
  const arrow = up ? "🟢▲" : "🔴▼";
  const delta = q.price * (q.changePct / 100);
  const sign = delta >= 0 ? "+" : "-";
  return `${emoji} ${name}: <code>$${fmt(q.price)}</code> ${arrow} ${sign}$${fmt(Math.abs(delta))} (${up ? "+" : ""}${q.changePct.toFixed(2)}%)`;
}

// Tomorrow's high-impact events as "🕐 12:30 BST · Philly Fed 🇺🇸" lines.
async function tomorrowKeyEventLines(): Promise<string[]> {
  const events = await getHighImpactEvents();
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + 1);
  const day = t.toISOString().slice(0, 10);
  return events
    .filter((e) => new Date(e.time).toISOString().slice(0, 10) === day)
    .sort((a, b) => a.time - b.time)
    .slice(0, 6)
    .map((e) => {
      const tl = new Date(e.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/London" });
      return `🕐 ${tl} BST · ${esc(e.title)} ${ccyFlag(e.currency)}`;
    });
}

async function evaluateDailySummary(quotes: Quote[], opts?: { force?: boolean }): Promise<string | null> {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  if (!opts?.force) {
    if (now.getUTCHours() !== DAILY_SUMMARY_UTC_HOUR) return null;
    const state = await getState("daily_summary");
    if (state.lastDay === day) return null;
    await setState("daily_summary", { lastDay: day });
  }

  const dateLabel = now.toLocaleDateString("en-GB", {
    weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: "Europe/London",
  });

  // Live market performance (use passed quotes; fall back to a fresh fetch).
  const q = (quotes && quotes.length) ? quotes : await getPrices();
  const { gold, oil, btc } = q3(q);

  // Tomorrow's key events.
  const tomorrow = await tomorrowKeyEventLines();

  const header = [
    "━━━━━━━━━━━━━━━━━━━━━",
    "📊 <b>CTP DAILY REPORT</b>",
    "<i>یەکەمین پلاتفۆرمی ترەیدینگی کوردی</i>",
    "━━━━━━━━━━━━━━━━━━━━━",
    `📅 ${esc(dateLabel)}`,
    "",
    "💰 <b>Market Performance:</b>",
    dailyPerfLine(gold, "🥇", "Gold"),
    dailyPerfLine(oil, "🛢", "Oil"),
    dailyPerfLine(btc, "₿", "BTC"),
    "",
  ];
  const tomorrowBlock = [
    "📊 <b>Tomorrow's Key Events / ئیڤێنتی سبەی:</b>",
    tomorrow.length ? tomorrow.join("\n") : "🕐 No high-impact events · هیچ ئیڤێنتێک نییە",
    "",
  ];
  const footer = [
    "━━━━━━━━━━━━━━━━━━━━━",
    "📱 t.me/goldmarketai",
    "━━━━━━━━━━━━━━━━━━━━━",
    "<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>",
  ];

  // Today's closed signals (target_hit / stopped_out).
  const startUtc = new Date(`${day}T00:00:00.000Z`).toISOString();
  const { data: closed } = await admin.from("ai_signals")
    .select("asset, signal, entry, close_price, status, result_pips, market_session, closed_at")
    .gte("closed_at", startUtc)
    .in("status", ["target_hit", "stopped_out"]);
  const rows = (closed ?? []) as DailyRow[];

  const sigText = (r: DailyRow) => {
    const meta = ASSET_META[r.asset] ?? { emoji: "🥇", name: r.asset };
    const entry = Number(r.entry) || 0;
    const close = Number(r.close_price) || 0;
    const delta = r.signal === "SELL" ? entry - close : close - entry;
    return { meta, entry, close, delta };
  };

  // No closed signals today → still send a full report (prices + tomorrow events).
  if (rows.length === 0) {
    return [
      ...header,
      "🤖 <b>Bot Results:</b>",
      "Total Signals: 0",
      "<i>هیچ سیگناڵێک ئەمڕۆ نەداخرا</i>",
      "",
      ...tomorrowBlock,
      ...footer,
    ].join("\n");
  }

  // Totals.
  const trades = rows.length;
  const won = rows.filter((r) => r.status === "target_hit").length;
  const lost = rows.filter((r) => r.status === "stopped_out").length;
  const winRate = trades ? Math.round((won / trades) * 100) : 0;
  const totalPips = rows.reduce((s, r) => s + rowPips(r), 0);
  const netPl = pipsToDollars(totalPips);
  const netDot = netPl >= 0 ? "🟢" : "🔴";

  // Best winning signal & worst losing signal.
  const winners = rows.filter((r) => r.status === "target_hit").sort((a, b) => rowPips(b) - rowPips(a));
  const losers = rows.filter((r) => r.status === "stopped_out").sort((a, b) => rowPips(a) - rowPips(b));
  const best = winners[0];
  const worst = losers[0];
  const bestPl = best ? pipsToDollars(rowPips(best)) : 0;
  const worstPl = worst ? pipsToDollars(rowPips(worst)) : 0;

  const lines: string[] = [
    ...header,
    "🤖 <b>Bot Results:</b>",
    `Total Signals: ${trades}`,
    `✅ Won: ${won} (${winRate}% win rate)`,
    `❌ Lost: ${lost}`,
    `💰 Total P/L: ${netDot} ${plStr(netPl)}`,
    `📈 Best: ${plStr(bestPl)} · 📉 Worst: ${plStr(worstPl)}`,
    "",
  ];

  if (best) {
    const b = sigText(best);
    lines.push(
      "🏆 <b>Signal of the Day / سیگناڵی ڕۆژ:</b>",
      `${b.meta.name} ${best.signal} $${fmt(b.entry)} → $${fmt(b.close)}`,
      `${plStr(bestPl)} · ${pipsStr(rowPips(best))} pips ✅`,
      "",
    );
  }

  lines.push(...tomorrowBlock, ...footer);
  return lines.join("\n");
}



// ───────────────────── weekly report (Monday 08:00 BST) ─────────────────────
// Summarizes the previous trading week (Mon–Fri that just ended): gold range,
// bot performance, and best/worst signal. Deduped per week via market_alert_state.
async function evaluateWeeklySummary(opts?: { force?: boolean }): Promise<string | null> {
  const now = new Date();
  // London-clock weekday + hour (handles BST/GMT automatically).
  const lon = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const weekKey = (() => {
    // ISO-ish key of THIS Monday (London) so we only post once per week.
    const d = new Date(lon);
    const diff = (d.getDay() + 6) % 7; // days since Monday
    d.setDate(d.getDate() - diff);
    return d.toISOString().slice(0, 10);
  })();

  if (!opts?.force) {
    if (lon.getDay() !== 1 || lon.getHours() !== 8) return null; // Monday 08:00 BST/GMT
    const state = await getState("weekly_summary");
    if (state.lastWeek === weekKey) return null;
    await setState("weekly_summary", { lastWeek: weekKey });
  }

  // Previous week window: last Monday 00:00 → this Monday 00:00 (UTC dates).
  const todayUtc = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const dow = (todayUtc.getUTCDay() + 6) % 7; // days since Monday (UTC)
  const thisMonday = new Date(todayUtc);
  thisMonday.setUTCDate(thisMonday.getUTCDate() - dow);
  const prevMonday = new Date(thisMonday);
  prevMonday.setUTCDate(prevMonday.getUTCDate() - 7);
  const startUtc = prevMonday.toISOString();
  const endUtc = thisMonday.toISOString();
  const prevFriday = new Date(prevMonday);
  prevFriday.setUTCDate(prevFriday.getUTCDate() + 4);

  const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const yearLabel = prevFriday.getUTCFullYear();
  const weekLabel = `${fmtDay(prevMonday)}-${prevFriday.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" })}, ${yearLabel}`;

  const header = [
    "━━━━━━━━━━━━━━━",
    "📊 <b>CTP WEEKLY REPORT</b>",
    "<i>هەفتەنامەی CTP</i>",
    "━━━━━━━━━━━━━━━",
    `📅 Week: ${weekLabel}`,
    "",
  ];
  const footer = [
    "📱 t.me/goldmarketai",
    "━━━━━━━━━━━━━━━",
    `<i>🕒 ${nowStamp()}</i>`,
    "<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>",
  ];

  const { data: closed } = await admin.from("ai_signals")
    .select("asset, signal, entry, close_price, status, result_pips, market_session, closed_at")
    .gte("closed_at", startUtc)
    .lt("closed_at", endUtc)
    .in("status", ["target_hit", "stopped_out"]);
  const rows = (closed ?? []) as DailyRow[];

  if (rows.length === 0) {
    return [
      ...header,
      "😴 <b>No signals closed last week</b>",
      "<i>هیچ سیگناڵێک هەفتەی ڕابردوو نەهاتە تەواوبوون</i>",
      "",
      ...footer,
    ].join("\n");
  }

  // Gold performance from this week's gold signal price points.
  const goldRows = rows.filter((r) => r.asset === "XAU/USD");
  const goldPrices = goldRows.flatMap((r) => [Number(r.entry), Number(r.close_price)]).filter((n) => Number.isFinite(n) && n > 0);
  let goldBlock: string[] = [];
  if (goldPrices.length) {
    const high = Math.max(...goldPrices);
    const low = Math.min(...goldPrices);
    const first = Number(goldRows[0]?.entry) || goldPrices[0];
    const last = Number(goldRows[goldRows.length - 1]?.close_price) || goldPrices[goldPrices.length - 1];
    const chg = last - first;
    const chgPct = first ? (chg / first) * 100 : 0;
    const sign = chg >= 0 ? "+" : "-";
    goldBlock = [
      "🥇 <b>GOLD PERFORMANCE:</b>",
      `High: <code>$${fmt(high)}</code> | Low: <code>$${fmt(low)}</code>`,
      `Weekly Change: ${sign}$${fmt(Math.abs(chg))} (${sign}${Math.abs(chgPct).toFixed(2)}%)`,
      "",
    ];
  }

  // Bot performance totals.
  const trades = rows.length;
  const won = rows.filter((r) => r.status === "target_hit").length;
  const lost = rows.filter((r) => r.status === "stopped_out").length;
  const winRate = trades ? Math.round((won / trades) * 100) : 0;
  const totalPips = rows.reduce((s, r) => s + rowPips(r), 0);
  const netPl = pipsToDollars(totalPips);
  const netDot = netPl >= 0 ? "🟢" : "🔴";

  const winners = rows.filter((r) => r.status === "target_hit").sort((a, b) => rowPips(b) - rowPips(a));
  const losers = rows.filter((r) => r.status === "stopped_out").sort((a, b) => rowPips(a) - rowPips(b));
  const best = winners[0];
  const worst = losers[0];
  const sigText = (r: DailyRow) => {
    const meta = ASSET_META[r.asset] ?? { emoji: "🥇", name: r.asset };
    const entry = Number(r.entry) || 0;
    const close = Number(r.close_price) || 0;
    const delta = r.signal === "SELL" ? entry - close : close - entry;
    return { meta, entry, close, delta };
  };

  const lines: string[] = [
    ...header,
    ...goldBlock,
    "📊 <b>BOT PERFORMANCE:</b>",
    `Total Signals: ${trades}`,
    `✅ Won: ${won} (${winRate}% win rate)`,
    `❌ Lost: ${lost}`,
    `💰 Total Pips: ${pipsStr(totalPips)}`,
    `💵 Net P/L: ${netDot} ${plStr(netPl)}`,
    "",
  ];

  if (best) {
    const b = sigText(best);
    lines.push(
      "🏆 <b>Best Signal of Week:</b>",
      `${b.meta.emoji} ${b.meta.name} ${best.signal} @ <code>$${fmt(b.entry)}</code> → <code>$${fmt(b.close)}</code>`,
      `${b.delta >= 0 ? "+" : "-"}$${fmt(Math.abs(b.delta))} | ${pipsStr(rowPips(best))} pips ✅`,
      "",
    );
  }
  if (worst) {
    const w = sigText(worst);
    lines.push(
      "❌ <b>Worst Signal:</b>",
      `${w.meta.emoji} ${w.meta.name} ${worst.signal} @ <code>$${fmt(w.entry)}</code> → SL <code>$${fmt(w.close)}</code>`,
      `${w.delta >= 0 ? "+" : "-"}$${fmt(Math.abs(w.delta))} | ${pipsStr(rowPips(worst))} pips`,
      "",
    );
  }

  // Speed competition: which news source was fastest this week.
  const speedLine = await fastestSourceLine();
  if (speedLine) lines.push("⚡ <b>SPEED COMPETITION:</b>", speedLine, "");

  lines.push(...footer);
  return lines.join("\n");
}

// ───────────────────── pinned message + channel description (Monday 08:00 BST) ─────────────────────
// Computes the last 7 days' signal stats and refreshes BOTH the channel's pinned
// stats message and its public description/bio. Deduped per week via
// market_alert_state["pin_update"].lastWeek. Runs alongside the weekly report.
async function evaluatePinnedAndDescription(opts?: { force?: boolean }): Promise<{ pinned: boolean; description: boolean } | null> {
  const now = new Date();
  const lon = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const weekKey = (() => {
    const d = new Date(lon);
    const diff = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - diff);
    return d.toISOString().slice(0, 10);
  })();

  if (!opts?.force) {
    if (lon.getDay() !== 1 || lon.getHours() !== 8) return null; // Monday 08:00 BST/GMT
    const state = await getState("pin_update");
    if (state.lastWeek === weekKey) return null;
    await setState("pin_update", { lastWeek: weekKey });
  }

  // Last 7 days of closed signals → total + win rate.
  const sinceUtc = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
  const { data: closed } = await admin.from("ai_signals")
    .select("status")
    .gte("closed_at", sinceUtc)
    .in("status", ["target_hit", "stopped_out"]);
  const rows = (closed ?? []) as { status: string }[];
  const total = rows.length;
  const won = rows.filter((r) => r.status === "target_hit").length;
  const winRate = total ? Math.round((won / total) * 100) : 0;
  const subs = await getChannelMemberCount();
  const subsLine = subs !== null ? `👥 ${subs.toLocaleString("en-US")} subscribers` : "";

  // 1) Pinned stats message.
  const pinText = [
    "📌 <b>CTP Gold Signals</b>",
    `This week: ${total} signals | ${winRate}% win rate`,
    "Join: t.me/goldmarketai",
  ].join("\n");
  const pinned = await pinChannelMessage("ctp_pin", pinText);

  // 2) Channel description / bio (Telegram caps at 255 chars).
  const descText = [
    "🥇 CTP Gold Signals",
    `Last week: ${winRate}% win rate`,
    "Signals: Gold|Oil|BTC",
    "Free | Real-time | Kurdish+English",
    subsLine,
  ].filter(Boolean).join("\n");
  const description = await setChannelDescription(descText);

  return { pinned, description };
}

// ───────────────────── monthly report (1st of month 09:00 BST) ─────────────────────
// Summarizes the previous calendar month: gold range, bot performance, best week,
// signal of the month, and the next month's key events. Deduped per month via
// market_alert_state["monthly_summary"].monthKey.
async function evaluateMonthlySummary(opts?: { force?: boolean }): Promise<string | null> {
  const now = new Date();
  const lon = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }));
  // Key of the month we are reporting ON (the previous calendar month).
  const monthKey = (() => {
    const y = lon.getFullYear();
    const m = lon.getMonth(); // 0-based current month
    const prev = new Date(Date.UTC(y, m - 1, 1));
    return prev.toISOString().slice(0, 7); // YYYY-MM of previous month
  })();

  if (!opts?.force) {
    // Fire on the 1st of the month at 09:00 London time.
    if (lon.getDate() !== 1 || lon.getHours() !== 9) return null;
    const state = await getState("monthly_summary");
    if (state.lastMonth === monthKey) return null;
    await setState("monthly_summary", { lastMonth: monthKey });
  }

  // Previous calendar month window (UTC): [firstOfPrev, firstOfThis).
  const todayUtc = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const firstOfThis = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), 1));
  const firstOfPrev = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() - 1, 1));
  const startUtc = firstOfPrev.toISOString();
  const endUtc = firstOfThis.toISOString();
  const monthLabel = firstOfPrev.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const nextMonthLabel = firstOfThis.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  const header = [
    "━━━━━━━━━━━━━━━",
    "📊 <b>CTP MONTHLY REPORT</b>",
    "<i>ڕاپۆرتی مانگانەی CTP</i>",
    "━━━━━━━━━━━━━━━",
    `📅 ${monthLabel} Summary`,
    "",
  ];
  const footer = [
    "📱 t.me/goldmarketai",
    "━━━━━━━━━━━━━━━",
    `<i>🕒 ${nowStamp()}</i>`,
    "<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>",
  ];

  // Build the "Next Month Outlook" from upcoming high-impact events regardless of
  // whether any signals closed last month.
  const outlookBlock = await (async (): Promise<string[]> => {
    const { data: ev } = await admin.from("economic_events")
      .select("title, currency, impact, event_time")
      .gte("event_time", endUtc)
      .lt("event_time", new Date(Date.UTC(firstOfThis.getUTCFullYear(), firstOfThis.getUTCMonth() + 1, 1)).toISOString())
      .order("event_time", { ascending: true });
    const highImpact = (ev ?? []).filter((e) =>
      String(e.impact ?? "").toLowerCase().includes("high") || String(e.impact ?? "") === "3");
    const picks = (highImpact.length ? highImpact : (ev ?? [])).slice(0, 4);
    const block: string[] = ["📊 <b>Next Month Outlook:</b>", `<i>ئاراستەی ${nextMonthLabel}</i>`];
    if (picks.length) {
      for (const e of picks) {
        const d = new Date(e.event_time as string);
        const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
        block.push(`• ${day} — ${esc(String(e.title))} (${esc(String(e.currency))})`);
      }
    } else {
      block.push("• Watch FOMC, NFP & CPI releases · چاودێری ڕووداوە گرنگەکان بکە");
    }
    return block;
  })();

  const { data: closed } = await admin.from("ai_signals")
    .select("asset, signal, entry, close_price, status, result_pips, market_session, closed_at")
    .gte("closed_at", startUtc)
    .lt("closed_at", endUtc)
    .in("status", ["target_hit", "stopped_out"]);
  const rows = (closed ?? []) as (DailyRow & { closed_at: string })[];

  if (rows.length === 0) {
    return [
      ...header,
      "😴 <b>No signals closed last month</b>",
      "<i>هیچ سیگناڵێک مانگی ڕابردوو نەهاتە تەواوبوون</i>",
      "",
      ...outlookBlock,
      "",
      ...footer,
    ].join("\n");
  }

  // Gold performance.
  const goldRows = rows.filter((r) => r.asset === "XAU/USD");
  const goldPrices = goldRows.flatMap((r) => [Number(r.entry), Number(r.close_price)]).filter((n) => Number.isFinite(n) && n > 0);
  let goldBlock: string[] = [];
  if (goldPrices.length) {
    const high = Math.max(...goldPrices);
    const low = Math.min(...goldPrices);
    const first = Number(goldRows[0]?.entry) || goldPrices[0];
    const last = Number(goldRows[goldRows.length - 1]?.close_price) || goldPrices[goldPrices.length - 1];
    const chg = last - first;
    const chgPct = first ? (chg / first) * 100 : 0;
    const sign = chgPct >= 0 ? "+" : "-";
    goldBlock = [
      "🥇 <b>GOLD:</b>",
      `Monthly High: <code>$${fmt(high)}</code>`,
      `Monthly Low: <code>$${fmt(low)}</code>`,
      `Monthly Change: ${sign}${Math.abs(chgPct).toFixed(1)}%`,
      "",
    ];
  }

  // Bot stats.
  const trades = rows.length;
  const won = rows.filter((r) => r.status === "target_hit").length;
  const winRate = trades ? Math.round((won / trades) * 100) : 0;
  const totalPips = rows.reduce((s, r) => s + rowPips(r), 0);
  const netPl = pipsToDollars(totalPips);
  const netDot = netPl >= 0 ? "🟢" : "🔴";

  // Best week of the month: group by ISO-week (Monday) and pick the highest P/L.
  const weekPl = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(r.closed_at);
    const diff = (d.getUTCDay() + 6) % 7;
    const monday = new Date(d);
    monday.setUTCDate(monday.getUTCDate() - diff);
    const key = monday.toISOString().slice(0, 10);
    weekPl.set(key, (weekPl.get(key) ?? 0) + pipsToDollars(rowPips(r)));
  }
  const sortedWeeks = [...weekPl.entries()].sort((a, b) => b[1] - a[1]);
  let bestWeekLine = "";
  if (sortedWeeks.length) {
    const [bestMonday, bestPl] = sortedWeeks[0];
    // Week number within the month (1-based).
    const weekNum = Math.floor((new Date(bestMonday).getUTCDate() - 1) / 7) + 1;
    bestWeekLine = `Best Week: Week ${weekNum} (${plStr(bestPl)})`;
  }

  // Signal of the month (highest pips winner).
  const winners = rows.filter((r) => r.status === "target_hit").sort((a, b) => rowPips(b) - rowPips(a));
  const best = winners[0];

  const lines: string[] = [
    ...header,
    ...goldBlock,
    "🤖 <b>BOT STATS:</b>",
    `Total Signals: ${trades}`,
    `Win Rate: ${winRate}%`,
  ];
  if (bestWeekLine) lines.push(bestWeekLine);
  lines.push(`Total P/L: ${netDot} ${plStr(netPl)}`, "");

  if (best) {
    const meta = ASSET_META[best.asset] ?? { emoji: "🥇", name: best.asset };
    const entry = Number(best.entry) || 0;
    const close = Number(best.close_price) || 0;
    const delta = best.signal === "SELL" ? entry - close : close - entry;
    lines.push(
      "🏆 <b>Signal of the Month:</b>",
      `${meta.emoji} ${meta.name} ${best.signal} @ <code>$${fmt(entry)}</code> → <code>$${fmt(close)}</code>`,
      `${delta >= 0 ? "+" : "-"}$${fmt(Math.abs(delta))} | ${pipsStr(rowPips(best))} pips ✅`,
      "",
    );
  }

  lines.push(...outlookBlock, "", ...footer);
  return lines.join("\n");
}

// (channel-growth milestones + weekly stats removed)



Deno.serve(async (req) => {

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* cron sends none */ }
    const loop = body.loop !== false; // default true; pass {loop:false} for a single pass
    const test = body.test === true;  // pass {test:true} to force a sample report to Telegram
    // Force mode: immediately broadcast a first signal for the given assets (default GOLD/OIL/BITCOIN),
    // bypassing the freshness / cooldown / strong-move guards. Seeds state so the cascade + continuous flow keep running.
    const force = body.force === true || Array.isArray(body.force);

    // Diagnostic mode: {"analyze": true} → returns the raw engine analysis (same
    // core as the app) for GOLD/OIL/BITCOIN as JSON. Posts NOTHING to Telegram.
    // Used to verify the bot signal == app signal (direction, confidence, RSI/MACD/EMA).
    if (body.analyze === true) {
      const quotes = await getPrices();
      const out = quotes.map((q) => ({
        symbol: q.symbol,
        livePrice: q.price,
        dayChangePct: q.changePct,
        botSignal: quoteSignal(q),
        confidence: quoteConfidence(q),
        engine: q.eng
          ? {
              action: q.eng.action,
              score: q.eng.score,
              price: q.eng.price,
              rsi: q.eng.rsi,
              macd: q.eng.macd,
              ema20: q.eng.ema20,
              ema50: q.eng.ema50,
              atr: q.eng.atr,
              entry: q.eng.entry,
              stopLoss: q.eng.stopLoss,
              takeProfit1: q.eng.takeProfit1,
              takeProfit2: q.eng.takeProfit2,
              riskReward: q.eng.riskReward,
              confScore: q.eng.confScore,
              confDir: q.eng.confDir,
              confluenceAlignment: q.eng.confluenceAlignment,
              conflict: q.eng.conflict,
              perTF: q.eng.perTF.map((t) => ({ label: t.label, dir: t.dir, rsi: t.rsi ? +t.rsi.toFixed(1) : null })),
            }
          : null,
      }));
      return new Response(JSON.stringify({ ok: true, ts: new Date().toISOString(), assets: out }, null, 2),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    // Config mode: read or set which market regions may open new targets.
    //   {"getConfig": true}                       → returns current enabled regions
    //   {"setRegions": ["Asia","London"]}         → updates enabled regions (empty ⇒ all)
    if (body.getConfig === true) {
      const regions = await getEnabledRegions();
      return new Response(JSON.stringify({ ok: true, regions, all: ALL_REGIONS, openNow: activeRegion(new Date(), regions) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (Array.isArray(body.setRegions)) {
      const regions = await setEnabledRegions(body.setRegions as string[]);
      return new Response(JSON.stringify({ ok: true, regions, all: ALL_REGIONS }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Daily report preview/send.
    //   {"dailyPreview": true}  → build & RETURN the report (does NOT post to Telegram)
    //   {"dailySend": true}     → build the report and post it to the channel now
    if (body.dailyPreview === true || body.dailySend === true) {
      const report = await evaluateDailySummary([], { force: true });
      let sent = false;
      if (body.dailySend === true && report) {
        sent = await sendTelegram("ctp_daily", report);
      }
      return new Response(JSON.stringify({ ok: true, sent, report }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Weekly report preview/send (bypasses the time + dedupe gates):
    //   {"weeklyPreview": true}  → build & RETURN the report (does NOT post)
    //   {"weeklySend": true}     → build the report and post it to the channel now
    if (body.weeklyPreview === true || body.weeklySend === true) {
      const report = await evaluateWeeklySummary({ force: true });
      let sent = false;
      if (body.weeklySend === true && report) {
        sent = await sendTelegram("ctp_weekly", report);
      }
      return new Response(JSON.stringify({ ok: true, sent, report }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Monthly report preview/send (bypasses the time + dedupe gates):
    //   {"monthlyPreview": true}  → build & RETURN the report (does NOT post)
    //   {"monthlySend": true}     → build the report and post it to the channel now
    if (body.monthlyPreview === true || body.monthlySend === true) {
      const report = await evaluateMonthlySummary({ force: true });
      let sent = false;
      if (body.monthlySend === true && report) {
        sent = await sendTelegram("ctp_monthly", report);
      }
      return new Response(JSON.stringify({ ok: true, sent, report }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Pinned message + channel description refresh (bypasses the time + dedupe gates):
    //   {"pinUpdate": true}  → recompute weekly stats, repin the stats message, and
    //                          update the channel description right now.
    if (body.pinUpdate === true) {
      const r = await evaluatePinnedAndDescription({ force: true });
      return new Response(JSON.stringify({ ok: true, ...r }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    //   {"sessionPreview": "open"|"close"}  → build & RETURN all 3 region messages
    //   {"sessionSend": "open"|"close"}     → also post them to Telegram now
    const sp = (body.sessionPreview ?? body.sessionSend) as string | undefined;
    if (sp === "open" || sp === "close") {
      const now = new Date();
      const day = now.toISOString().slice(0, 10);
      const quotes = await getPrices();
      const posts: { region: Region; text: string }[] = [];
      for (const region of ALL_REGIONS) {
        const text = sp === "open"
          ? await sessionOpenMessage(region, quotes, now)
          : await sessionCloseMessage(region, quotes, day);
        posts.push({ region, text });
      }
      let sent = 0;
      if (body.sessionSend) {
        for (const p of posts) if (await sendTelegram(`ctp_session_${sp}`, p.text)) sent++;
      }
      return new Response(JSON.stringify({ ok: true, kind: sp, sent, posts }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }





    // News preview: fetch ALL sources live, show coverage + the rendered cards
    // (new BREAKING format) WITHOUT posting or touching dedupe/state.
    //   {"newsPreview": true}
    if (body.newsPreview === true) {
      const quotes = await getPrices();
      const priceBySymbol: Record<string, number> = {};
      for (const q of quotes) priceBySymbol[q.symbol] = q.price;
      const news = await fetchNews();
      // Source coverage counts.
      const coverage: Record<string, number> = {};
      for (const n of news) coverage[n.source] = (coverage[n.source] ?? 0) + 1;
      const top = news.slice(0, 5);
      const enriched = await enrichNews(top, priceBySymbol);
      const cards = top.map((n, i) => {
        const e = enriched[i] ?? { titleKu: "", summaryEn: n.summary, summaryKu: "", impact: "NEUTRAL" as Impact, impactGold: "NEUTRAL" as Impact, impactOil: "NEUTRAL" as Impact, impactBtc: "NEUTRAL" as Impact, urgency: "INFO" as Urgency, tipEn: "", tipKu: "", relatedEn: "", relatedKu: "" };
        const freshU = freshnessUrgency(minAgo(n.pubDate));
        e.urgency = (URGENCY_RANK[freshU] ?? 1) >= (URGENCY_RANK[e.urgency] ?? 1) ? freshU : e.urgency;
        return { source: n.source, ageMin: minAgo(n.pubDate), urgency: e.urgency, card: newsBlockItem(n, e) };
      });
      const speed = await fastestSourceLine();
      return new Response(JSON.stringify({ ok: true, totalItems: news.length, sources: NEWS_SOURCES.length, coverage, fastestSource: speed, cards }, null, 2),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Test mode: send a full bilingual CTP APP REPORTS sample right now so you can

    // confirm it lands in the bot chat — bypasses the dedupe/trigger logic.
    if (test) {
      const quotes = await getPrices();
      const priceBlock = quotes.map((q) => priceLine(q, quoteSignal(q)));

      // Build a sample full trade signal + a sample TP outcome. Uses the engine's
      // ATR levels when available (same as live), else a percentage sample.
      const sample = quotes[0] ?? { symbol: "XAU/USD", price: 4275, changePct: 0.3 } as Quote;
      const sm = ASSET_META[sample.symbol] ?? ASSET_META["XAU/USD"];
      const sLv = quoteLevels(sample, "BUY");
      const sampleEntry = sLv.entry;
      const sampleTp = sLv.tp;
      const sampleSl = sLv.sl;
      const sTpPips = toPips(sampleTp - sampleEntry, sm.pip);
      const sSlPips = toPips(sampleSl - sampleEntry, sm.pip);
      const signalSample = newSignalLine(sample, "BUY", sampleEntry, sampleTp, sampleSl, sTpPips, sSlPips, 78, sessionLabel());
      const outcomeSample = outcomeLine(sample.symbol, "BUY", "tp", sampleEntry, sampleTp, sTpPips);

      const liveNews = (await fetchNews()).slice(0, 3);
      const testPriceBySymbol: Record<string, number> = {};
      for (const q of quotes) testPriceBySymbol[q.symbol] = q.price;
      const newsEnriched = await enrichNews(liveNews, testPriceBySymbol);
      const newsBlock = liveNews.map((n, i) => newsBlockItem(n, newsEnriched[i] ?? { titleKu: "", summaryEn: n.summary, summaryKu: "", impact: "NEUTRAL" as Impact, impactGold: "NEUTRAL" as Impact, impactOil: "NEUTRAL" as Impact, impactBtc: "NEUTRAL" as Impact, urgency: "INFO" as Urgency, tipEn: "", tipKu: "", relatedEn: "", relatedKu: "" }));
      const lines: string[] = [
        "📊 <b>CTP APP REPORTS</b>",
        "<i>Market News & Analysis · هەواڵ و شیکاری بازاڕ</i>",
        "<i>🧪 TEST / تاقیکردنەوە</i>",
        "━━━━━━━━━━━━━━━",
        "",
        "🚨 <b>New Signals / سیگنالی نوێ</b>",
        "",
        signalSample,
        "",
        "🏁 <b>Signal Results / ئەنجامی سیگنال</b>",
        "",
        outcomeSample,
        "",
        "📈 <b>Analysis / شیکاری بازاڕ</b>",
        "",
        priceBlock.length ? priceBlock.join("\n\n") : "—",
        "",
      ];
      lines.push("━━━━━━━━━━━━━━━");
      lines.push(`<i>🕒 ${nowStamp()}</i>`);
      lines.push(`<i>Not financial advice · ئەمە ڕاوێژی دارایی نییە</i>`);
      const ok = await sendTelegram("ctp_report_test", lines.join("\n"));
      // News goes out as separate messages (each rich block can exceed Telegram's
      // 4096-char limit if bundled), matching the production news flow.
      let newsSent = 0;
      for (const block of newsBlock) {
        if (await sendTelegram("ctp_news", oneNewsMessage(block))) newsSent++;
      }
      return new Response(JSON.stringify({ ok: true, sent: ok, mode: "test", quotes: quotes.length, news: newsBlock.length, newsSent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Force mode: send a fresh first signal NOW for the requested assets (default GOLD/OIL/BITCOIN).
    if (force) {
      const wanted: string[] = Array.isArray(body.force) && body.force.length
        ? (body.force as unknown[]).map((x) => String(x).toUpperCase())
        : ["GOLD", "OIL", "BITCOIN"];
      // Map friendly names → asset symbols (BITCOIN/BTC → BTC/USD, GOLD → XAU/USD, OIL → WTI/USD).
      const nameToSymbol: Record<string, string> = {};
      for (const [symbol, meta] of Object.entries(ASSET_META)) {
        nameToSymbol[meta.name.toUpperCase()] = symbol;
        nameToSymbol[symbol.toUpperCase()] = symbol;
      }
      const aliases: Record<string, string> = { BITCOIN: "BTC/USD", BTC: "BTC/USD", GOLD: "XAU/USD", OIL: "WTI/USD", CRUDE: "WTI/USD", WTI: "WTI/USD" };

      const quotes = await getPrices();
      const priceState = await getState("prices");
      const openState = await getState("open_signals");
      const tfQueue = ((await getState("tf_queue")).items as TfQueueItem[]) ?? [];
      const enabledRegions = await getEnabledRegions();
      const forcedAlerts: SignalMsg[] = [];
      const forcedSymbols: string[] = [];

      for (const name of wanted) {
        const symbol = aliases[name] ?? nameToSymbol[name];
        if (!symbol) continue;
        const m = ASSET_META[symbol];
        if (!m) continue;
        const q = quotes.find((x) => x.symbol === symbol);
        if (!q) continue;

        // Direction from the SAME engine as the app (action → score lean → flat fallback).
        const ea = q.eng?.action;
        const sig: "BUY" | "SELL" =
          ea === "sell" ? "SELL"
          : ea === "buy" ? "BUY"
          : q.eng && q.eng.score < 0 ? "SELL"
          : q.eng && q.eng.score > 0 ? "BUY"
          : q.changePct < 0 ? "SELL" : "BUY";
        // ATR-based levels from the SAME engine as the app — identical entry/SL/TP.
        const { entry, tp, sl, tp2 } = quoteLevels(q, sig);
        const tpPips = toPips(tp - entry, m.pip);
        const slPips = toPips(sl - entry, m.pip);
        const tp2Pips = toPips(tp2 - entry, m.pip);
        const confidence = quoteConfidence(q);
        const session = sessionLabel(new Date(), enabledRegions);

        const reason = "🚀 First signal (manual start) · یەکەم سیگنال (دەستپێکی دەستی)";
        const now = Date.now();
        const newLegs: OpenLeg[] = [];
        for (const tfDef of TIMEFRAME_CASCADE) {
          const activeFrom = now + tfDef.delayMs;
          const expiresAt = activeFrom + (TF_PERIOD_MS[tfDef.tf] ?? TF_PERIOD_MS["15M"]);

          const { data: ins } = await admin.from("ai_signals").insert({
            asset: m.name, signal: sig, entry, tp, tp2, sl, confidence,
            status: "open", outcome: "open", market_session: session,
            tp_pips: tpPips, sl_pips: slPips, tp2_pips: tp2Pips,
            timeframe: tfDef.tf,
          }).select("id").maybeSingle();

          const tfReason = `${reason} · ⏱ ${tfDef.tf}`;
          const text = newSignalLine(q, sig, entry, tp, sl, tpPips, slPips, confidence, session, tfDef.tf);
          if (tfDef.delayMs === 0) forcedAlerts.push({ text, important: true, reason: tfReason });
          else tfQueue.push({ dueAt: activeFrom, text, reason: tfReason, symbol: m.name, tf: tfDef.tf });
          newLegs.push({
            id: ins?.id as string | undefined,
            signal: sig, entry, tp, tp2, sl, tf: tfDef.tf, activeFrom, expiresAt,
          });
        }

        openState[symbol] = newLegs;

        priceState[symbol] = { price: q.price, signal: sig, lastSignalAt: now, lastSignalDir: sig, lastAuditKey: "sent:fresh" };
        await admin.from("signal_audit_log").insert({
          symbol: m.name, signal: sig, price: q.price, change_pct: q.changePct, outcome: "sent", reason: "forced",
        });
        forcedSymbols.push(m.name);
      }

      await setState("prices", priceState);
      await setState("open_signals", openState);
      await setState("tf_queue", { items: tfQueue.slice(-200) });

      let forcedSent = 0;
      for (const sig of forcedAlerts) {
        if (await sendTelegram("ctp_signal", oneSignalMessage("New Trade Target · تارگێتی نوێ", sig.text, sig.reason))) forcedSent++;
      }

      return new Response(JSON.stringify({ ok: true, mode: "force", assets: forcedSymbols, sent: forcedSent, scheduled: tfQueue.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }




    const signalAlerts: SignalMsg[] = [];
    const outcomeAlerts: string[] = [];
    let lastQuotes: Quote[] = [];

    if (loop) {
      const start = Date.now();
      while (Date.now() - start < LOOP_WINDOW_MS) {
        const r = await evaluatePrices();
        signalAlerts.push(...r.signalAlerts);
        outcomeAlerts.push(...r.outcomeAlerts);
        lastQuotes = r.quotes;
        if (Date.now() - start + PRICE_INTERVAL_MS >= LOOP_WINDOW_MS) break;
        await sleep(PRICE_INTERVAL_MS);
      }
    } else {
      const r = await evaluatePrices();
      signalAlerts.push(...r.signalAlerts);
      outcomeAlerts.push(...r.outcomeAlerts);
      lastQuotes = r.quotes;
    }

    // Calendar once per invocation (≈60s cadence).
    const { calendarAlerts, signalAlerts: calSignals, specialAlerts } = await evaluateCalendar();
    // News cadence:
    //  • When the 60-min digest window is open → full evaluation (BREAKING +
    //    IMPORTANT + INFO digest items).
    //  • Between digests (every ~minute cron) → BREAKING-only fast path so
    //    genuinely fresh (<5 min) breaking news is posted immediately without
    //    waiting for the hourly window, while INFO stays in the digest.
    const newsThrottle = await getState("news_throttle");
    const lastNewsAt = (newsThrottle.lastAt as number) ?? 0;
    const newsWindowOpen = !lastNewsAt || Date.now() - lastNewsAt >= NEWS_MIN_GAP_MS;
    const newsAlerts = newsWindowOpen
      ? await evaluateNews(lastQuotes)
      : await evaluateNews(lastQuotes, { breakingOnly: true });
    // Scheduled session OPEN / CLOSE posts (fire at exact UTC session hours).
    const sessionPosts = await evaluateSessionPosts();
    // End-of-day report (only fires during the 21:00 UTC / 22:00 BST hour).
    const dailySummary = await evaluateDailySummary(lastQuotes);
    // Weekly report (only fires Monday 08:00 BST, deduped per week).
    const weeklySummary = await evaluateWeeklySummary();
    // Monthly report (only fires 1st of month 09:00 BST, deduped per month).
    const monthlySummary = await evaluateMonthlySummary();
    // Pinned stats message + channel description refresh (Monday 08:00 BST, deduped per week).
    const pinUpdate = await evaluatePinnedAndDescription();

    // News-driven targets join the price targets — all sent as separate messages.
    signalAlerts.push(...calSignals);

    // Higher-timeframe cascade: any 15M/30M/1H signals whose staggered send time
    // has arrived are added now (important ⇒ bypass throttle so they always post).
    const dueTfSignals = await drainDueTimeframeSignals();
    for (const item of dueTfSignals) {
      signalAlerts.push({ text: item.text, important: true, reason: item.reason });
    }

    let sent = false;
    let targetsSent = 0;

    // 0) SESSION OPEN / CLOSE posts → one standalone message each, logged per day.
    for (const p of sessionPosts) {
      const ok = await sendTelegram(`ctp_session_${p.kind}`, p.text);
      sent = ok || sent;
      if (ok) await recordSessionPost(p.region, p.kind, new Date().toISOString().slice(0, 10));
    }


    // 0b) FOMC/NFP special 🚨 alerts → each as its own high-priority message.
    for (const s of specialAlerts) {
      sent = (await sendTelegram("ctp_special", s)) || sent;
    }

    // 0c) Daily summary at 22:00 BST.
    if (dailySummary) {
      sent = (await sendTelegram("ctp_daily", dailySummary)) || sent;
    }

    // 0d) Weekly report on Monday 08:00 BST.
    if (weeklySummary) {
      sent = (await sendTelegram("ctp_weekly", weeklySummary)) || sent;
    }

    // 0e) Monthly report on the 1st of the month 09:00 BST.
    if (monthlySummary) {
      sent = (await sendTelegram("ctp_monthly", monthlySummary)) || sent;
    }

    // 0f) Pinned stats + channel description refreshed on Monday 08:00 BST.
    if (pinUpdate) {
      sent = pinUpdate.pinned || pinUpdate.description || sent;
    }









    // 1) SIGNAL RESULTS (TP/SL hit) → ONLY the result, each as its own message.
    //    Content-hash deduped so the exact same result never repeats within 1h.
    for (const o of outcomeAlerts) {
      const h = contentHash(o);
      if (await wasRecentlySent(h, RESULT_DEDUPE_MS)) continue;
      const ok = await sendTelegram("ctp_result", oneResultMessage(o));
      sent = ok || sent;
      if (ok) { targetsSent++; await recordSent(h, o.slice(0, 120), "result"); }
    }

    // 2) SIGNALS → ONLY signal data, one message each, throttled to ~15–30 min
    //    unless very important. Content-hash deduped (no duplicate signals in 15m).
    if (signalAlerts.length) {
      const throttle = await getState("target_throttle");
      let lastTargetAt = (throttle.lastAt as number) ?? 0;
      for (const sig of signalAlerts) {
        const gapOk = !lastTargetAt || Date.now() - lastTargetAt >= TARGET_MIN_GAP_MS;
        // Skip ordinary targets while inside the throttle window; always send important ones.
        if (!sig.important && !gapOk) continue;
        const h = contentHash(sig.text);
        if (await wasRecentlySent(h, SIGNAL_DEDUPE_MS)) continue;
        const ok = await sendTelegram("ctp_signal", oneSignalMessage("New Trade Target · تارگێتی نوێ", sig.text, sig.reason));
        sent = ok || sent;
        if (ok) { targetsSent++; lastTargetAt = Date.now(); await recordSent(h, sig.text.slice(0, 120), "signal"); }
      }
      await setState("target_throttle", { lastAt: lastTargetAt });
    }

    // 3) CALENDAR → its own standalone message (economic events only).
    //    Calendar alerts are already gated to fire ~30min before each event.
    if (calendarAlerts.length) {
      const ok = await sendTelegram("ctp_calendar", oneCalendarMessage(calendarAlerts.join("\n\n")));
      sent = ok || sent;
    }

    // 4) NEWS → ONLY news, each item its own standalone message. Smart dedupe:
    //    a) exact-headline (2h)  b) same asset+event topic (3h)
    //    c) per-asset rate limit by urgency: 🔴 Breaking always · 🟡 Important
    //       only if asset quiet 60m · 🟢 Info only if asset quiet 2h.
    if (newsAlerts.length) {
      let anyNews = false;
      for (const item of newsAlerts) {
        // a) exact same headline already sent recently → skip
        if (await wasRecentlySent(item.hash, NEWS_DEDUPE_MS)) continue;
        // b) same asset + same event topic already covered (different wording) → skip
        if (await wasAssetEventSentWithin(item.asset, item.event, TOPIC_DEDUPE_MS)) continue;
        // c) urgency-based per-asset throttle (Breaking bypasses the hourly cap)
        if (item.urgency !== "BREAKING") {
          const window = item.urgency === "IMPORTANT" ? ASSET_HOUR_MS : URGENCY_INFO_MS;
          if (await wasAssetNewsSentWithin(item.asset, window)) continue;
        }
        const ok = await sendTelegram("ctp_news", oneNewsMessage(item.block));
        if (ok) {
          anyNews = true;
          // Speed competition: record which source delivered this story + how fresh.
          await recordSourceSpeed(item.source, item.ageMin);
          await recordSent(item.hash, item.headline, "news", {
            asset: item.asset, event: item.event, urgency: item.urgency,
          });
        }
      }
      sent = anyNews || sent;
      // Only the full hourly digest run resets the digest timer. Breaking-only
      // posts between digests must NOT delay the next INFO digest.
      if (anyNews && newsWindowOpen) await setState("news_throttle", { lastAt: Date.now() });
    }


    return new Response(
      JSON.stringify({ ok: true, sent, targetsSent, sessionPosts: sessionPosts.length, specialAlerts: specialAlerts.length, dailySummary: dailySummary ? 1 : 0, weeklySummary: weeklySummary ? 1 : 0, monthlySummary: monthlySummary ? 1 : 0, pinUpdate: pinUpdate ? 1 : 0, signalAlerts: signalAlerts.length, outcomeAlerts: outcomeAlerts.length, calendarAlerts: calendarAlerts.length, newsAlerts: newsAlerts.length, quotes: lastQuotes.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    console.error("market-intel error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
